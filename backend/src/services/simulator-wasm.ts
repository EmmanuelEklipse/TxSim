import { ApiPromise } from "@polkadot/api";
import { compactToU8a } from "@polkadot/util";
import { chopsticksService } from "./chopsticks";
import {
    WasmSimulateRequest,
    WasmSimulateResponse,
    WasmAddressState,
    WasmBalanceChange,
    WasmStateImpactReport,
    WasmGasReport,
    WasmTokenBalance,
} from "../types/wasm";
import { decodeWasmError } from "../utils/wasm-error-decoder";
import {
    decodeWasmEvents,
    filterEventsByExtrinsicIndex,
    getLastExtrinsicIndex,
    filterRelevantEvents,
} from "../utils/wasm-event-decoder";
import {
    captureBalances,
    snapshotToTokenBalances,
    getAssetMetadata,
    BalanceSnapshot,
} from "../utils/wasm-balance-tracker";

// Cache for chain properties to avoid repeated RPC calls
let chainPropertiesCache: {
    symbol: string;
    decimals: number;
} | null = null;

async function getChainProperties(api: ApiPromise): Promise<{
    symbol: string;
    decimals: number;
}> {
    if (chainPropertiesCache) {
        return chainPropertiesCache;
    }

    const properties = await api.rpc.system.properties();
    // Convert to primitives
    const tokenSymbol = properties.tokenSymbol.unwrapOr(["UNIT"])[0].toString();
    const tokenDecimals = properties.tokenDecimals.unwrapOr([12])[0];
    const decimals =
        typeof tokenDecimals === "number"
            ? tokenDecimals
            : tokenDecimals.toNumber();

    chainPropertiesCache = {
        symbol: tokenSymbol,
        decimals,
    };

    return chainPropertiesCache;
}

export async function simulateWasmTransaction(
    request: WasmSimulateRequest,
): Promise<WasmSimulateResponse> {
    const mutex = chopsticksService.getMutex();
    const release = await mutex.acquire();

    try {
        return await executeWasmSimulation(request);
    } finally {
        release();
    }
}

