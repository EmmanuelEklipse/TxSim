import { ApiPromise } from "@polkadot/api";
import { WasmTokenBalance } from "../types/wasm";

const NATIVE_SYMBOL = process.env.NATIVE_SYMBOL_WASM || "ASTR";
const NATIVE_DECIMALS = 18;

export interface BalanceSnapshot {
    native: {
        free: bigint;
        reserved: bigint;
        frozen: bigint;
    };
    assets: Map<number, bigint>;
}

export async function captureBalances(
    api: ApiPromise,
    addresses: string[],
    assetIds: number[] = [],
): Promise<Map<string, BalanceSnapshot>> {
    const snapshots = new Map<string, BalanceSnapshot>();

    for (const address of addresses) {
        try {
            // Get native balance
            const accountInfo = await api.query.system.account(address);
            const data = (accountInfo as any).data;

            const native = {
                free: BigInt(data.free.toString()),
                reserved: BigInt(data.reserved.toString()),
                frozen: BigInt(data.frozen?.toString() || "0"),
            };

            // Get asset balances
            const assets = new Map<number, bigint>();

            for (const assetId of assetIds) {
                try {
                    // Try pallet-assets
                    if (api.query.assets?.account) {
                        const assetAccount = await api.query.assets.account(
                            assetId,
                            address,
                        );
                        if ((assetAccount as any).isSome) {
                            const balance = (assetAccount as any).unwrap()
                                .balance;
                            assets.set(assetId, BigInt(balance.toString()));
                        } else {
                            assets.set(assetId, 0n);
                        }
                    }
                } catch {
                    assets.set(assetId, 0n);
                }
            }

            snapshots.set(address, { native, assets });
        } catch (error) {
            console.error(`Failed to get balance for ${address}:`, error);
            snapshots.set(address, {
                native: { free: 0n, reserved: 0n, frozen: 0n },
                assets: new Map(),
            });
        }
    }

    return snapshots;
}

export function snapshotToTokenBalances(
    snapshot: BalanceSnapshot,
    assetMetadata: Map<number, { symbol: string; decimals: number }>,
): WasmTokenBalance[] {
    const balances: WasmTokenBalance[] = [];

    // Native balance (use free balance as main balance)
    balances.push({
        token: NATIVE_SYMBOL,
        assetId: null,
        balance: snapshot.native.free.toString(),
        decimals: NATIVE_DECIMALS,
        symbol: NATIVE_SYMBOL,
    });

    // Asset balances
    for (const [assetId, balance] of snapshot.assets) {
        const metadata = assetMetadata.get(assetId) || {
            symbol: `Asset#${assetId}`,
            decimals: 18,
        };

        balances.push({
            token: metadata.symbol,
            assetId,
            balance: balance.toString(),
            decimals: metadata.decimals,
            symbol: metadata.symbol,
        });
    }

    return balances;
}

export async function getAssetMetadata(
    api: ApiPromise,
    assetIds: number[],
): Promise<Map<number, { symbol: string; decimals: number }>> {
    const metadata = new Map<number, { symbol: string; decimals: number }>();

    for (const assetId of assetIds) {
        try {
            if (api.query.assets?.metadata) {
                const assetMeta = await api.query.assets.metadata(assetId);
                const human = assetMeta.toHuman() as
                    | { symbol?: string; decimals?: number }
                    | string;
                const symbol =
                    typeof human === "object" &&
                    human !== null &&
                    "symbol" in human
                        ? String((human as any).symbol)
                        : `Asset#${assetId}`;
                const decimals =
                    typeof human === "object" &&
                    human !== null &&
                    "decimals" in human
                        ? Number((human as any).decimals)
                        : Number(
                              (assetMeta as any).decimals?.toString?.() ?? 18,
                          );
                metadata.set(assetId, {
                    symbol,
                    decimals,
                });
            }
        } catch {
            metadata.set(assetId, {
                symbol: `Asset#${assetId}`,
                decimals: 18,
            });
        }
    }

    return metadata;
}
