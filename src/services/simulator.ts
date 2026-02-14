import { ethers } from "ethers";
import { anvilService } from "./anvil";
import { SimulateRequest, SimulateResponse } from "../types";
import { decodeEVMError } from "../utils/error-decoder";
import { decodeLogs } from "../utils/event-decoder";
import { calculateGasReport } from "../utils/gas-calculator";
import { buildStateImpactReport } from "../utils/state-impact";
import { getTokenBalance } from "../utils/token-info";

// Configure based on chain (Moonbeam = GLMR, Ethereum = ETH, etc.)
const NATIVE_SYMBOL = process.env.NATIVE_SYMBOL || "GLMR";

interface BalanceSnapshot {
    native: bigint;
    tokens: Map<string, bigint>;
}

export async function simulateTransaction(
    request: SimulateRequest,
): Promise<SimulateResponse> {
    const mutex = anvilService.getMutex();
    const release = await mutex.acquire();

    try {
        return await executeSimulation(request);
    } finally {
        release();
    }
}

async function executeSimulation(
    request: SimulateRequest,
): Promise<SimulateResponse> {
    const provider = anvilService.getProvider();
    const { sender, transaction } = request;
    const trackTokens = request.trackTokens || [];

    const snapshotId = await anvilService.snapshot();
    let impersonating = false;

    // Empty state report for errors
    const emptyStateReport = {
        sender: {
            address: sender.toLowerCase(),
            before: [],
            after: [],
            changes: [],
        },
        recipient: {
            address: transaction.to.toLowerCase(),
            before: [],
            after: [],
            changes: [],
        },
        contractsAffected: [],
    };

    const emptyGasReport = {
        gasUsed: "0",
        gasPrice: "0",
        totalCostWei: "0",
        totalCostNative: "0",
        nativeSymbol: NATIVE_SYMBOL,
    };

    try {
        // Initial addresses to track
        const addressesToTrack = new Set([
            sender.toLowerCase(),
            transaction.to.toLowerCase(),
        ]);

        // Try to extract recipient from calldata (for ERC20 transfers)
        const extractedRecipient = extractTransferRecipient(transaction.data);
        if (extractedRecipient) {
            addressesToTrack.add(extractedRecipient.toLowerCase());
        }

        // Capture balances BEFORE
        const balancesBefore = await captureBalances(
            provider,
            Array.from(addressesToTrack),
            trackTokens,
        );

        const currentGasPrice = await getCurrentGasPrice();

        // Impersonate and execute
        const signer = await anvilService.getImpersonatedSigner(sender);
        impersonating = true;

        const tx = await signer.sendTransaction({
            to: transaction.to,
            data: transaction.data || "0x",
            value: transaction.value ? BigInt(transaction.value) : 0n,
            gasLimit: transaction.gasLimit
                ? BigInt(transaction.gasLimit)
                : undefined,
            gasPrice: currentGasPrice,
        });

        const receipt = await tx.wait();

        // Decode events to find more affected addresses
        const events = receipt?.logs
            ? decodeLogs(receipt.logs as ethers.Log[])
            : [];

        // Extract addresses from Transfer events
        const newAddresses = new Set<string>();
        for (const event of events) {
            if (event.name === "Transfer") {
                if (event.args.from) {
                    const addr = event.args.from.toLowerCase();
                    if (!addressesToTrack.has(addr)) {
                        newAddresses.add(addr);
                    }
                }
                if (event.args.to) {
                    const addr = event.args.to.toLowerCase();
                    if (!addressesToTrack.has(addr)) {
                        newAddresses.add(addr);
                    }
                }
            }
        }

        // TWO-PASS SIMULATION: If we discovered new addresses, capture their historical balances
        let historicalBalances: Map<string, BalanceSnapshot> | null = null;
        if (newAddresses.size > 0) {
            // Revert to snapshot to get historical state
            const revertSuccess = await anvilService.revert(snapshotId);
            if (!revertSuccess) {
                throw new Error(
                    "FATAL: Failed to revert to snapshot for historical balance lookup",
                );
            }

            // Capture historical balances for newly discovered addresses
            historicalBalances = await captureBalances(
                provider,
                Array.from(newAddresses),
                trackTokens,
            );

            // Re-execute transaction
            const tx2 = await signer.sendTransaction({
                to: transaction.to,
                data: transaction.data || "0x",
                value: transaction.value ? BigInt(transaction.value) : 0n,
                gasLimit: transaction.gasLimit
                    ? BigInt(transaction.gasLimit)
                    : undefined,
            });

            await tx2.wait();
        }

        // Merge newly discovered addresses into tracking set
        for (const addr of newAddresses) {
            addressesToTrack.add(addr);
            if (historicalBalances?.has(addr)) {
                balancesBefore.set(addr, historicalBalances.get(addr)!);
            }
        }

        // Capture balances AFTER (including newly discovered addresses)
        const balancesAfter = await captureBalances(
            provider,
            Array.from(addressesToTrack),
            trackTokens,
        );

        // Build state impact report
        const stateChanges = await buildStateImpactReport(
            provider,
            sender,
            transaction.to,
            trackTokens,
            balancesBefore,
            balancesAfter,
            NATIVE_SYMBOL,
            extractedRecipient, // Pass actual token recipient
        );

        // Calculate gas report
        const gas = await calculateGasReport(provider, receipt, NATIVE_SYMBOL);

        const success = receipt?.status === 1;

        return {
            success,
            stateChanges,
            events,
            gas,
            error: success
                ? undefined
                : { type: "revert", message: "Transaction reverted" },
        };
    } catch (error: any) {
        const decodedError = decodeEVMError(error);

        return {
            success: false,
            stateChanges: emptyStateReport,
            events: [],
            gas: emptyGasReport,
            error: decodedError,
        };
    } finally {
        if (impersonating) {
            try {
                await anvilService.stopImpersonating(sender);
            } catch {
                // Ignore impersonation cleanup errors
            }
        }

        // CRITICAL: If cleanup fails, throw fatal error
        try {
            const revertSuccess = await anvilService.revert(snapshotId);
            if (!revertSuccess) {
                throw new Error(
                    "FATAL: Failed to revert snapshot - state may be corrupted",
                );
            }
        } catch (revertError) {
            // If revert fails, try reset as last resort
            try {
                await anvilService.reset();
            } catch (resetError) {
                // If both fail, throw fatal error
                throw new Error(
                    `FATAL: State cleanup failed - both revert and reset failed. State is corrupted. Revert error: ${revertError}. Reset error: ${resetError}`,
                );
            }
        }
    }
}

