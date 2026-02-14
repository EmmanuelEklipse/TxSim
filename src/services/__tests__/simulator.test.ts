import { simulateTransaction } from "../simulator";
import { anvilService } from "../anvil";
import { ethers } from "ethers";
import * as errorDecoder from "../../utils/error-decoder";
import * as eventDecoder from "../../utils/event-decoder";
import * as gasCalculator from "../../utils/gas-calculator";
import * as stateImpact from "../../utils/state-impact";
import * as tokenInfo from "../../utils/token-info";

// Mock all dependencies
jest.mock("../anvil");
jest.mock("../../utils/error-decoder");
jest.mock("../../utils/event-decoder");
jest.mock("../../utils/gas-calculator");
jest.mock("../../utils/state-impact");
jest.mock("../../utils/token-info");

// Mock ethers JsonRpcProvider to prevent actual network calls
const mockGetFeeData = jest.fn().mockResolvedValue({
    gasPrice: 1000000000n,
});

jest.mock("ethers", () => {
    const actual = jest.requireActual("ethers");
    class MockJsonRpcProvider {
        constructor() {}
        getFeeData = mockGetFeeData;
    }
    return {
        ...actual,
        JsonRpcProvider: MockJsonRpcProvider,
    };
});

describe("simulateTransaction", () => {
    let mockProvider: any;
    let mockSigner: any;
    let mockTx: any;
    let mockReceipt: any;

    beforeEach(() => {
        // Reset all mocks
        jest.clearAllMocks();

        // Mock provider
        mockProvider = {
            getBalance: jest.fn().mockResolvedValue(1000000000000000000n),
            getFeeData: jest.fn().mockResolvedValue({
                gasPrice: 1000000000n,
            }),
        };

        // Mock transaction and receipt
        mockTx = {
            wait: jest.fn(),
        };

        mockReceipt = {
            status: 1,
            logs: [],
            gasUsed: 21000n,
            gasPrice: 1000000000n,
        };

        mockTx.wait.mockResolvedValue(mockReceipt);

        // Mock signer
        mockSigner = {
            sendTransaction: jest.fn().mockResolvedValue(mockTx),
        };

        // Mock anvil service
        (anvilService.getProvider as jest.Mock).mockReturnValue(mockProvider);
        (anvilService.snapshot as jest.Mock).mockResolvedValue("snapshot-1");
        (anvilService.getImpersonatedSigner as jest.Mock).mockResolvedValue(
            mockSigner,
        );
        (anvilService.stopImpersonating as jest.Mock).mockResolvedValue(
            undefined,
        );
        (anvilService.revert as jest.Mock).mockResolvedValue(true);
        (anvilService.getMutex as jest.Mock).mockReturnValue({
            acquire: jest.fn().mockResolvedValue(() => {}),
        });

        // Mock utility functions
        (tokenInfo.getTokenBalance as jest.Mock).mockResolvedValue(0n);
        (eventDecoder.decodeLogs as jest.Mock).mockReturnValue([]);
        (gasCalculator.calculateGasReport as jest.Mock).mockResolvedValue({
            gasUsed: "21000",
            gasPrice: "1000000000",
            totalCostWei: "21000000000000",
            totalCostNative: "0.000021",
            nativeSymbol: "GLMR",
        });
        (stateImpact.buildStateImpactReport as jest.Mock).mockResolvedValue({
            sender: {
                address: "0x742d35cc6634c0532925a3b844bc9e7595f0beb7",
                before: [],
                after: [],
                changes: [],
            },
            recipient: {
                address: "0x000000000000000000000000000000000000dead",
                before: [],
                after: [],
                changes: [],
            },
            contractsAffected: [],
        });
    });

    describe("Successful transactions", () => {
        it("should simulate successful native token transfer", async () => {
            const request = {
                sender: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7",
                transaction: {
                    to: "0x000000000000000000000000000000000000dead",
                    data: "0x",
                    value: "1000000000000000000",
                },
            };

            const result = await simulateTransaction(request);

            expect(result.success).toBe(true);
            expect(result.events).toEqual([]);
            expect(result.gas.gasUsed).toBe("21000");
            expect(result.error).toBeUndefined();
            expect(anvilService.snapshot).toHaveBeenCalled();
            expect(anvilService.getImpersonatedSigner).toHaveBeenCalledWith(
                request.sender,
            );
            expect(mockSigner.sendTransaction).toHaveBeenCalledWith({
                to: request.transaction.to,
                data: "0x",
                value: 1000000000000000000n,
                gasLimit: undefined,
                gasPrice: 1000000000n,
            });
            expect(anvilService.stopImpersonating).toHaveBeenCalledWith(
                request.sender,
            );
            expect(anvilService.revert).toHaveBeenCalledWith("snapshot-1");
        });

        it("should simulate transaction with custom gas limit", async () => {
            const request = {
                sender: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7",
                transaction: {
                    to: "0x000000000000000000000000000000000000dead",
                    data: "0x",
                    gasLimit: "100000",
                },
            };

            const result = await simulateTransaction(request);

            expect(result.success).toBe(true);
            expect(mockSigner.sendTransaction).toHaveBeenCalledWith({
                to: request.transaction.to,
                data: "0x",
                value: 0n,
                gasLimit: 100000n,
                gasPrice: 1000000000n,
            });
        });

        it("should simulate transaction with contract interaction", async () => {
            const request = {
                sender: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7",
                transaction: {
                    to: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
                    data: "0x70a08231000000000000000000000000742d35cc6634c0532925a3b844bc9e7595f0beb7",
                },
            };

            const result = await simulateTransaction(request);

            expect(result.success).toBe(true);
            expect(mockSigner.sendTransaction).toHaveBeenCalledWith({
                to: request.transaction.to,
                data: request.transaction.data,
                value: 0n,
                gasLimit: undefined,
                gasPrice: 1000000000n,
            });
        });

        it("should handle transaction without data field", async () => {
            const request = {
                sender: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7",
                transaction: {
                    to: "0x000000000000000000000000000000000000dead",
                    value: "1000000000000000000",
                },
            };

            const result = await simulateTransaction(request);

            expect(result.success).toBe(true);
            expect(mockSigner.sendTransaction).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: "0x",
                }),
            );
        });

        it("should normalize addresses to lowercase", async () => {
            const request = {
                sender: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7",
                transaction: {
                    to: "0x000000000000000000000000000000000000DEAD",
                },
            };

            const result = await simulateTransaction(request);

            expect(result.success).toBe(true);
            expect(mockProvider.getBalance).toHaveBeenCalledWith(
                "0x742d35cc6634c0532925a3b844bc9e7595f0beb7",
            );
            expect(mockProvider.getBalance).toHaveBeenCalledWith(
                "0x000000000000000000000000000000000000dead",
            );
        });
    });

    describe("Failed transactions", () => {
        it("should handle transaction revert (status 0)", async () => {
            mockReceipt.status = 0;

            const request = {
                sender: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7",
                transaction: {
                    to: "0x000000000000000000000000000000000000dead",
                    data: "0x",
                },
            };

            const result = await simulateTransaction(request);

            expect(result.success).toBe(false);
            expect(result.error).toEqual({
                type: "revert",
                message: "Transaction reverted",
            });
        });

        it("should handle impersonation failure", async () => {
            (anvilService.getImpersonatedSigner as jest.Mock).mockRejectedValue(
                new Error("Impersonation failed"),
            );

            (errorDecoder.decodeEVMError as jest.Mock).mockReturnValue({
                type: "revert",
                message: "Impersonation failed",
            });

            const request = {
                sender: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7",
                transaction: {
                    to: "0x000000000000000000000000000000000000dead",
                    data: "0x",
                },
            };

            const result = await simulateTransaction(request);

            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
            expect(errorDecoder.decodeEVMError).toHaveBeenCalled();
            expect(result.stateChanges.sender.address).toBe(
                request.sender.toLowerCase(),
            );
            expect(result.stateChanges.recipient.address).toBe(
                request.transaction.to.toLowerCase(),
            );
            expect(result.gas).toEqual({
                gasUsed: "0",
                gasPrice: "0",
                totalCostWei: "0",
                totalCostNative: "0",
                nativeSymbol: "GLMR",
            });
        });

        it("should handle transaction execution error", async () => {
            mockSigner.sendTransaction.mockRejectedValue(
                new Error("Insufficient funds"),
            );

            (errorDecoder.decodeEVMError as jest.Mock).mockReturnValue({
                type: "insufficient_funds",
                message: "Insufficient funds for transaction",
            });

            const request = {
                sender: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7",
                transaction: {
                    to: "0x000000000000000000000000000000000000dead",
                    value: "999999999999999999999999",
                },
            };

            const result = await simulateTransaction(request);

            expect(result.success).toBe(false);
            expect(result.error.type).toBe("insufficient_funds");
        });

        it("should handle receipt wait error", async () => {
            mockTx.wait.mockRejectedValue(new Error("Transaction timeout"));

            (errorDecoder.decodeEVMError as jest.Mock).mockReturnValue({
                type: "timeout",
                message: "Transaction timeout",
            });

            const request = {
                sender: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7",
                transaction: {
                    to: "0x000000000000000000000000000000000000dead",
                },
            };

            const result = await simulateTransaction(request);

            expect(result.success).toBe(false);
            expect(result.error.type).toBe("timeout");
        });
    });

    describe("Token tracking", () => {
        it("should track token balances when requested", async () => {
            const tokenAddress = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
            const request = {
                sender: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7",
                transaction: {
                    to: "0x000000000000000000000000000000000000dead",
                    data: "0x",
                },
                trackTokens: [tokenAddress],
            };

            (tokenInfo.getTokenBalance as jest.Mock).mockResolvedValue(
                1000000n,
            );

            const result = await simulateTransaction(request);

            expect(result.success).toBe(true);
            expect(tokenInfo.getTokenBalance).toHaveBeenCalledWith(
                mockProvider,
                tokenAddress,
                expect.any(String),
            );
            // Called for sender and recipient, before and after
            expect(tokenInfo.getTokenBalance).toHaveBeenCalledTimes(4);
        });

        it("should track multiple token balances", async () => {
            const tokens = [
                "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // USDC
                "0xdAC17F958D2ee523a2206206994597C13D831ec7", // USDT
            ];

            const request = {
                sender: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7",
                transaction: {
                    to: "0x000000000000000000000000000000000000dead",
                },
                trackTokens: tokens,
            };

            const result = await simulateTransaction(request);

            expect(result.success).toBe(true);
            // 2 tokens × 2 addresses × 2 snapshots (before/after) = 8 calls
            expect(tokenInfo.getTokenBalance).toHaveBeenCalledTimes(8);
        });

        it("should normalize token addresses to lowercase", async () => {
            const tokenAddress = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
            const request = {
                sender: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7",
                transaction: {
                    to: "0x000000000000000000000000000000000000dead",
                },
                trackTokens: [tokenAddress.toUpperCase()],
            };

            await simulateTransaction(request);

            expect(tokenInfo.getTokenBalance).toHaveBeenCalledWith(
                mockProvider,
                tokenAddress.toUpperCase(),
                expect.any(String),
            );
        });
    });

    describe("ERC20 transfer recipient extraction", () => {
        it("should extract recipient from transfer(address,uint256) calldata", async () => {
            const recipient = "0x1111111111111111111111111111111111111111";
            const request = {
                sender: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7",
                transaction: {
                    to: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
                    // transfer(address,uint256) = 0xa9059cbb + recipient + amount
                    data: `0xa9059cbb000000000000000000000000${recipient.slice(2)}00000000000000000000000000000000000000000000000000000000000003e8`,
                },
            };

            await simulateTransaction(request);

            expect(stateImpact.buildStateImpactReport).toHaveBeenCalled();
            const call = (stateImpact.buildStateImpactReport as jest.Mock).mock
                .calls[0];
            // The extracted recipient should be passed as the last argument
            expect(call[7]).toBe(recipient.toLowerCase());
        });

        it("should extract recipient from transferFrom(address,address,uint256) calldata", async () => {
            const from = "0x2222222222222222222222222222222222222222";
            const to = "0x3333333333333333333333333333333333333333";
            const request = {
                sender: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7",
                transaction: {
                    to: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
                    // transferFrom(address,address,uint256) = 0x23b872dd + from + to + amount
                    data: `0x23b872dd000000000000000000000000${from.slice(2)}000000000000000000000000${to.slice(2)}00000000000000000000000000000000000000000000000000000000000003e8`,
                },
            };

            await simulateTransaction(request);

            expect(stateImpact.buildStateImpactReport).toHaveBeenCalled();
            const call = (stateImpact.buildStateImpactReport as jest.Mock).mock
                .calls[0];
            expect(call[7]).toBe(to.toLowerCase());
        });

        it("should handle invalid transfer calldata gracefully", async () => {
            const request = {
                sender: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7",
                transaction: {
                    to: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
                    // Invalid/truncated transfer calldata
                    data: "0xa9059cbb0000",
                },
            };

            const result = await simulateTransaction(request);

            expect(result.success).toBe(true);
            const call = (stateImpact.buildStateImpactReport as jest.Mock).mock
                .calls[0];
            expect(call[7]).toBeNull();
        });

        it("should return null for non-transfer function selectors", async () => {
            const request = {
                sender: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7",
                transaction: {
                    to: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
                    // balanceOf(address) = 0x70a08231
                    data: "0x70a08231000000000000000000000000742d35cc6634c0532925a3b844bc9e7595f0beb7",
                },
            };

            await simulateTransaction(request);

            const call = (stateImpact.buildStateImpactReport as jest.Mock).mock
                .calls[0];
            expect(call[7]).toBeNull();
        });

        it("should handle empty data field", async () => {
            const request = {
                sender: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7",
                transaction: {
                    to: "0x000000000000000000000000000000000000dead",
                },
            };

            const result = await simulateTransaction(request);

            expect(result.success).toBe(true);
            const call = (stateImpact.buildStateImpactReport as jest.Mock).mock
                .calls[0];
            expect(call[7]).toBeNull();
        });

        it("should handle short data field", async () => {
            const request = {
                sender: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7",
                transaction: {
                    to: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
                    data: "0x12345678",
                },
            };

            const result = await simulateTransaction(request);

            expect(result.success).toBe(true);
            const call = (stateImpact.buildStateImpactReport as jest.Mock).mock
                .calls[0];
            expect(call[7]).toBeNull();
        });

        it("should validate extracted address is valid", async () => {
            const request = {
                sender: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7",
                transaction: {
                    to: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
                    // Invalid address in transfer data
                    data: "0xa9059cbb000000000000000000000000GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG00000000000000000000000000000000000000000000000000000000000003e8",
                },
            };

            const result = await simulateTransaction(request);

            expect(result.success).toBe(true);
            const call = (stateImpact.buildStateImpactReport as jest.Mock).mock
                .calls[0];
            expect(call[7]).toBeNull();
        });
    });

    describe("Event decoding and address tracking", () => {
        it("should decode transaction logs into events", async () => {
            const mockLogs = [
                {
                    address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
                    topics: [
                        "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
                    ],
                    data: "0x",
                },
            ];

            mockReceipt.logs = mockLogs;

            const decodedEvents = [
                {
                    name: "Transfer",
                    contract: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
                    args: {
                        from: "0x742d35cc6634c0532925a3b844bc9e7595f0beb7",
                        to: "0x1111111111111111111111111111111111111111",
                        value: "1000000",
                    },
                    signature: "Transfer(address,address,uint256)",
                    logIndex: 0,
                },
            ];

            (eventDecoder.decodeLogs as jest.Mock).mockReturnValue(
                decodedEvents,
            );

            const request = {
                sender: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7",
                transaction: {
                    to: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
                    data: "0x",
                },
            };

            const result = await simulateTransaction(request);

            expect(result.success).toBe(true);
            expect(result.events).toEqual(decodedEvents);
            expect(eventDecoder.decodeLogs).toHaveBeenCalledWith(mockLogs);
        });

        it("should track addresses from Transfer events", async () => {
            const transferEvents = [
                {
                    name: "Transfer",
                    contract: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
                    args: {
                        from: "0x742d35cc6634c0532925a3b844bc9e7595f0beb7",
                        to: "0x4444444444444444444444444444444444444444",
                        value: "500000",
                    },
                },
                {
                    name: "Transfer",
                    contract: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
                    args: {
                        from: "0x4444444444444444444444444444444444444444",
                        to: "0x5555555555555555555555555555555555555555",
                        value: "250000",
                    },
                },
            ];

            (eventDecoder.decodeLogs as jest.Mock).mockReturnValue(
                transferEvents,
            );

            const request = {
                sender: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7",
                transaction: {
                    to: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
                    data: "0x",
                },
            };

            await simulateTransaction(request);

            // Should fetch balances for all addresses found in Transfer events
            expect(mockProvider.getBalance).toHaveBeenCalledWith(
                "0x4444444444444444444444444444444444444444",
            );
            expect(mockProvider.getBalance).toHaveBeenCalledWith(
                "0x5555555555555555555555555555555555555555",
            );
        });

        it("should handle null receipt logs", async () => {
            mockReceipt.logs = null;

            const request = {
                sender: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7",
                transaction: {
                    to: "0x000000000000000000000000000000000000dead",
                },
            };

            const result = await simulateTransaction(request);

            expect(result.success).toBe(true);
            expect(result.events).toEqual([]);
            expect(eventDecoder.decodeLogs).not.toHaveBeenCalled();
        });

        it("should handle events without from/to fields", async () => {
            const events = [
                {
                    name: "Approval",
                    contract: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
                    args: {
                        owner: "0x742d35cc6634c0532925a3b844bc9e7595f0beb7",
                        spender: "0x1111111111111111111111111111111111111111",
                        value: "1000000",
                    },
                },
            ];

            (eventDecoder.decodeLogs as jest.Mock).mockReturnValue(events);

            const request = {
                sender: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7",
                transaction: {
                    to: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
                    data: "0x",
                },
            };

            const result = await simulateTransaction(request);

            expect(result.success).toBe(true);
            expect(result.events).toEqual(events);
        });

        it("should initialize newly discovered addresses with zero before balance", async () => {
            const newAddress = "0x6666666666666666666666666666666666666666";
            const transferEvents = [
                {
                    name: "Transfer",
                    contract: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
                    args: {
                        from: "0x742d35cc6634c0532925a3b844bc9e7595f0beb7",
                        to: newAddress,
                        value: "1000000",
                    },
                },
            ];

            (eventDecoder.decodeLogs as jest.Mock).mockReturnValue(
                transferEvents,
            );

            let balanceCallCount = 0;
            mockProvider.getBalance.mockImplementation(
                async (address: string) => {
                    balanceCallCount++;
                    // Return different values for before and after snapshots
                    if (address.toLowerCase() === newAddress.toLowerCase()) {
                        return balanceCallCount <= 2
                            ? 0n
                            : 1000000000000000000n;
                    }
                    return 1000000000000000000n;
                },
            );

            const request = {
                sender: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7",
                transaction: {
                    to: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
                    data: "0x",
                },
            };

            const result = await simulateTransaction(request);

            expect(result.success).toBe(true);
            // New address should have been tracked
            expect(mockProvider.getBalance).toHaveBeenCalledWith(
                newAddress.toLowerCase(),
            );
        });
    });

    describe("Cleanup and error recovery", () => {
        it("should stop impersonating and revert on success", async () => {
            const request = {
                sender: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7",
                transaction: {
                    to: "0x000000000000000000000000000000000000dead",
                },
            };

            await simulateTransaction(request);

            expect(anvilService.stopImpersonating).toHaveBeenCalledWith(
                request.sender,
            );
            expect(anvilService.revert).toHaveBeenCalledWith("snapshot-1");
        });

        it("should handle stopImpersonating failure gracefully", async () => {
            (anvilService.stopImpersonating as jest.Mock).mockRejectedValue(
                new Error("Stop impersonation failed"),
            );

            const request = {
                sender: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7",
                transaction: {
                    to: "0x000000000000000000000000000000000000dead",
                },
            };

            const result = await simulateTransaction(request);

            expect(result.success).toBe(true);
            expect(anvilService.revert).toHaveBeenCalled();
        });

        it("should call reset when revert fails", async () => {
            (anvilService.revert as jest.Mock).mockRejectedValue(
                new Error("Revert failed"),
            );
            (anvilService.reset as jest.Mock).mockResolvedValue(undefined);

            const request = {
                sender: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7",
                transaction: {
                    to: "0x000000000000000000000000000000000000dead",
                },
            };

            await simulateTransaction(request);

            expect(anvilService.reset).toHaveBeenCalled();
        });

        it("should handle both revert and reset failure", async () => {
            (anvilService.revert as jest.Mock).mockRejectedValue(
                new Error("Revert failed"),
            );
            (anvilService.reset as jest.Mock).mockRejectedValue(
                new Error("Reset failed"),
            );

            const request = {
                sender: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7",
                transaction: {
                    to: "0x000000000000000000000000000000000000dead",
                },
            };

            // Should throw fatal error when both cleanup methods fail
            await expect(simulateTransaction(request)).rejects.toThrow(
                /FATAL: State cleanup failed/,
            );
        });

        it("should not call stopImpersonating if impersonation never started", async () => {
            (anvilService.getImpersonatedSigner as jest.Mock).mockRejectedValue(
                new Error("Impersonation failed"),
            );
            (errorDecoder.decodeEVMError as jest.Mock).mockReturnValue({
                type: "error",
                message: "Impersonation failed",
            });

            const request = {
                sender: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7",
                transaction: {
                    to: "0x000000000000000000000000000000000000dead",
                },
            };

            await simulateTransaction(request);

            expect(anvilService.stopImpersonating).not.toHaveBeenCalled();
            expect(anvilService.revert).toHaveBeenCalled();
        });
    });

    describe("Gas and state reporting", () => {
        it("should calculate gas report with correct parameters", async () => {
            const request = {
                sender: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7",
                transaction: {
                    to: "0x000000000000000000000000000000000000dead",
                },
            };

            await simulateTransaction(request);

            expect(gasCalculator.calculateGasReport).toHaveBeenCalledWith(
                mockProvider,
                mockReceipt,
                "GLMR",
            );
        });

        it("should build state impact report with all tracked addresses", async () => {
            const request = {
                sender: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7",
                transaction: {
                    to: "0x000000000000000000000000000000000000dead",
                },
                trackTokens: ["0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"],
            };

            await simulateTransaction(request);

            expect(stateImpact.buildStateImpactReport).toHaveBeenCalledWith(
                mockProvider,
                request.sender,
                request.transaction.to,
                request.trackTokens,
                expect.any(Map),
                expect.any(Map),
                "GLMR",
                null,
            );
        });

        it("should pass extracted recipient to state impact report", async () => {
            const recipient = "0x1111111111111111111111111111111111111111";
            const request = {
                sender: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7",
                transaction: {
                    to: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
                    data: `0xa9059cbb000000000000000000000000${recipient.slice(2)}00000000000000000000000000000000000000000000000000000000000003e8`,
                },
            };

            await simulateTransaction(request);

            const call = (stateImpact.buildStateImpactReport as jest.Mock).mock
                .calls[0];
            expect(call[7]).toBe(recipient.toLowerCase());
        });
    });

    describe("Balance snapshot capture", () => {
        it("should capture native balances for all addresses", async () => {
            const request = {
                sender: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7",
                transaction: {
                    to: "0x000000000000000000000000000000000000dead",
                },
            };

            await simulateTransaction(request);

            // Should be called twice for each address (before and after)
            expect(mockProvider.getBalance).toHaveBeenCalledTimes(4);
        });

        it("should handle getBalance errors", async () => {
            mockProvider.getBalance.mockRejectedValueOnce(
                new Error("Balance fetch failed"),
            );

            (errorDecoder.decodeEVMError as jest.Mock).mockReturnValue({
                type: "error",
                message: "Balance fetch failed",
            });

            const request = {
                sender: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7",
                transaction: {
                    to: "0x000000000000000000000000000000000000dead",
                },
            };

            const result = await simulateTransaction(request);

            expect(result.success).toBe(false);
        });

        it("should capture token balances for tracked tokens", async () => {
            const tokenAddress = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
            (tokenInfo.getTokenBalance as jest.Mock)
                .mockResolvedValueOnce(1000000n) // sender before
                .mockResolvedValueOnce(0n) // recipient before
                .mockResolvedValueOnce(500000n) // sender after
                .mockResolvedValueOnce(500000n); // recipient after

            const request = {
                sender: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7",
                transaction: {
                    to: tokenAddress,
                    data: "0xa9059cbb0000000000000000000000001111111111111111111111111111111111111111000000000000000000000000000000000000000000000000000000000007a120",
                },
                trackTokens: [tokenAddress],
            };

            const result = await simulateTransaction(request);

            expect(result.success).toBe(true);
            expect(tokenInfo.getTokenBalance).toHaveBeenCalledTimes(6);
        });
    });
});