async function executeWasmSimulation(
    request: WasmSimulateRequest,
): Promise<WasmSimulateResponse> {
    await chopsticksService.reset();

    const api = chopsticksService.getApi();
    const { sender, trackAssets = [] } = request;

    // Get chain properties dynamically
    const { symbol: NATIVE_SYMBOL, decimals: NATIVE_DECIMALS } =
        await getChainProperties(api);

    const emptyStateReport: WasmStateImpactReport = {
        sender: { address: sender, before: [], after: [], changes: [] },
        recipient: null,
        otherAffected: [],
    };

    const emptyGasReport: WasmGasReport = {
        weight: { refTime: "0", proofSize: "0" },
        partialFee: "0",
        partialFeeFormatted: "0",
        nativeSymbol: NATIVE_SYMBOL,
    };

    // Helper to build nested calls (for batch, proxy, multisig, etc.)
    function buildCall(api: ApiPromise, callDef: any): any {
        if (typeof callDef === "string" && callDef.startsWith("0x")) {
            return api.createType("Call", callDef);
        }
        if (callDef.pallet && callDef.method) {
            return api.tx[callDef.pallet][callDef.method](
                ...(callDef.args || []),
            );
        }
        return callDef;
    }

    try {
        // Build extrinsic
        let extrinsic;
        let recipient: string | null = null;

        if ("rawHex" in request.extrinsic) {
            extrinsic = api.tx(request.extrinsic.rawHex);
        } else {
            const { pallet, method, args } = request.extrinsic;

            if (!api.tx[pallet]?.[method]) {
                return {
                    success: false,
                    stateChanges: emptyStateReport,
                    events: [],
                    gas: emptyGasReport,
                    error: {
                        type: "unknown",
                        message: `Unknown extrinsic: ${pallet}.${method}`,
                    },
                };
            }

            // Pre-process args to handle nested calls
            const processedArgs = args.map((arg: any) => {
                if (Array.isArray(arg)) {
                    return arg.map((item: any) => {
                        if (
                            item &&
                            typeof item === "object" &&
                            item.pallet &&
                            item.method
                        ) {
                            return api.tx[item.pallet][item.method](
                                ...(item.args || []),
                            );
                        }
                        return item;
                    });
                }
                return arg;
            });

            extrinsic = api.tx[pallet][method](...processedArgs);

            if (method.toLowerCase().includes("transfer") && args.length > 0) {
                recipient = args[0]?.toString() || null;
            }
        }

        // Get asset metadata
        const assetMetadata = await getAssetMetadata(api, trackAssets);

        // Addresses to track
        const addressesToTrack = [sender];
        if (recipient) addressesToTrack.push(recipient);

        // Capture balances BEFORE
        const balancesBefore = await captureBalances(
            api,
            addressesToTrack,
            trackAssets,
        );

        // Get payment info
        const paymentInfo = await chopsticksService.getPaymentInfo(
            extrinsic,
            sender,
        );

        // Get sender's nonce
        const { nonce } = (await api.query.system.account(sender)) as any;

        // signFake to get properly structured extrinsic
        const signedExtrinsic = extrinsic.signFake(sender, {
            nonce: nonce.toNumber(),
            blockHash: api.genesisHash,
            genesisHash: api.genesisHash,
            runtimeVersion: api.runtimeVersion,
        });

        // Patch signature at byte level for Chopsticks mock-signature-host
        const bytes = signedExtrinsic.toU8a(true); // true = without length prefix

        // Find the signature: after version byte (0x84), address type (0x00) +
        // 32-byte address, then signature type (0x01 for Sr25519) + 64-byte signature
        // Layout: [version(1)] [addressType(1)] [address(32)] [sigType(1)] [signature(64)] [era...] [nonce...] [tip...]
        const sigStart = 1 + 1 + 32 + 1; // = 35 (start of 64-byte signature)

        // Write deadbeef + cd padding
        bytes[sigStart] = 0xde;
        bytes[sigStart + 1] = 0xad;
        bytes[sigStart + 2] = 0xbe;
        bytes[sigStart + 3] = 0xef;
        for (let i = 4; i < 64; i++) {
            bytes[sigStart + i] = 0xcd;
        }

        // Encode with compact length prefix
        const lengthPrefix = compactToU8a(bytes.length);
        const fullExtrinsic = new Uint8Array(
            lengthPrefix.length + bytes.length,
        );
        fullExtrinsic.set(lengthPrefix, 0);
        fullExtrinsic.set(bytes, lengthPrefix.length);

        // Convert to hex
        const hex =
            "0x" +
            Array.from(fullExtrinsic)
                .map((b) => b.toString(16).padStart(2, "0"))
                .join("");

        // Submit via raw RPC (bypasses Polkadot.js decoder)
        await chopsticksService.submitExtrinsic(hex);
        await chopsticksService.newBlock();

        // Get ALL events from the new block
        const rawEvents = await api.query.system.events();
        const allEventRecords = decodeWasmEvents(
            api,
            (rawEvents as any).toArray(),
        );

        // Find the extrinsic index for our injected call (always the last one)
        const ourExtrinsicIndex = getLastExtrinsicIndex(allEventRecords);

        // Filter to ONLY events from our extrinsic
        const ourEvents = filterEventsByExtrinsicIndex(
            allEventRecords,
            ourExtrinsicIndex,
        );
        const relevantEvents = filterRelevantEvents(ourEvents);

        // Check for ExtrinsicFailed in OUR events only
        const failedEvent = ourEvents.find(
            (e) => e.pallet === "system" && e.method === "ExtrinsicFailed",
        );

        if (failedEvent) {
            // CRITICAL: If reset fails, throw fatal error
            try {
                await chopsticksService.reset();
            } catch (resetError) {
                throw new Error(
                    `FATAL: State cleanup failed after transaction failure. Reset error: ${resetError}`,
                );
            }

            return {
                success: false,
                stateChanges: emptyStateReport,
                events: relevantEvents,
                gas: {
                    weight: paymentInfo.weight,
                    partialFee: paymentInfo.partialFee,
                    partialFeeFormatted: formatBalance(
                        paymentInfo.partialFee,
                        NATIVE_DECIMALS,
                    ),
                    nativeSymbol: NATIVE_SYMBOL,
                },
                error: decodeWasmError(
                    api,
                    failedEvent.data?.dispatchError ||
                        failedEvent.data?.dispatch_error,
                ),
            };
        }

        // Build balance changes from events instead of raw before/after snapshots
        // This isolates our extrinsic's effects from block rewards/inflation
        const stateChanges = buildStateFromEvents(
            sender,
            recipient,
            ourEvents,
            balancesBefore,
            assetMetadata,
            NATIVE_SYMBOL,
            NATIVE_DECIMALS,
        );

        // CRITICAL: If reset fails, throw fatal error
        try {
            console.log(`\n=== ABOUT TO RESET ===`);
            await chopsticksService.reset();
        } catch (resetError) {
            throw new Error(
                `FATAL: State cleanup failed after successful transaction. Reset error: ${resetError}`,
            );
        }

        return {
            success: true,
            stateChanges,
            events: relevantEvents,
            gas: {
                weight: paymentInfo.weight,
                partialFee: paymentInfo.partialFee,
                partialFeeFormatted: formatBalance(
                    paymentInfo.partialFee,
                    NATIVE_DECIMALS,
                ),
                nativeSymbol: NATIVE_SYMBOL,
            },
        };
    } catch (error: any) {
        console.error("WASM simulation error:", error);

        // CRITICAL: If reset fails, re-throw the error
        try {
            await chopsticksService.reset();
        } catch (resetError) {
            throw new Error(
                `FATAL: State cleanup failed after simulation error. Original error: ${error.message}. Reset error: ${resetError}`,
            );
        }

        // Re-throw the original error to be handled by route handler
        throw error;
    }
}

