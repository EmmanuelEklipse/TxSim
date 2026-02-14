import {
    captureBalances,
    snapshotToTokenBalances,
    getAssetMetadata,
    BalanceSnapshot,
} from "../wasm-balance-tracker";
import { ApiPromise } from "@polkadot/api";

describe("wasm-balance-tracker", () => {
    let mockApi: any;

    beforeEach(() => {
        jest.clearAllMocks();

        // Mock API with all required query methods
        mockApi = {
            query: {
                system: {
                    account: jest.fn(),
                },
                assets: {
                    account: jest.fn(),
                    metadata: jest.fn(),
                },
            },
        };
    });

    describe("captureBalances", () => {
        it("should capture native balances for single address", async () => {
            const address = "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY";

            mockApi.query.system.account.mockResolvedValue({
                data: {
                    free: { toString: () => "1000000000000000000" },
                    reserved: { toString: () => "500000000000000000" },
                    frozen: { toString: () => "100000000000000000" },
                },
            });

            const result = await captureBalances(mockApi, [address]);

            expect(result.size).toBe(1);
            expect(result.has(address)).toBe(true);

            const snapshot = result.get(address)!;
            expect(snapshot.native.free).toBe(1000000000000000000n);
            expect(snapshot.native.reserved).toBe(500000000000000000n);
            expect(snapshot.native.frozen).toBe(100000000000000000n);
            expect(snapshot.assets.size).toBe(0);
        });

        it("should capture balances for multiple addresses", async () => {
            const addresses = [
                "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
                "5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty",
            ];

            mockApi.query.system.account
                .mockResolvedValueOnce({
                    data: {
                        free: { toString: () => "2000000000000000000" },
                        reserved: { toString: () => "0" },
                        frozen: { toString: () => "0" },
                    },
                })
                .mockResolvedValueOnce({
                    data: {
                        free: { toString: () => "3000000000000000000" },
                        reserved: { toString: () => "1000000000000000000" },
                        frozen: { toString: () => "500000000000000000" },
                    },
                });

            const result = await captureBalances(mockApi, addresses);

            expect(result.size).toBe(2);
            expect(result.get(addresses[0])!.native.free).toBe(
                2000000000000000000n,
            );
            expect(result.get(addresses[1])!.native.free).toBe(
                3000000000000000000n,
            );
            expect(result.get(addresses[1])!.native.reserved).toBe(
                1000000000000000000n,
            );
        });

        it("should handle missing frozen field", async () => {
            const address = "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY";

            mockApi.query.system.account.mockResolvedValue({
                data: {
                    free: { toString: () => "1000000000000000000" },
                    reserved: { toString: () => "0" },
                    // frozen field missing
                },
            });

            const result = await captureBalances(mockApi, [address]);

            const snapshot = result.get(address)!;
            expect(snapshot.native.frozen).toBe(0n);
        });

        it("should capture asset balances when assetIds provided", async () => {
            const address = "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY";
            const assetIds = [1, 2];

            mockApi.query.system.account.mockResolvedValue({
                data: {
                    free: { toString: () => "1000000000000000000" },
                    reserved: { toString: () => "0" },
                    frozen: { toString: () => "0" },
                },
            });

            mockApi.query.assets.account
                .mockResolvedValueOnce({
                    isSome: true,
                    unwrap: () => ({
                        balance: { toString: () => "5000000" },
                    }),
                })
                .mockResolvedValueOnce({
                    isSome: true,
                    unwrap: () => ({
                        balance: { toString: () => "10000000" },
                    }),
                });

            const result = await captureBalances(mockApi, [address], assetIds);

            const snapshot = result.get(address)!;
            expect(snapshot.assets.size).toBe(2);
            expect(snapshot.assets.get(1)).toBe(5000000n);
            expect(snapshot.assets.get(2)).toBe(10000000n);
        });

        it("should handle asset account that does not exist (isNone)", async () => {
            const address = "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY";
            const assetIds = [1];

            mockApi.query.system.account.mockResolvedValue({
                data: {
                    free: { toString: () => "1000000000000000000" },
                    reserved: { toString: () => "0" },
                    frozen: { toString: () => "0" },
                },
            });

            mockApi.query.assets.account.mockResolvedValue({
                isSome: false,
            });

            const result = await captureBalances(mockApi, [address], assetIds);

            const snapshot = result.get(address)!;
            expect(snapshot.assets.get(1)).toBe(0n);
        });

        it("should handle missing assets pallet", async () => {
            const address = "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY";
            const assetIds = [1];

            mockApi.query.system.account.mockResolvedValue({
                data: {
                    free: { toString: () => "1000000000000000000" },
                    reserved: { toString: () => "0" },
                    frozen: { toString: () => "0" },
                },
            });

            // Remove assets pallet
            mockApi.query.assets = undefined;

            const result = await captureBalances(mockApi, [address], assetIds);

            const snapshot = result.get(address)!;
            expect(snapshot.assets.size).toBe(0);
        });

        it("should handle asset query errors gracefully", async () => {
            const address = "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY";
            const assetIds = [1, 2];

            mockApi.query.system.account.mockResolvedValue({
                data: {
                    free: { toString: () => "1000000000000000000" },
                    reserved: { toString: () => "0" },
                    frozen: { toString: () => "0" },
                },
            });

            mockApi.query.assets.account
                .mockRejectedValueOnce(new Error("Asset query failed"))
                .mockResolvedValueOnce({
                    isSome: true,
                    unwrap: () => ({
                        balance: { toString: () => "5000000" },
                    }),
                });

            const result = await captureBalances(mockApi, [address], assetIds);

            const snapshot = result.get(address)!;
            expect(snapshot.assets.get(1)).toBe(0n); // Error case defaults to 0
            expect(snapshot.assets.get(2)).toBe(5000000n); // Success case
        });

        it("should handle account query errors gracefully", async () => {
            const address = "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY";
            const consoleErrorSpy = jest
                .spyOn(console, "error")
                .mockImplementation();

            mockApi.query.system.account.mockRejectedValue(
                new Error("Account query failed"),
            );

            const result = await captureBalances(mockApi, [address]);

            const snapshot = result.get(address)!;
            expect(snapshot.native.free).toBe(0n);
            expect(snapshot.native.reserved).toBe(0n);
            expect(snapshot.native.frozen).toBe(0n);
            expect(snapshot.assets.size).toBe(0);
            expect(consoleErrorSpy).toHaveBeenCalledWith(
                expect.stringContaining(`Failed to get balance for ${address}`),
                expect.any(Error),
            );

            consoleErrorSpy.mockRestore();
        });

        it("should handle empty address list", async () => {
            const result = await captureBalances(mockApi, []);

            expect(result.size).toBe(0);
            expect(mockApi.query.system.account).not.toHaveBeenCalled();
        });

        it("should handle multiple assets for multiple addresses", async () => {
            const addresses = [
                "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
                "5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty",
            ];
            const assetIds = [1, 2];

            mockApi.query.system.account.mockResolvedValue({
                data: {
                    free: { toString: () => "1000000000000000000" },
                    reserved: { toString: () => "0" },
                    frozen: { toString: () => "0" },
                },
            });

            mockApi.query.assets.account.mockResolvedValue({
                isSome: true,
                unwrap: () => ({
                    balance: { toString: () => "1000000" },
                }),
            });

            const result = await captureBalances(mockApi, addresses, assetIds);

            expect(result.size).toBe(2);
            expect(result.get(addresses[0])!.assets.size).toBe(2);
            expect(result.get(addresses[1])!.assets.size).toBe(2);
            // 2 addresses × (1 native + 2 assets) = 2 native calls + 4 asset calls
            expect(mockApi.query.system.account).toHaveBeenCalledTimes(2);
            expect(mockApi.query.assets.account).toHaveBeenCalledTimes(4);
        });

        it("should handle zero balances", async () => {
            const address = "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY";

            mockApi.query.system.account.mockResolvedValue({
                data: {
                    free: { toString: () => "0" },
                    reserved: { toString: () => "0" },
                    frozen: { toString: () => "0" },
                },
            });

            const result = await captureBalances(mockApi, [address]);

            const snapshot = result.get(address)!;
            expect(snapshot.native.free).toBe(0n);
            expect(snapshot.native.reserved).toBe(0n);
            expect(snapshot.native.frozen).toBe(0n);
        });

        it("should handle very large balances", async () => {
            const address = "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY";

            mockApi.query.system.account.mockResolvedValue({
                data: {
                    free: { toString: () => "999999999999999999999999999" },
                    reserved: { toString: () => "0" },
                    frozen: { toString: () => "0" },
                },
            });

            const result = await captureBalances(mockApi, [address]);

            const snapshot = result.get(address)!;
            expect(snapshot.native.free).toBe(999999999999999999999999999n);
        });
    });

    describe("snapshotToTokenBalances", () => {
        it("should convert native balance to token balance", () => {
            const snapshot: BalanceSnapshot = {
                native: {
                    free: 1000000000000000000n,
                    reserved: 500000000000000000n,
                    frozen: 0n,
                },
                assets: new Map(),
            };

            const assetMetadata = new Map();

            const result = snapshotToTokenBalances(snapshot, assetMetadata);

            expect(result).toHaveLength(1);
            expect(result[0]).toEqual({
                token: process.env.NATIVE_SYMBOL_WASM || "ASTR",
                assetId: null,
                balance: "1000000000000000000",
                decimals: 18,
                symbol: process.env.NATIVE_SYMBOL_WASM || "ASTR",
            });
        });

        it("should convert snapshot with asset balances", () => {
            const snapshot: BalanceSnapshot = {
                native: {
                    free: 2000000000000000000n,
                    reserved: 0n,
                    frozen: 0n,
                },
                assets: new Map([
                    [1, 5000000n],
                    [2, 10000000n],
                ]),
            };

            const assetMetadata = new Map([
                [1, { symbol: "USDT", decimals: 6 }],
                [2, { symbol: "USDC", decimals: 6 }],
            ]);

            const result = snapshotToTokenBalances(snapshot, assetMetadata);

            expect(result).toHaveLength(3);
            expect(result[0].token).toBe(
                process.env.NATIVE_SYMBOL_WASM || "ASTR",
            );
            expect(result[1]).toEqual({
                token: "USDT",
                assetId: 1,
                balance: "5000000",
                decimals: 6,
                symbol: "USDT",
            });
            expect(result[2]).toEqual({
                token: "USDC",
                assetId: 2,
                balance: "10000000",
                decimals: 6,
                symbol: "USDC",
            });
        });

        it("should handle missing asset metadata with defaults", () => {
            const snapshot: BalanceSnapshot = {
                native: {
                    free: 1000000000000000000n,
                    reserved: 0n,
                    frozen: 0n,
                },
                assets: new Map([[99, 1000000n]]),
            };

            const assetMetadata = new Map(); // Empty metadata

            const result = snapshotToTokenBalances(snapshot, assetMetadata);

            expect(result).toHaveLength(2);
            expect(result[1]).toEqual({
                token: "Asset#99",
                assetId: 99,
                balance: "1000000",
                decimals: 18,
                symbol: "Asset#99",
            });
        });

        it("should handle zero balances", () => {
            const snapshot: BalanceSnapshot = {
                native: {
                    free: 0n,
                    reserved: 0n,
                    frozen: 0n,
                },
                assets: new Map([[1, 0n]]),
            };

            const assetMetadata = new Map([
                [1, { symbol: "USDT", decimals: 6 }],
            ]);

            const result = snapshotToTokenBalances(snapshot, assetMetadata);

            expect(result).toHaveLength(2);
            expect(result[0].balance).toBe("0");
            expect(result[1].balance).toBe("0");
        });

        it("should handle snapshot with no assets", () => {
            const snapshot: BalanceSnapshot = {
                native: {
                    free: 5000000000000000000n,
                    reserved: 0n,
                    frozen: 0n,
                },
                assets: new Map(),
            };

            const assetMetadata = new Map();

            const result = snapshotToTokenBalances(snapshot, assetMetadata);

            expect(result).toHaveLength(1);
            expect(result[0].token).toBe(
                process.env.NATIVE_SYMBOL_WASM || "ASTR",
            );
        });

        it("should handle multiple assets with mixed metadata", () => {
            const snapshot: BalanceSnapshot = {
                native: {
                    free: 1000000000000000000n,
                    reserved: 0n,
                    frozen: 0n,
                },
                assets: new Map([
                    [1, 5000000n],
                    [2, 10000000n],
                    [3, 15000000n],
                ]),
            };

            // Metadata only for assets 1 and 3
            const assetMetadata = new Map([
                [1, { symbol: "USDT", decimals: 6 }],
                [3, { symbol: "DAI", decimals: 18 }],
            ]);

            const result = snapshotToTokenBalances(snapshot, assetMetadata);

            expect(result).toHaveLength(4);
            expect(result[1].symbol).toBe("USDT");
            expect(result[2].symbol).toBe("Asset#2"); // Missing metadata
            expect(result[3].symbol).toBe("DAI");
        });

        it("should preserve asset order from snapshot", () => {
            const snapshot: BalanceSnapshot = {
                native: {
                    free: 1000000000000000000n,
                    reserved: 0n,
                    frozen: 0n,
                },
                assets: new Map([
                    [5, 100n],
                    [3, 200n],
                    [7, 300n],
                ]),
            };

            const assetMetadata = new Map([
                [3, { symbol: "A", decimals: 6 }],
                [5, { symbol: "B", decimals: 6 }],
                [7, { symbol: "C", decimals: 6 }],
            ]);

            const result = snapshotToTokenBalances(snapshot, assetMetadata);

            expect(result).toHaveLength(4);
            // Native is always first
            expect(result[0].assetId).toBeNull();
            // Assets follow in Map insertion order
            expect(result[1].assetId).toBe(5);
            expect(result[2].assetId).toBe(3);
            expect(result[3].assetId).toBe(7);
        });
    });

    describe("getAssetMetadata", () => {
        it("should retrieve asset metadata successfully", async () => {
            const assetIds = [1, 2];

            mockApi.query.assets.metadata
                .mockResolvedValueOnce({
                    toHuman: () => ({
                        symbol: "USDT",
                        decimals: 6,
                    }),
                })
                .mockResolvedValueOnce({
                    toHuman: () => ({
                        symbol: "USDC",
                        decimals: 6,
                    }),
                });

            const result = await getAssetMetadata(mockApi, assetIds);

            expect(result.size).toBe(2);
            expect(result.get(1)).toEqual({ symbol: "USDT", decimals: 6 });
            expect(result.get(2)).toEqual({ symbol: "USDC", decimals: 6 });
        });

        it("should handle toHuman returning string", async () => {
            const assetIds = [1];

            mockApi.query.assets.metadata.mockResolvedValue({
                toHuman: () => "SomeStringValue",
                decimals: { toString: () => "12" },
            });

            const result = await getAssetMetadata(mockApi, assetIds);

            expect(result.get(1)).toEqual({
                symbol: "Asset#1",
                decimals: 12,
            });
        });

        it("should handle missing symbol in metadata", async () => {
            const assetIds = [1];

            mockApi.query.assets.metadata.mockResolvedValue({
                toHuman: () => ({
                    decimals: 8,
                    // symbol missing
                }),
            });

            const result = await getAssetMetadata(mockApi, assetIds);

            expect(result.get(1)).toEqual({
                symbol: "Asset#1",
                decimals: 8,
            });
        });

        it("should handle missing decimals in metadata", async () => {
            const assetIds = [1];

            mockApi.query.assets.metadata.mockResolvedValue({
                toHuman: () => ({
                    symbol: "TOKEN",
                    // decimals missing
                }),
            });

            const result = await getAssetMetadata(mockApi, assetIds);

            expect(result.get(1)).toEqual({
                symbol: "TOKEN",
                decimals: 18, // Default
            });
        });

        it("should handle metadata query errors gracefully", async () => {
            const assetIds = [1, 2];

            mockApi.query.assets.metadata
                .mockRejectedValueOnce(new Error("Metadata query failed"))
                .mockResolvedValueOnce({
                    toHuman: () => ({
                        symbol: "USDC",
                        decimals: 6,
                    }),
                });

            const result = await getAssetMetadata(mockApi, assetIds);

            expect(result.size).toBe(2);
            expect(result.get(1)).toEqual({
                symbol: "Asset#1",
                decimals: 18,
            });
            expect(result.get(2)).toEqual({
                symbol: "USDC",
                decimals: 6,
            });
        });

        it("should handle missing assets pallet", async () => {
            const assetIds = [1];

            mockApi.query.assets = undefined;

            const result = await getAssetMetadata(mockApi, assetIds);

            expect(result.size).toBe(0);
        });

        it("should handle empty asset list", async () => {
            const result = await getAssetMetadata(mockApi, []);

            expect(result.size).toBe(0);
            expect(mockApi.query.assets.metadata).not.toHaveBeenCalled();
        });

        it("should handle toHuman returning null", async () => {
            const assetIds = [1];

            mockApi.query.assets.metadata.mockResolvedValue({
                toHuman: () => null,
                decimals: { toString: () => "10" },
            });

            const result = await getAssetMetadata(mockApi, assetIds);

            expect(result.get(1)).toEqual({
                symbol: "Asset#1",
                decimals: 10,
            });
        });

        it("should handle decimals as direct property", async () => {
            const assetIds = [1];

            mockApi.query.assets.metadata.mockResolvedValue({
                toHuman: () => ({
                    symbol: "TOKEN",
                }),
                decimals: {
                    toString: () => "9",
                },
            });

            const result = await getAssetMetadata(mockApi, assetIds);

            expect(result.get(1)).toEqual({
                symbol: "TOKEN",
                decimals: 9,
            });
        });

        it("should handle decimals without toString method", async () => {
            const assetIds = [1];

            mockApi.query.assets.metadata.mockResolvedValue({
                toHuman: () => ({
                    symbol: "TOKEN",
                    decimals: 7,
                }),
            });

            const result = await getAssetMetadata(mockApi, assetIds);

            expect(result.get(1)).toEqual({
                symbol: "TOKEN",
                decimals: 7,
            });
        });

        it("should handle multiple assets with mixed success and errors", async () => {
            const assetIds = [1, 2, 3, 4];

            mockApi.query.assets.metadata
                .mockResolvedValueOnce({
                    toHuman: () => ({ symbol: "AAA", decimals: 6 }),
                })
                .mockRejectedValueOnce(new Error("Error"))
                .mockResolvedValueOnce({
                    toHuman: () => ({ symbol: "CCC", decimals: 8 }),
                })
                .mockResolvedValueOnce({
                    toHuman: () => "InvalidFormat",
                    decimals: { toString: () => "12" },
                });

            const result = await getAssetMetadata(mockApi, assetIds);

            expect(result.size).toBe(4);
            expect(result.get(1)).toEqual({ symbol: "AAA", decimals: 6 });
            expect(result.get(2)).toEqual({ symbol: "Asset#2", decimals: 18 });
            expect(result.get(3)).toEqual({ symbol: "CCC", decimals: 8 });
            expect(result.get(4)).toEqual({ symbol: "Asset#4", decimals: 12 });
        });

        it("should handle asset ID 0", async () => {
            const assetIds = [0];

            mockApi.query.assets.metadata.mockResolvedValue({
                toHuman: () => ({
                    symbol: "ZERO",
                    decimals: 10,
                }),
            });

            const result = await getAssetMetadata(mockApi, assetIds);

            expect(result.get(0)).toEqual({
                symbol: "ZERO",
                decimals: 10,
            });
        });

        it("should handle very large asset IDs", async () => {
            const assetIds = [999999999];

            mockApi.query.assets.metadata.mockResolvedValue({
                toHuman: () => ({
                    symbol: "LARGE",
                    decimals: 18,
                }),
            });

            const result = await getAssetMetadata(mockApi, assetIds);

            expect(result.get(999999999)).toEqual({
                symbol: "LARGE",
                decimals: 18,
            });
        });
    });

    describe("Integration scenarios", () => {
        it("should capture balances and convert to token balances", async () => {
            const address = "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY";
            const assetIds = [1];

            mockApi.query.system.account.mockResolvedValue({
                data: {
                    free: { toString: () => "1000000000000000000" },
                    reserved: { toString: () => "0" },
                    frozen: { toString: () => "0" },
                },
            });

            mockApi.query.assets.account.mockResolvedValue({
                isSome: true,
                unwrap: () => ({
                    balance: { toString: () => "5000000" },
                }),
            });

            mockApi.query.assets.metadata.mockResolvedValue({
                toHuman: () => ({
                    symbol: "USDT",
                    decimals: 6,
                }),
            });

            // Capture balances
            const snapshots = await captureBalances(
                mockApi,
                [address],
                assetIds,
            );

            // Get metadata
            const metadata = await getAssetMetadata(mockApi, assetIds);

            // Convert to token balances
            const tokenBalances = snapshotToTokenBalances(
                snapshots.get(address)!,
                metadata,
            );

            expect(tokenBalances).toHaveLength(2);
            expect(tokenBalances[0].symbol).toBe(
                process.env.NATIVE_SYMBOL_WASM || "ASTR",
            );
            expect(tokenBalances[1].symbol).toBe("USDT");
        });

        it("should handle complete workflow with errors", async () => {
            const addresses = [
                "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
                "5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty",
            ];
            const assetIds = [1, 2];

            const consoleErrorSpy = jest
                .spyOn(console, "error")
                .mockImplementation();

            // First address succeeds
            mockApi.query.system.account
                .mockResolvedValueOnce({
                    data: {
                        free: { toString: () => "1000000000000000000" },
                        reserved: { toString: () => "0" },
                        frozen: { toString: () => "0" },
                    },
                })
                // Second address fails
                .mockRejectedValueOnce(new Error("Account error"));

            mockApi.query.assets.account.mockResolvedValue({
                isSome: true,
                unwrap: () => ({
                    balance: { toString: () => "1000000" },
                }),
            });

            // First asset metadata succeeds, second fails
            mockApi.query.assets.metadata
                .mockResolvedValueOnce({
                    toHuman: () => ({ symbol: "USDT", decimals: 6 }),
                })
                .mockRejectedValueOnce(new Error("Metadata error"));

            const snapshots = await captureBalances(
                mockApi,
                addresses,
                assetIds,
            );
            const metadata = await getAssetMetadata(mockApi, assetIds);

            expect(snapshots.size).toBe(2);
            expect(snapshots.get(addresses[0])!.native.free).toBe(
                1000000000000000000n,
            );
            expect(snapshots.get(addresses[1])!.native.free).toBe(0n); // Error default

            expect(metadata.size).toBe(2);
            expect(metadata.get(1)!.symbol).toBe("USDT");
            expect(metadata.get(2)!.symbol).toBe("Asset#2"); // Error default

            consoleErrorSpy.mockRestore();
        });
    });
});
