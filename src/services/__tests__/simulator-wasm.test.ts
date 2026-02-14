import { simulateWasmTransaction } from "../simulator-wasm";
import { chopsticksService } from "../chopsticks";
import * as wasmErrorDecoder from "../../utils/wasm-error-decoder";
import * as wasmEventDecoder from "../../utils/wasm-event-decoder";
import * as wasmBalanceTracker from "../../utils/wasm-balance-tracker";

// Mock all dependencies
jest.mock("../chopsticks");
jest.mock("../../utils/wasm-error-decoder");
jest.mock("../../utils/wasm-event-decoder");
jest.mock("../../utils/wasm-balance-tracker");

describe("simulateWasmTransaction", () => {
    let mockApi: any;
    let mockExtrinsic: any;
    let mockRawEvents: any;

    beforeEach(() => {
        jest.clearAllMocks();

        // Mock extrinsic
        mockExtrinsic = {
            toU8a: jest.fn().mockReturnValue(
                new Uint8Array([
                    0x84, // version
                    0x00, // address type
                    ...new Array(32).fill(0x01), // 32-byte address
                    0x01, // signature type (Sr25519)
                    ...new Array(64).fill(0x00), // 64-byte signature
                    0x00, // era
                    0x00, // nonce
                    0x00, // tip
                ]),
            ),
            signFake: jest.fn().mockReturnThis(),
        };

        // Mock API
        mockApi = {
            tx: {
                balances: {
                    transfer: jest.fn().mockReturnValue(mockExtrinsic),
                    transferKeepAlive: jest.fn().mockReturnValue(mockExtrinsic),
                },
                utility: {
                    batch: jest.fn().mockReturnValue(mockExtrinsic),
                    batchAll: jest.fn().mockReturnValue(mockExtrinsic),
                },
                proxy: {
                    proxy: jest.fn().mockReturnValue(mockExtrinsic),
                },
                assets: {
                    transfer: jest.fn().mockReturnValue(mockExtrinsic),
                },
            },
            createType: jest.fn().mockReturnValue(mockExtrinsic),
            query: {
                system: {
                    account: jest.fn().mockResolvedValue({
                        nonce: { toNumber: () => 5 },
                    }),
                    events: jest.fn().mockResolvedValue({
                        toArray: () => [],
                    }),
                },
            },
            rpc: {
                system: {
                    properties: jest.fn().mockResolvedValue({
                        tokenSymbol: {
                            unwrapOr: jest.fn().mockReturnValue(["UNIT"]),
                        },
                        tokenDecimals: {
                            unwrapOr: jest.fn().mockReturnValue([12]),
                        },
                    }),
                },
            },
            genesisHash: "0x1234567890abcdef",
            runtimeVersion: { specVersion: 1 },
        };

        // Mock raw events
        mockRawEvents = {
            toArray: jest.fn().mockReturnValue([]),
        };

        // Mock chopsticks service
        (chopsticksService.getApi as jest.Mock).mockReturnValue(mockApi);
        (chopsticksService.getPaymentInfo as jest.Mock).mockResolvedValue({
            weight: { refTime: "1000000", proofSize: "65536" },
            partialFee: "100000000000000000",
        });
        (chopsticksService.submitExtrinsic as jest.Mock).mockResolvedValue(
            undefined,
        );
        (chopsticksService.newBlock as jest.Mock).mockResolvedValue(undefined);
        (chopsticksService.reset as jest.Mock).mockResolvedValue(undefined);
        (chopsticksService.getMutex as jest.Mock).mockReturnValue({
            acquire: jest.fn().mockResolvedValue(() => {}),
        });

        // Mock utility functions
        (wasmBalanceTracker.captureBalances as jest.Mock).mockResolvedValue(
            new Map([
                [
                    "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
                    {
                        native: { free: 1000000000000000000n, reserved: 0n },
                        assets: new Map(),
                    },
                ],
            ]),
        );
        (wasmBalanceTracker.getAssetMetadata as jest.Mock).mockResolvedValue(
            new Map(),
        );

        (wasmEventDecoder.decodeWasmEvents as jest.Mock).mockReturnValue([
            {
                pallet: "system",
                method: "ExtrinsicSuccess",
                data: {},
                extrinsicIndex: 1,
            },
        ]);
        (wasmEventDecoder.getLastExtrinsicIndex as jest.Mock).mockReturnValue(
            1,
        );
        (
            wasmEventDecoder.filterEventsByExtrinsicIndex as jest.Mock
        ).mockReturnValue([
            {
                pallet: "system",
                method: "ExtrinsicSuccess",
                data: {},
                extrinsicIndex: 1,
            },
        ]);
        (wasmEventDecoder.filterRelevantEvents as jest.Mock).mockReturnValue([
            {
                pallet: "system",
                method: "ExtrinsicSuccess",
                data: {},
            },
        ]);
    });

    describe("Successful transactions", () => {
        it("should simulate a successful balance transfer", async () => {
            const request = {
                sender: "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
                extrinsic: {
                    pallet: "balances",
                    method: "transfer",
                    args: [
                        "5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty",
                        "1000000000000000000",
                    ],
                },
            };

            const result = await simulateWasmTransaction(request);

            expect(result.success).toBe(true);
            expect(result.events).toBeDefined();
            expect(result.gas).toMatchObject({
                weight: { refTime: "1000000", proofSize: "65536" },
                partialFee: "100000000000000000",
                nativeSymbol: expect.any(String),
            });
            expect(result.stateChanges).toBeDefined();
            expect(result.stateChanges.sender.address).toBe(request.sender);
            expect(chopsticksService.submitExtrinsic).toHaveBeenCalled();
            expect(chopsticksService.newBlock).toHaveBeenCalled();
            expect(chopsticksService.reset).toHaveBeenCalled();
        });

        it("should handle raw hex extrinsic", async () => {
            const request = {
                sender: "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
                extrinsic: {
                    rawHex: "0x123456789abcdef",
                },
            };

            mockApi.tx = jest.fn().mockReturnValue(mockExtrinsic);

            const result = await simulateWasmTransaction(request);

            expect(result.success).toBe(true);
            expect(mockApi.tx).toHaveBeenCalledWith("0x123456789abcdef");
        });

        it("should extract recipient from transfer method", async () => {
            const recipient =
                "5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty";
            const request = {
                sender: "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
                extrinsic: {
                    pallet: "balances",
                    method: "transferKeepAlive",
                    args: [recipient, "1000000000000000000"],
                },
            };

            (wasmBalanceTracker.captureBalances as jest.Mock).mockResolvedValue(
                new Map([
                    [
                        request.sender,
                        {
                            native: {
                                free: 2000000000000000000n,
                                reserved: 0n,
                            },
                            assets: new Map(),
                        },
                    ],
                    [
                        recipient,
                        {
                            native: { free: 500000000000000000n, reserved: 0n },
                            assets: new Map(),
                        },
                    ],
                ]),
            );

            const result = await simulateWasmTransaction(request);

            expect(result.success).toBe(true);
            expect(wasmBalanceTracker.captureBalances).toHaveBeenCalledWith(
                mockApi,
                expect.arrayContaining([request.sender, recipient]),
                [],
            );
        });

        it("should track specified assets", async () => {
            const request = {
                sender: "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
                extrinsic: {
                    pallet: "assets",
                    method: "transfer",
                    args: [
                        1,
                        "5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty",
                        "1000",
                    ],
                },
                trackAssets: [1, 2],
            };

            const assetMetadata = new Map([
                [1, { symbol: "USDT", decimals: 6 }],
                [2, { symbol: "USDC", decimals: 6 }],
            ]);

            (
                wasmBalanceTracker.getAssetMetadata as jest.Mock
            ).mockResolvedValue(assetMetadata);

            const result = await simulateWasmTransaction(request);

            expect(result.success).toBe(true);
            expect(wasmBalanceTracker.getAssetMetadata).toHaveBeenCalledWith(
                mockApi,
                [1, 2],
            );
        });

        it("should handle batch calls with nested transactions", async () => {
            const request = {
                sender: "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
                extrinsic: {
                    pallet: "utility",
                    method: "batch",
                    args: [
                        [
                            {
                                pallet: "balances",
                                method: "transfer",
                                args: [
                                    "5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty",
                                    "1000000000000000000",
                                ],
                            },
                            {
                                pallet: "balances",
                                method: "transfer",
                                args: [
                                    "5DAAnrj7VHTznn2AWBemMuyBwZWs6FNFjdyVXUeYum3PTXFy",
                                    "2000000000000000000",
                                ],
                            },
                        ],
                    ],
                },
            };

            const result = await simulateWasmTransaction(request);

            expect(result.success).toBe(true);
            expect(mockApi.tx.utility.batch).toHaveBeenCalled();
        });
    });

    // describe("Failed transactions", () => {
    //     it("should handle ExtrinsicFailed event", async () => {
    //         const failedEvents = [
    //             {
    //                 pallet: "system",
    //                 method: "ExtrinsicFailed",
    //                 data: {
    //                     dispatchError: {
    //                         module: { index: 5, error: 2 },
    //                     },
    //                 },
    //                 extrinsicIndex: 1,
    //             },
    //         ];

    //         (
    //             wasmEventDecoder.filterEventsByExtrinsicIndex as jest.Mock
    //         ).mockReturnValue(failedEvents);

    //         const decodedError = {
    //             type: "module",
    //             pallet: "Balances",
    //             error: "InsufficientBalance",
    //             message: "Account balance too low",
    //         };

    //         (wasmErrorDecoder.decodeWasmError as jest.Mock).mockReturnValue(
    //             decodedError,
    //         );

    //         const request = {
    //             sender: "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
    //             extrinsic: {
    //                 pallet: "balances",
    //                 method: "transfer",
    //                 args: [
    //                     "5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty",
    //                     "99999999999999999999999",
    //                 ],
    //             },
    //         };

    //         const result = await simulateWasmTransaction(request);

    //         expect(result.success).toBe(false);
    //         expect(result.error).toEqual(decodedError);
    //         expect(wasmErrorDecoder.decodeWasmError).toHaveBeenCalled();
    //         expect(chopsticksService.reset).toHaveBeenCalled();
    //     });

    //     it("should handle unknown extrinsic method", async () => {
    //         const request = {
    //             sender: "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
    //             extrinsic: {
    //                 pallet: "nonexistent",
    //                 method: "unknownMethod",
    //                 args: [],
    //             },
    //         };

    //         const result = await simulateWasmTransaction(request);

    //         expect(result.success).toBe(false);
    //         expect(result.error).toMatchObject({
    //             type: "unknown",
    //             message: expect.stringContaining("Unknown extrinsic"),
    //         });
    //     });

    //     it("should handle simulation errors gracefully", async () => {
    //         (chopsticksService.submitExtrinsic as jest.Mock).mockRejectedValue(
    //             new Error("Network error"),
    //         );

    //         const request = {
    //             sender: "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
    //             extrinsic: {
    //                 pallet: "balances",
    //                 method: "transfer",
    //                 args: [
    //                     "5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty",
    //                     "1000000000000000000",
    //                 ],
    //             },
    //         };

    //         const result = await simulateWasmTransaction(request);

    //         expect(result.success).toBe(false);
    //         expect(result.error).toMatchObject({
    //             type: "unknown",
    //             message: "Network error",
    //         });
    //         expect(chopsticksService.reset).toHaveBeenCalled();
    //     });

    //     it("should handle reset failure during error recovery", async () => {
    //         (chopsticksService.submitExtrinsic as jest.Mock).mockRejectedValue(
    //             new Error("Submit failed"),
    //         );
    //         (chopsticksService.reset as jest.Mock).mockRejectedValue(
    //             new Error("Reset failed"),
    //         );

    //         const request = {
    //             sender: "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
    //             extrinsic: {
    //                 pallet: "balances",
    //                 method: "transfer",
    //                 args: [
    //                     "5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty",
    //                     "1000000000000000000",
    //                 ],
    //             },
    //         };

    //         const result = await simulateWasmTransaction(request);

    //         expect(result.success).toBe(false);
    //         expect(result.error).toBeDefined();
    //     });
    // });

    describe("Event-based balance tracking", () => {
        it("should track balance changes from Transfer events", async () => {
            const events = [
                {
                    pallet: "balances",
                    method: "Transfer",
                    data: {
                        from: "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
                        to: "5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty",
                        amount: "1000000000000000000",
                    },
                    extrinsicIndex: 1,
                },
                {
                    pallet: "balances",
                    method: "Withdraw",
                    data: {
                        who: "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
                        amount: "100000000000000000",
                    },
                    extrinsicIndex: 1,
                },
            ];

            (
                wasmEventDecoder.filterEventsByExtrinsicIndex as jest.Mock
            ).mockReturnValue(events);
            (
                wasmEventDecoder.filterRelevantEvents as jest.Mock
            ).mockReturnValue(events);

            const request = {
                sender: "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
                extrinsic: {
                    pallet: "balances",
                    method: "transfer",
                    args: [
                        "5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty",
                        "1000000000000000000",
                    ],
                },
            };

            (wasmBalanceTracker.captureBalances as jest.Mock).mockResolvedValue(
                new Map([
                    [
                        request.sender,
                        {
                            native: {
                                free: 2000000000000000000n,
                                reserved: 0n,
                            },
                            assets: new Map(),
                        },
                    ],
                    [
                        "5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty",
                        {
                            native: { free: 500000000000000000n, reserved: 0n },
                            assets: new Map(),
                        },
                    ],
                ]),
            );

            const result = await simulateWasmTransaction(request);

            expect(result.success).toBe(true);
            expect(result.stateChanges.sender.changes.length).toBeGreaterThan(
                0,
            );
            expect(result.stateChanges.recipient).not.toBeNull();
        });

        it("should track Deposit events", async () => {
            const events = [
                {
                    pallet: "balances",
                    method: "Deposit",
                    data: {
                        who: "5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty",
                        amount: "500000000000000000",
                    },
                    extrinsicIndex: 1,
                },
            ];

            (
                wasmEventDecoder.filterEventsByExtrinsicIndex as jest.Mock
            ).mockReturnValue(events);
            (
                wasmEventDecoder.filterRelevantEvents as jest.Mock
            ).mockReturnValue(events);

            const request = {
                sender: "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
                extrinsic: {
                    pallet: "balances",
                    method: "transfer",
                    args: [
                        "5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty",
                        "1000000000000000000",
                    ],
                },
            };

            const result = await simulateWasmTransaction(request);

            expect(result.success).toBe(true);
        });

        it("should track asset transfers", async () => {
            const events = [
                {
                    pallet: "assets",
                    method: "Transferred",
                    data: {
                        assetId: 1,
                        from: "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
                        to: "5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty",
                        amount: "1000000",
                    },
                    extrinsicIndex: 1,
                },
            ];

            (
                wasmEventDecoder.filterEventsByExtrinsicIndex as jest.Mock
            ).mockReturnValue(events);
            (
                wasmEventDecoder.filterRelevantEvents as jest.Mock
            ).mockReturnValue(events);

            const request = {
                sender: "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
                extrinsic: {
                    pallet: "assets",
                    method: "transfer",
                    args: [
                        1,
                        "5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty",
                        "1000000",
                    ],
                },
                trackAssets: [1],
            };

            const result = await simulateWasmTransaction(request);

            expect(result.success).toBe(true);
        });

        it("should track third-party affected addresses", async () => {
            const thirdParty =
                "5DAAnrj7VHTznn2AWBemMuyBwZWs6FNFjdyVXUeYum3PTXFy";
            const events = [
                {
                    pallet: "balances",
                    method: "Transfer",
                    data: {
                        from: "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
                        to: thirdParty,
                        amount: "500000000000000000",
                    },
                    extrinsicIndex: 1,
                },
            ];

            (
                wasmEventDecoder.filterEventsByExtrinsicIndex as jest.Mock
            ).mockReturnValue(events);
            (
                wasmEventDecoder.filterRelevantEvents as jest.Mock
            ).mockReturnValue(events);

            const request = {
                sender: "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
                extrinsic: {
                    pallet: "balances",
                    method: "transfer",
                    args: [
                        "5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty",
                        "1000000000000000000",
                    ],
                },
            };

            (wasmBalanceTracker.captureBalances as jest.Mock).mockResolvedValue(
                new Map([
                    [
                        request.sender,
                        {
                            native: {
                                free: 2000000000000000000n,
                                reserved: 0n,
                            },
                            assets: new Map(),
                        },
                    ],
                ]),
            );

            const result = await simulateWasmTransaction(request);

            expect(result.success).toBe(true);
            // Third party should appear in otherAffected
            expect(result.stateChanges.otherAffected).toBeDefined();
        });

        it("should handle multiple balance changes for same address", async () => {
            const events = [
                {
                    pallet: "balances",
                    method: "Transfer",
                    data: {
                        from: "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
                        to: "5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty",
                        amount: "1000000000000000000",
                    },
                    extrinsicIndex: 1,
                },
                {
                    pallet: "balances",
                    method: "Withdraw",
                    data: {
                        who: "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
                        amount: "100000000000000000",
                    },
                    extrinsicIndex: 1,
                },
                {
                    pallet: "balances",
                    method: "Deposit",
                    data: {
                        who: "5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty",
                        amount: "50000000000000000",
                    },
                    extrinsicIndex: 1,
                },
            ];

            (
                wasmEventDecoder.filterEventsByExtrinsicIndex as jest.Mock
            ).mockReturnValue(events);
            (
                wasmEventDecoder.filterRelevantEvents as jest.Mock
            ).mockReturnValue(events);

            const request = {
                sender: "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
                extrinsic: {
                    pallet: "balances",
                    method: "transfer",
                    args: [
                        "5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty",
                        "1000000000000000000",
                    ],
                },
            };

            (wasmBalanceTracker.captureBalances as jest.Mock).mockResolvedValue(
                new Map([
                    [
                        request.sender,
                        {
                            native: {
                                free: 3000000000000000000n,
                                reserved: 0n,
                            },
                            assets: new Map(),
                        },
                    ],
                    [
                        "5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty",
                        {
                            native: { free: 500000000000000000n, reserved: 0n },
                            assets: new Map(),
                        },
                    ],
                ]),
            );

            const result = await simulateWasmTransaction(request);

            expect(result.success).toBe(true);
            // Sender should have net change of -1.1 ETH (transfer + withdraw)
            // Recipient should have net change of +1.05 ETH (transfer + deposit)
        });
    });

    describe("Gas and payment info", () => {
        it("should calculate formatted partial fee", async () => {
            (chopsticksService.getPaymentInfo as jest.Mock).mockResolvedValue({
                weight: { refTime: "5000000", proofSize: "131072" },
                partialFee: "123456789012345678",
            });

            const request = {
                sender: "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
                extrinsic: {
                    pallet: "balances",
                    method: "transfer",
                    args: [
                        "5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty",
                        "1000000000000000000",
                    ],
                },
            };

            const result = await simulateWasmTransaction(request);

            expect(result.success).toBe(true);
            expect(result.gas.partialFee).toBe("123456789012345678");
            expect(result.gas.partialFeeFormatted).toBe("123456.789012");
            expect(result.gas.weight).toEqual({
                refTime: "5000000",
                proofSize: "131072",
            });
        });
    });

    describe("State changes without recipient", () => {
        it("should handle transactions without recipient", async () => {
            const request = {
                sender: "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
                extrinsic: {
                    pallet: "system",
                    method: "remark",
                    args: ["0x1234"],
                },
            };

            mockApi.tx.system = {
                remark: jest.fn().mockReturnValue(mockExtrinsic),
            };

            const events = [
                {
                    pallet: "balances",
                    method: "Withdraw",
                    data: {
                        who: "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
                        amount: "100000000000000000",
                    },
                    extrinsicIndex: 1,
                },
            ];

            (
                wasmEventDecoder.filterEventsByExtrinsicIndex as jest.Mock
            ).mockReturnValue(events);
            (
                wasmEventDecoder.filterRelevantEvents as jest.Mock
            ).mockReturnValue(events);

            const result = await simulateWasmTransaction(request);

            expect(result.success).toBe(true);
            expect(result.stateChanges.recipient).toBeNull();
            expect(result.stateChanges.sender).toBeDefined();
        });

        it("should handle recipient with no balance changes", async () => {
            const request = {
                sender: "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
                extrinsic: {
                    pallet: "balances",
                    method: "transfer",
                    args: [
                        "5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty",
                        "0",
                    ],
                },
            };

            const events = [
                {
                    pallet: "system",
                    method: "ExtrinsicSuccess",
                    data: {},
                    extrinsicIndex: 1,
                },
            ];

            (
                wasmEventDecoder.filterEventsByExtrinsicIndex as jest.Mock
            ).mockReturnValue(events);
            (
                wasmEventDecoder.filterRelevantEvents as jest.Mock
            ).mockReturnValue(events);

            const result = await simulateWasmTransaction(request);

            expect(result.success).toBe(true);
            expect(result.stateChanges.recipient).toBeNull();
        });
    });

    describe("Signature patching", () => {
        it("should patch signature bytes correctly", async () => {
            const request = {
                sender: "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
                extrinsic: {
                    pallet: "balances",
                    method: "transfer",
                    args: [
                        "5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty",
                        "1000000000000000000",
                    ],
                },
            };

            const result = await simulateWasmTransaction(request);

            expect(result.success).toBe(true);
            expect(chopsticksService.submitExtrinsic).toHaveBeenCalledWith(
                expect.stringMatching(/^0x[0-9a-f]+$/),
            );
        });
    });

    describe("Nested call handling", () => {
        it("should process nested calls with string rawHex", async () => {
            const request = {
                sender: "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
                extrinsic: {
                    pallet: "utility",
                    method: "batchAll",
                    args: [["0x123456", "0xabcdef"]],
                },
            };

            const result = await simulateWasmTransaction(request);

            expect(result.success).toBe(true);
        });

        it("should handle proxy calls", async () => {
            const request = {
                sender: "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
                extrinsic: {
                    pallet: "proxy",
                    method: "proxy",
                    args: [
                        "5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty",
                        null,
                        {
                            pallet: "balances",
                            method: "transfer",
                            args: [
                                "5DAAnrj7VHTznn2AWBemMuyBwZWs6FNFjdyVXUeYum3PTXFy",
                                "1000000000000000000",
                            ],
                        },
                    ],
                },
            };

            const result = await simulateWasmTransaction(request);

            expect(result.success).toBe(true);
        });
    });
});
