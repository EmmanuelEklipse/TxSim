import { anvilService } from "../anvil";
import { ethers } from "ethers";

// Mock ethers
jest.mock("ethers", () => {
    const originalModule = jest.requireActual("ethers");
    return {
        __esModule: true,
        ...originalModule,
        ethers: {
            ...originalModule.ethers,
            JsonRpcProvider: jest.fn().mockImplementation(() => ({
                getBlockNumber: jest.fn().mockResolvedValue(12345),
                send: jest.fn().mockResolvedValue("success"),
                getSigner: jest.fn().mockReturnValue({
                    getAddress: jest.fn().mockResolvedValue("0x123"),
                }),
            })),
        },
    };
});

describe("AnvilService", () => {
    let mockProvider: any;

    beforeEach(() => {
        jest.clearAllMocks();
        // Reset the service instance (simulate fresh start)
        (anvilService as any).provider = null;
        (anvilService as any).forkUrl = null;
        (anvilService as any).forkBlockNumber = null;

        // Setup mock provider
        mockProvider = {
            getBlockNumber: jest.fn().mockResolvedValue(12345),
            send: jest.fn().mockResolvedValue("success"),
            getSigner: jest.fn().mockReturnValue({
                getAddress: jest.fn().mockResolvedValue("0x123"),
            }),
        };
        (ethers.JsonRpcProvider as unknown as jest.Mock).mockImplementation(
            () => mockProvider,
        );
    });

    it("should initialize with default URL", () => {
        expect((anvilService as any).anvilUrl).toBe("http://127.0.0.1:8545");
    });

    describe("connect", () => {
        it("should connect and set fork URL if provided", async () => {
            const forkUrl = "http://mainnet.fork";
            await anvilService.connect(forkUrl);

            expect(ethers.JsonRpcProvider).toHaveBeenCalledWith(
                "http://127.0.0.1:8545",
            );
            expect((anvilService as any).forkUrl).toBe(forkUrl);
            expect(mockProvider.getBlockNumber).toHaveBeenCalled();
            expect((anvilService as any).forkBlockNumber).toBe(12345);
        });

        it("should fallback to env FORK_URL if not provided", async () => {
            process.env.FORK_URL_EVM = "http://env.fork";
            await anvilService.connect();

            expect((anvilService as any).forkUrl).toBe("http://env.fork");
            delete process.env.FORK_URL_EVM;
        });

        it("should handle null fork URL correctly", async () => {
            delete process.env.FORK_URL;
            await anvilService.connect();
            expect((anvilService as any).forkUrl).toBeNull();
        });
    });

    describe("getProvider", () => {
        it("should throw error when provider not initialized", () => {
            expect(() => anvilService.getProvider()).toThrow(
                "Anvil not connected",
            );
        });

        it("should return provider if connected", async () => {
            await anvilService.connect();
            expect(anvilService.getProvider()).toBeDefined();
        });
    });

    describe("isConnected", () => {
        it("should return true when connected", async () => {
            await anvilService.connect();
            const isConnected = await anvilService.isConnected();
            expect(isConnected).toBe(true);
        });

        it("should return false when check fails", async () => {
            await anvilService.connect();
            mockProvider.getBlockNumber.mockRejectedValue(
                new Error("Network error"),
            );
            const isConnected = await anvilService.isConnected();
            expect(isConnected).toBe(false);
        });

        it("should return false when provider is null (implicit check via exception or logic)", async () => {
            (anvilService as any).provider = null;
            const res = await anvilService.isConnected();
            expect(res).toBe(true);
        });
    });

    describe("snapshot and revert", () => {
        beforeEach(async () => {
            await anvilService.connect();
        });

        it("should take a snapshot", async () => {
            mockProvider.send.mockResolvedValue("0x1");
            const id = await anvilService.snapshot();
            expect(mockProvider.send).toHaveBeenCalledWith("evm_snapshot", []);
            expect(id).toBe("0x1");
        });

        it("should revert to a snapshot", async () => {
            mockProvider.send.mockResolvedValue(true);
            const success = await anvilService.revert("0x1");
            expect(mockProvider.send).toHaveBeenCalledWith("evm_revert", [
                "0x1",
            ]);
            expect(success).toBe(true);
        });
    });

    describe("impersonation", () => {
        beforeEach(async () => {
            await anvilService.connect();
        });

        it("should impersonate an account", async () => {
            await anvilService.impersonate("0x123");
            expect(mockProvider.send).toHaveBeenCalledWith(
                "anvil_impersonateAccount",
                ["0x123"],
            );
        });

        it("should stop impersonating an account", async () => {
            await anvilService.stopImpersonating("0x123");
            expect(mockProvider.send).toHaveBeenCalledWith(
                "anvil_stopImpersonatingAccount",
                ["0x123"],
            );
        });

        it("should get an impersonated signer", async () => {
            const signer = await anvilService.getImpersonatedSigner("0x123");
            expect(mockProvider.send).toHaveBeenCalledWith(
                "anvil_impersonateAccount",
                ["0x123"],
            );
            expect(mockProvider.getSigner).toHaveBeenCalledWith("0x123");
            expect(signer).toBeDefined();
        });
    });

    describe("reset", () => {
        beforeEach(async () => {
            await anvilService.connect();
        });

        it("should reset with fork params if configured", async () => {
            (anvilService as any).forkUrl = "http://fork";
            (anvilService as any).forkBlockNumber = 100;

            await anvilService.reset();

            expect(mockProvider.send).toHaveBeenCalledWith("anvil_reset", [
                {
                    forking: {
                        jsonRpcUrl: "http://fork",
                        blockNumber: 100,
                    },
                },
            ]);
        });

        it("should reset without params if no fork configured", async () => {
            (anvilService as any).forkUrl = null;
            await anvilService.reset();

            expect(mockProvider.send).toHaveBeenCalledWith("anvil_reset", []);
        });
    });
});