async function captureBalances(
    provider: ethers.JsonRpcProvider,
    addresses: string[],
    tokenAddresses: string[],
): Promise<Map<string, BalanceSnapshot>> {
    const snapshots = new Map<string, BalanceSnapshot>();

    for (const address of addresses) {
        const native = await provider.getBalance(address);
        const tokens = new Map<string, bigint>();

        for (const tokenAddress of tokenAddresses) {
            const balance = await getTokenBalance(
                provider,
                tokenAddress,
                address,
            );
            tokens.set(tokenAddress.toLowerCase(), balance);
        }

        snapshots.set(address.toLowerCase(), { native, tokens });
    }

    return snapshots;
}

// Extract recipient from transfer/transferFrom calldata
function extractTransferRecipient(data?: string): string | null {
    if (!data || data.length < 10) return null;

    const selector = data.slice(0, 10).toLowerCase();

    // transfer(address,uint256) = 0xa9059cbb
    if (selector === "0xa9059cbb" && data.length >= 74) {
        const recipient = "0x" + data.slice(34, 74);
        if (ethers.isAddress(recipient)) return recipient;
    }

    // transferFrom(address,address,uint256) = 0x23b872dd
    if (selector === "0x23b872dd" && data.length >= 138) {
        const recipient = "0x" + data.slice(98, 138);
        if (ethers.isAddress(recipient)) return recipient;
    }

    return null;
}

async function getCurrentGasPrice(): Promise<bigint> {
    try {
        // Connect to live Moonbeam RPC to get current gas price
        const liveProvider = new ethers.JsonRpcProvider(
            process.env.FORK_URL_EVM!,
        );
        const gasPrice = await liveProvider.getFeeData();
        return gasPrice.gasPrice || 0n;
    } catch (error) {
        // Fallback to fork's gas price
        const provider = anvilService.getProvider();
        const feeData = await provider.getFeeData();
        return feeData.gasPrice || 0n;
    }
}
