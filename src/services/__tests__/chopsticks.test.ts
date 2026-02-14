import { chopsticksService } from "../chopsticks";
import { ApiPromise, HttpProvider } from "@polkadot/api";

// Mock @polkadot/api
jest.mock("@polkadot/api", () => ({
    ApiPromise: {
        create: jest.fn(),
    },
    HttpProvider: jest.fn(),
}));

describe("ChopsticksService", () => {
    let mockApi: any;
    let mockProvider: any;

    beforeEach(() => {
        jest.clearAllMocks();

        // Setup mock provider
        mockProvider = {
            send: jest.fn(),
        };
        (HttpProvider as unknown as jest.Mock).mockReturnValue(mockProvider);

        // Setup mock API
        mockApi = {
            rpc: {
                system: {
                    chain: jest.fn().mockResolvedValue("Dev Chain"),
                    health: jest.fn().mockResolvedValue({}),
                    dryRun: jest.fn(), // for Method 2
                },
                chain: {
                    getHeader: jest.fn().mockResolvedValue({
                        number: { toNumber: () => 100 },
                        hash: "0x123",
                    }),
                },
            },
            call: {
                dryRunApi: {
                    dryRunCall: jest.fn(), // for Method 1
                },
            },
            disconnect: jest.fn(),
        };
        (ApiPromise.create as jest.Mock).mockResolvedValue(mockApi);

        // Reset service state
        (chopsticksService as any).api = null;
        (chopsticksService as any).provider = null;
    });

    it("should initialize with default endpoint", () => {
        expect((chopsticksService as any).endpoint).toBe(
            "http://localhost:8546",
        );
    });

    describe("connect", () => {
        it("should connect to the given endpoint", async () => {
            const endpoint = "http://custom:8000";
            await chopsticksService.connect(endpoint);

            expect((chopsticksService as any).endpoint).toBe(endpoint);
            expect(HttpProvider).toHaveBeenCalledWith(endpoint);
            expect(ApiPromise.create).toHaveBeenCalled();
            expect(mockApi.rpc.system.chain).toHaveBeenCalled();
        });
    });

    describe("getApi", () => {
        it("should throw error if not connected", () => {
            expect(() => chopsticksService.getApi()).toThrow(
                "Chopsticks not connected",
            );
        });

        it("should return API if connected", async () => {
            await chopsticksService.connect();
            expect(chopsticksService.getApi()).toBe(mockApi);
        });
    });

    describe("isConnected", () => {
        it("should return true if health check passes", async () => {
            await chopsticksService.connect();
            const result = await chopsticksService.isConnected();
            expect(result).toBe(true);
        });

        it("should return false if api is null", async () => {
            const result = await chopsticksService.isConnected();
            expect(result).toBe(false);
        });

        it("should return false if health check fails", async () => {
            await chopsticksService.connect();
            mockApi.rpc.system.health.mockRejectedValue(new Error("Down"));
            const result = await chopsticksService.isConnected();
            expect(result).toBe(false);
        });
    });

    describe("dryRun", () => {
        const mockExtrinsic = { method: "0x123", toHex: () => "0x123hex" };
        const sender = "0xSender";

        beforeEach(async () => {
            await chopsticksService.connect();
        });

        it("should use Method 1 (dryRunApi) if available", async () => {
            // Mock dryRunApi success
            mockApi.call.dryRunApi.dryRunCall.mockResolvedValue({
                isOk: true,
                asOk: {
                    executionResult: {
                        isOk: true,
                        asOk: {
                            actualWeight: {
                                refTime: { toString: () => "100" },
                                proofSize: { toString: () => "200" },
                            },
                        },
                    },
                },
            });

            const result = await chopsticksService.dryRun(
                mockExtrinsic,
                sender,
            );

            expect(result.success).toBe(true);
            expect(result.weight?.refTime).toBe("100");
            expect(result.weight?.proofSize).toBe("200");
        });

        it("should fallback to Method 2 (system.dryRun) if Method 1 fails", async () => {
            // Method 1 fails
            mockApi.call.dryRunApi.dryRunCall.mockRejectedValue(
                new Error("Not supported"),
            );

            // Method 2 succeeds
            mockApi.rpc.system.dryRun.mockResolvedValue({
                isOk: true,
                asOk: {},
            });

            const result = await chopsticksService.dryRun(
                mockExtrinsic,
                sender,
            );

            expect(result.success).toBe(true);
            expect(result.weight).toEqual({ refTime: "0", proofSize: "0" });
        });

        it("should fallback to Method 3 (Execution) if both fail", async () => {
            // Method 1 fails
            mockApi.call.dryRunApi.dryRunCall.mockRejectedValue(
                new Error("Not supported"),
            );

            // Method 2 fails
            mockApi.rpc.system.dryRun.mockRejectedValue(
                new Error("Not supported"),
            );

            const result = await chopsticksService.dryRun(
                mockExtrinsic,
                sender,
            );

            expect(result.success).toBe(true); // Should return optimistic success
            expect(result.weight).toEqual({ refTime: "0", proofSize: "0" });
        });

        it("should handle executionResult.isOk being false inside dryRunApi", async () => {
            mockApi.call.dryRunApi.dryRunCall.mockResolvedValue({
                isOk: true,
                asOk: {
                    executionResult: {
                        isOk: false, // Execution failed
                        asErr: "SomeError",
                    },
                },
            });

            const result = await chopsticksService.dryRun(
                mockExtrinsic,
                sender,
            );
            expect(result.success).toBe(false);
            expect(result.error).toBe("SomeError");
        });

        it("should handle overall Result.isErr inside dryRunApi", async () => {
            mockApi.call.dryRunApi.dryRunCall.mockResolvedValue({
                isOk: false, // RPC call failed logic? Or runtime logic
                asErr: "DispatchError",
            });

            const result = await chopsticksService.dryRun(
                mockExtrinsic,
                sender,
            );
            expect(result.success).toBe(false);
            expect(result.error).toBe("DispatchError");
        });

        it("should handle system.dryRun failure result", async () => {
            // Method 1 fails
            mockApi.call.dryRunApi.dryRunCall.mockRejectedValue(
                new Error("Not supported"),
            );

            // Method 2 returns Err
            mockApi.rpc.system.dryRun.mockResolvedValue({
                isOk: false,
                asErr: "SystemDryRunError",
            });

            const result = await chopsticksService.dryRun(
                mockExtrinsic,
                sender,
            );

            expect(result.success).toBe(false);
            expect(result.error).toBe("SystemDryRunError");
        });

        it("should handle old format executionResult (direct Ok/Err) in parseDryRunResult", async () => {
            mockApi.call.dryRunApi.dryRunCall.mockResolvedValue({
                isOk: true,
                asOk: {
                    // executionResult is undefined
                    isOk: true,
                    asOk: {
                        actualWeight: {
                            refTime: { toString: () => "50" },
                            proofSize: { toString: () => "60" },
                        },
                    },
                },
            });

            const result = await chopsticksService.dryRun(
                mockExtrinsic,
                sender,
            );
            expect(result.success).toBe(true);
            expect(result.weight?.refTime).toBe("50");
        });

        it("should handle old format executionResult failure", async () => {
            mockApi.call.dryRunApi.dryRunCall.mockResolvedValue({
                isOk: true,
                asOk: {
                    // executionResult is undefined
                    isOk: false,
                    asErr: "OldFormatError",
                },
            });

            const result = await chopsticksService.dryRun(
                mockExtrinsic,
                sender,
            );
            expect(result.success).toBe(false);
            expect(result.error).toBe("OldFormatError");
        });
    });

    describe("signature verification", () => {
        beforeEach(async () => {
            await chopsticksService.connect();
        });

        it("should disable signature verification", async () => {
            // Mock provider send via type casting
            (mockProvider as any).send = jest.fn().mockResolvedValue("ok");

            await chopsticksService.disableSignatureVerification();
            expect(mockProvider.send).toHaveBeenCalledWith(
                "dev_setSignatureVerification",
                [false],
            );
        });

        it("should enable signature verification", async () => {
            (mockProvider as any).send = jest.fn().mockResolvedValue("ok");

            await chopsticksService.enableSignatureVerification();
            expect(mockProvider.send).toHaveBeenCalledWith(
                "dev_setSignatureVerification",
                [true],
            );
        });

        it("should throw if provider not initialized", async () => {
            (chopsticksService as any).provider = null;
            await expect(
                chopsticksService.disableSignatureVerification(),
            ).rejects.toThrow("Provider not initialized");
            await expect(
                chopsticksService.enableSignatureVerification(),
            ).rejects.toThrow("Provider not initialized");
        });
    });

    describe("submitExtrinsic", () => {
        beforeEach(async () => {
            // Mock fetch for rawRpc
            global.fetch = jest.fn().mockResolvedValue({
                json: jest.fn().mockResolvedValue({ result: "hash" }),
            } as any);
            await chopsticksService.connect();
        });

        it("should submit extrinsic via raw RPC", async () => {
            const hash = await chopsticksService.submitExtrinsic("0xhex");
            expect(hash).toBe("hash");
            expect(global.fetch).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({
                    method: "POST",
                    body: expect.stringContaining("author_submitExtrinsic"),
                }),
            );
        });
    });

    describe("reset", () => {
        beforeEach(async () => {
            await chopsticksService.connect();
        });

        it("should reset using dev_setHead", async () => {
            global.fetch = jest.fn().mockResolvedValue({
                json: jest.fn().mockResolvedValue({ result: null }),
            } as any);

            await chopsticksService.reset();

            expect(global.fetch).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({
                    method: "POST",
                    body: expect.stringContaining("dev_setHead"),
                }),
            );
        });

        it("should reconnect if reset fails", async () => {
            global.fetch = jest.fn().mockResolvedValueOnce({
                json: jest.fn().mockResolvedValue({ error: "Failed" }),
            } as any);

            // Mock connect again
            const spyConnect = jest.spyOn(chopsticksService, "connect");
            const spyDisconnect = jest.spyOn(chopsticksService, "disconnect");

            await chopsticksService.reset();

            expect(spyDisconnect).toHaveBeenCalled();
            expect(spyConnect).toHaveBeenCalled();
        });
    });

    describe("payment info", () => {
        beforeEach(async () => {
            await chopsticksService.connect();
        });

        it("should get payment info", async () => {
            const mockExtrinsic = {
                paymentInfo: jest.fn().mockResolvedValue({
                    partialFee: { toString: () => "1000" },
                    weight: {
                        refTime: { toString: () => "10" },
                        proofSize: { toString: () => "20" },
                    },
                }),
            };

            const info = await chopsticksService.getPaymentInfo(
                mockExtrinsic,
                "sender",
            );

            expect(info.partialFee).toBe("1000");
            expect(info.weight.refTime).toBe("10");
        });
    });

    describe("block production", () => {
        beforeEach(async () => {
            // Mock fetch for rawRpc
            global.fetch = jest.fn().mockResolvedValue({
                json: jest.fn().mockResolvedValue({ result: "hash" }),
            } as any);
            await chopsticksService.connect();
        });

        it("should produce a new block", async () => {
            const hash = await chopsticksService.newBlock();
            expect(hash).toBe("hash");
            expect(global.fetch).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({
                    body: expect.stringContaining("dev_newBlock"),
                }),
            );
        });

        it("should execute extrinsic via dev_newBlock", async () => {
            const hash = await chopsticksService.executeExtrinsic("0xcall");
            expect(hash).toBe("hash");
            expect(global.fetch).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({
                    body: expect.stringContaining("unsignedExtrinsics"),
                }),
            );
        });
    });
});