// Build state impact from events belonging to our extrinsic only
function buildStateFromEvents(
    sender: string,
    recipient: string | null,
    events: any[],
    balancesBefore: Map<string, BalanceSnapshot>,
    assetMetadata: Map<number, { symbol: string; decimals: number }>,
    nativeSymbol: string,
    nativeDecimals: number,
): WasmStateImpactReport {
    // Track net balance changes per address from events
    const balanceDeltas = new Map<string, bigint>();

    for (const event of events) {
        const { pallet, method, data } = event;

        if (pallet === "balances") {
            if (method === "Transfer") {
                const from = data.from;
                const to = data.to;
                const amount = BigInt(data.amount.toString().replace(/,/g, ""));

                balanceDeltas.set(
                    from,
                    (balanceDeltas.get(from) || 0n) - amount,
                );
                balanceDeltas.set(to, (balanceDeltas.get(to) || 0n) + amount);
            } else if (method === "Withdraw") {
                const who = data.who;
                const amount = BigInt(data.amount.toString().replace(/,/g, ""));
                balanceDeltas.set(who, (balanceDeltas.get(who) || 0n) - amount);
            } else if (method === "Deposit") {
                const who = data.who;
                const amount = BigInt(data.amount.toString().replace(/,/g, ""));
                balanceDeltas.set(who, (balanceDeltas.get(who) || 0n) + amount);
            }
            // Note: Reserved/Unreserved events don't affect total balance,
            // they just move balance between free and reserved, so we ignore them
        }
    }

    // Build sender state - USE TOTAL BALANCE (free + reserved)
    const senderSnapshot = balancesBefore.get(sender);
    const senderBefore = senderSnapshot 
        ? senderSnapshot.native.free + senderSnapshot.native.reserved  // ← CHANGED
        : 0n;
    const senderDelta = balanceDeltas.get(sender) || 0n;
    const senderAfter = senderBefore + senderDelta;

    const senderState: WasmAddressState = {
        address: sender,
        before: [
            {
                token: nativeSymbol,
                assetId: null,
                balance: senderBefore.toString(),
                decimals: nativeDecimals,
                symbol: nativeSymbol,
            },
        ],
        after: [
            {
                token: nativeSymbol,
                assetId: null,
                balance: senderAfter.toString(),
                decimals: nativeDecimals,
                symbol: nativeSymbol,
            },
        ],
        changes:
            senderDelta !== 0n
                ? [
                      {
                          token: nativeSymbol,
                          assetId: null,
                          before: senderBefore.toString(),
                          after: senderAfter.toString(),
                          delta: senderDelta.toString(),
                          decimals: nativeDecimals,
                          symbol: nativeSymbol,
                      },
                  ]
                : [],
    };

    // Build recipient state - USE TOTAL BALANCE (free + reserved)
    let recipientState: WasmAddressState | null = null;
    if (recipient) {
        const recipientSnapshot = balancesBefore.get(recipient);
        const recipientBefore = recipientSnapshot
            ? recipientSnapshot.native.free + recipientSnapshot.native.reserved  // ← CHANGED
            : 0n;
        const recipientDelta = balanceDeltas.get(recipient) || 0n;
        const recipientAfter = recipientBefore + recipientDelta;

        if (recipientDelta !== 0n) {
            recipientState = {
                address: recipient,
                before: [
                    {
                        token: nativeSymbol,
                        assetId: null,
                        balance: recipientBefore.toString(),
                        decimals: nativeDecimals,
                        symbol: nativeSymbol,
                    },
                ],
                after: [
                    {
                        token: nativeSymbol,
                        assetId: null,
                        balance: recipientAfter.toString(),
                        decimals: nativeDecimals,
                        symbol: nativeSymbol,
                    },
                ],
                changes: [
                    {
                        token: nativeSymbol,
                        assetId: null,
                        before: recipientBefore.toString(),
                        after: recipientAfter.toString(),
                        delta: recipientDelta.toString(),
                        decimals: nativeDecimals,
                        symbol: nativeSymbol,
                    },
                ],
            };
        }
    }

    // Build other affected addresses - USE TOTAL BALANCE (free + reserved)
    const otherAffected: WasmAddressState[] = [];
    for (const [address, delta] of balanceDeltas) {
        if (address === sender || address === recipient || delta === 0n)
            continue;

        // We may not have a "before" for unexpected addresses
        const snapshot = balancesBefore.get(address);
        const before = snapshot 
            ? snapshot.native.free + snapshot.native.reserved  // ← CHANGED
            : 0n;
        const after = before + delta;

        otherAffected.push({
            address,
            before: [
                {
                    token: nativeSymbol,
                    assetId: null,
                    balance: before.toString(),
                    decimals: nativeDecimals,
                    symbol: nativeSymbol,
                },
            ],
            after: [
                {
                    token: nativeSymbol,
                    assetId: null,
                    balance: after.toString(),
                    decimals: nativeDecimals,
                    symbol: nativeSymbol,
                },
            ],
            changes: [
                {
                    token: nativeSymbol,
                    assetId: null,
                    before: before.toString(),
                    after: after.toString(),
                    delta: delta.toString(),
                    decimals: nativeDecimals,
                    symbol: nativeSymbol,
                },
            ],
        });
    }

    return {
        sender: senderState,
        recipient: recipientState,
        otherAffected,
    };
}

function formatBalance(balance: string, decimals: number): string {
    const value = BigInt(balance);
    const divisor = BigInt(10 ** decimals);
    const whole = value / divisor;
    const fraction = value % divisor;
    const fractionStr = fraction.toString().padStart(decimals, "0").slice(0, 6);
    return `${whole}.${fractionStr}`;
}
