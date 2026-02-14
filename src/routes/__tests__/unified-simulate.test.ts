// src/routes/__tests__/unified-simulate.test.ts

import request from "supertest";
import express, { Express } from "express";
import unifiedSimulateRouter from "../unified-simulate";
import { simulateTransaction } from "../../services/simulator";
import { simulateWasmTransaction } from "../../services/simulator-wasm";

// Mock the simulation services
jest.mock("../../services/simulator");
jest.mock("../../services/simulator-wasm");

const mockedSimulateTransaction = simulateTransaction as jest.MockedFunction<
    typeof simulateTransaction
>;
const mockedSimulateWasmTransaction =
    simulateWasmTransaction as jest.MockedFunction<
        typeof simulateWasmTransaction
    >;

describe("Unified Simulate Route", () => {
    let app: Express;

    beforeEach(() => {
        // Create a fresh Express app for each test
        app = express();
        app.use(express.json());
        app.use("/simulate", unifiedSimulateRouter);

        // Clear all mocks
        jest.clearAllMocks();
    });

    describe("Type Detection", () => {
        it("should detect EVM request when transaction field is present", async () => {
            const mockResponse = {
                success: true,
                stateChanges: {
                    sender: {
                        address: "0x123",
                        before: [],
                        after: [],
                        changes: [],
                    },
                    recipient: {
                        address: "0x456",
                        before: [],
                        after: [],
                        changes: [],
                    },
                    contractsAffected: [],
                },
                events: [],
                gas: {
                    gasUsed: "21000",
                    gasPrice: "1000000000",
                    totalCostWei: "21000000000000",
                    totalCostNative: "0.000021",
                    nativeSymbol: "GLMR",
                },
            };

            mockedSimulateTransaction.mockResolvedValue(mockResponse);

            const response = await request(app)
                .post("/simulate")
                .send({
                    sender: "0x742d35cc6634c0532925a3b844bc9e7595f0beb7",
                    transaction: {
                        to: "0x000000000000000000000000000000000000dead",
                        value: "1000000000000000000",
                    },
                });

            expect(response.status).toBe(200);
            expect(mockedSimulateTransaction).toHaveBeenCalledTimes(1);
            expect(mockedSimulateWasmTransaction).not.toHaveBeenCalled();
        });

        it("should detect WASM request when extrinsic field is present", async () => {
            const mockResponse = {
                success: true,
                stateChanges: {
                    sender: {
                        address: "5GrwvaEF",
                        before: [],
                        after: [],
                        changes: [],
                    },
                    recipient: null,
                    otherAffected: [],
                },
                events: [],
                gas: {
                    weight: { refTime: "159600000", proofSize: "3593" },
                    partialFee: "158960000",
                    partialFeeFormatted: "0.00015896",
                    nativeSymbol: "ASTR",
                },
            };

            mockedSimulateWasmTransaction.mockResolvedValue(mockResponse);

            const response = await request(app)
                .post("/simulate")
                .send({
                    sender: "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
                    extrinsic: {
                        pallet: "Balances",
                        method: "transferKeepAlive",
                        args: [
                            "5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty",
                            "1000000000000",
                        ],
                    },
                });

            expect(response.status).toBe(200);
            expect(mockedSimulateWasmTransaction).toHaveBeenCalledTimes(1);
            expect(mockedSimulateTransaction).not.toHaveBeenCalled();
        });

        it("should reject request with both transaction and extrinsic fields", async () => {
            const response = await request(app)
                .post("/simulate")
                .send({
                    sender: "0x742d35cc6634c0532925a3b844bc9e7595f0beb7",
                    transaction: {
                        to: "0x000000000000000000000000000000000000dead",
                    },
                    extrinsic: {
                        pallet: "Balances",
                        method: "transferKeepAlive",
                        args: [],
                    },
                });

            expect(response.status).toBe(400);
            expect(response.body.success).toBe(false);
            expect(response.body.error.message).toContain(
                "cannot contain both",
            );
            expect(mockedSimulateTransaction).not.toHaveBeenCalled();
            expect(mockedSimulateWasmTransaction).not.toHaveBeenCalled();
        });

        it("should reject request with neither transaction nor extrinsic field", async () => {
            const response = await request(app).post("/simulate").send({
                sender: "0x742d35cc6634c0532925a3b844bc9e7595f0beb7",
            });

            expect(response.status).toBe(400);
            expect(response.body.success).toBe(false);
            expect(response.body.error.message).toContain(
                "must contain either",
            );
            expect(mockedSimulateTransaction).not.toHaveBeenCalled();
            expect(mockedSimulateWasmTransaction).not.toHaveBeenCalled();
        });
    });

    describe("EVM Validation", () => {
        it("should accept valid EVM request", async () => {
            const mockResponse = {
                success: true,
                stateChanges: {
                    sender: {
                        address: "0x123",
                        before: [],
                        after: [],
                        changes: [],
                    },
                    recipient: {
                        address: "0x456",
                        before: [],
                        after: [],
                        changes: [],
                    },
                    contractsAffected: [],
                },
                events: [],
                gas: {
                    gasUsed: "21000",
                    gasPrice: "1000000000",
                    totalCostWei: "21000000000000",
                    totalCostNative: "0.000021",
                    nativeSymbol: "GLMR",
                },
            };

            mockedSimulateTransaction.mockResolvedValue(mockResponse);

            const response = await request(app)
                .post("/simulate")
                .send({
                    sender: "0x742d35cc6634c0532925a3b844bc9e7595f0beb7",
                    transaction: {
                        to: "0x000000000000000000000000000000000000dead",
                        data: "0xa9059cbb",
                        value: "1000000000000000000",
                        gasLimit: "100000",
                    },
                    trackTokens: ["0x818ec0A7Fe18Ff94269904fCED6AE3DaE6d6dC0b"],
                });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(mockedSimulateTransaction).toHaveBeenCalledWith({
                sender: "0x742d35cc6634c0532925a3b844bc9e7595f0beb7",
                transaction: {
                    to: "0x000000000000000000000000000000000000dead",
                    data: "0xa9059cbb",
                    value: "1000000000000000000",
                    gasLimit: "100000",
                },
                trackTokens: ["0x818ec0A7Fe18Ff94269904fCED6AE3DaE6d6dC0b"],
            });
        });

        it("should reject EVM request with missing sender", async () => {
            const response = await request(app)
                .post("/simulate")
                .send({
                    transaction: {
                        to: "0x000000000000000000000000000000000000dead",
                    },
                });

            expect(response.status).toBe(400);
            expect(response.body.success).toBe(false);
            expect(response.body.error.message).toContain(
                "Missing required fields",
            );
        });

        it("should reject EVM request with missing transaction.to", async () => {
            const response = await request(app)
                .post("/simulate")
                .send({
                    sender: "0x742d35cc6634c0532925a3b844bc9e7595f0beb7",
                    transaction: {
                        value: "1000000000000000000",
                    },
                });

            expect(response.status).toBe(400);
            expect(response.body.success).toBe(false);
            expect(response.body.error.message).toContain(
                "Missing required fields",
            );
        });

        it("should reject EVM request with invalid sender address", async () => {
            const response = await request(app)
                .post("/simulate")
                .send({
                    sender: "invalid-address",
                    transaction: {
                        to: "0x000000000000000000000000000000000000dead",
                    },
                });

            expect(response.status).toBe(400);
            expect(response.body.success).toBe(false);
            expect(response.body.error.message).toContain(
                "Invalid sender address",
            );
        });

        it("should reject EVM request with invalid transaction.to address", async () => {
            const response = await request(app)
                .post("/simulate")
                .send({
                    sender: "0x742d35cc6634c0532925a3b844bc9e7595f0beb7",
                    transaction: {
                        to: "invalid-address",
                    },
                });

            expect(response.status).toBe(400);
            expect(response.body.success).toBe(false);
            expect(response.body.error.message).toContain(
                "Invalid transaction.to address",
            );
        });

        it("should reject EVM request with invalid token address in trackTokens", async () => {
            const response = await request(app)
                .post("/simulate")
                .send({
                    sender: "0x742d35cc6634c0532925a3b844bc9e7595f0beb7",
                    transaction: {
                        to: "0x000000000000000000000000000000000000dead",
                    },
                    trackTokens: ["invalid-token-address"],
                });

            expect(response.status).toBe(400);
            expect(response.body.success).toBe(false);
            expect(response.body.error.message).toContain(
                "Invalid token address",
            );
        });
    });

    describe("WASM Validation", () => {
        it("should accept valid WASM request with pallet/method/args", async () => {
            const mockResponse = {
                success: true,
                stateChanges: {
                    sender: {
                        address: "5GrwvaEF",
                        before: [],
                        after: [],
                        changes: [],
                    },
                    recipient: null,
                    otherAffected: [],
                },
                events: [],
                gas: {
                    weight: { refTime: "159600000", proofSize: "3593" },
                    partialFee: "158960000",
                    partialFeeFormatted: "0.00015896",
                    nativeSymbol: "ASTR",
                },
            };

            mockedSimulateWasmTransaction.mockResolvedValue(mockResponse);

            const response = await request(app)
                .post("/simulate")
                .send({
                    sender: "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
                    extrinsic: {
                        pallet: "Balances",
                        method: "transferKeepAlive",
                        args: [
                            "5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty",
                            "1000000000000",
                        ],
                    },
                    trackAssets: [1, 2, 3],
                });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(mockedSimulateWasmTransaction).toHaveBeenCalledWith({
                sender: "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
                extrinsic: {
                    pallet: "Balances",
                    method: "transferKeepAlive",
                    args: [
                        "5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty",
                        "1000000000000",
                    ],
                },
                trackAssets: [1, 2, 3],
            });
        });

        it("should accept valid WASM request with rawHex", async () => {
            const mockResponse = {
                success: true,
                stateChanges: {
                    sender: {
                        address: "5GrwvaEF",
                        before: [],
                        after: [],
                        changes: [],
                    },
                    recipient: null,
                    otherAffected: [],
                },
                events: [],
                gas: {
                    weight: { refTime: "159600000", proofSize: "3593" },
                    partialFee: "158960000",
                    partialFeeFormatted: "0.00015896",
                    nativeSymbol: "ASTR",
                },
            };

            mockedSimulateWasmTransaction.mockResolvedValue(mockResponse);

            const response = await request(app)
                .post("/simulate")
                .send({
                    sender: "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
                    extrinsic: {
                        rawHex: "0x1234567890abcdef",
                    },
                });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
        });

        it("should reject WASM request with missing sender", async () => {
            const response = await request(app)
                .post("/simulate")
                .send({
                    extrinsic: {
                        pallet: "Balances",
                        method: "transferKeepAlive",
                        args: [],
                    },
                });

            expect(response.status).toBe(400);
            expect(response.body.success).toBe(false);
            expect(response.body.error.message).toContain(
                "Missing required field: sender",
            );
        });

        it("should reject WASM request with invalid sender address", async () => {
            const response = await request(app)
                .post("/simulate")
                .send({
                    sender: "invalid-substrate-address",
                    extrinsic: {
                        pallet: "Balances",
                        method: "transferKeepAlive",
                        args: [],
                    },
                });

            expect(response.status).toBe(400);
            expect(response.body.success).toBe(false);
            expect(response.body.error.message).toContain(
                "Invalid sender address",
            );
        });

        it("should reject WASM request with missing extrinsic", async () => {
            const response = await request(app).post("/simulate").send({
                sender: "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
            });

            expect(response.status).toBe(400);
            expect(response.body.success).toBe(false);
        });

        it("should reject WASM request with extrinsic missing both pallet/method and rawHex", async () => {
            const response = await request(app)
                .post("/simulate")
                .send({
                    sender: "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
                    extrinsic: {
                        args: ["some", "args"],
                    },
                });

            expect(response.status).toBe(400);
            expect(response.body.success).toBe(false);
            expect(response.body.error.message).toContain("must have either");
        });
    });

    describe("Integration Tests", () => {
        it("should return EVM simulation response", async () => {
            const mockResponse = {
                success: true,
                stateChanges: {
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
                },
                events: [],
                gas: {
                    gasUsed: "21000",
                    gasPrice: "1000000000",
                    totalCostWei: "21000000000000",
                    totalCostNative: "0.000021",
                    nativeSymbol: "GLMR",
                },
            };

            mockedSimulateTransaction.mockResolvedValue(mockResponse);

            const response = await request(app)
                .post("/simulate")
                .send({
                    sender: "0x742d35cc6634c0532925a3b844bc9e7595f0beb7",
                    transaction: {
                        to: "0x000000000000000000000000000000000000dead",
                        value: "1000000000000000000",
                    },
                });

            expect(response.status).toBe(200);
            expect(response.body).toEqual(mockResponse);
        });

        it("should return WASM simulation response", async () => {
            const mockResponse = {
                success: true,
                stateChanges: {
                    sender: {
                        address:
                            "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
                        before: [],
                        after: [],
                        changes: [],
                    },
                    recipient: null,
                    otherAffected: [],
                },
                events: [],
                gas: {
                    weight: { refTime: "159600000", proofSize: "3593" },
                    partialFee: "158960000",
                    partialFeeFormatted: "0.00015896",
                    nativeSymbol: "ASTR",
                },
            };

            mockedSimulateWasmTransaction.mockResolvedValue(mockResponse);

            const response = await request(app)
                .post("/simulate")
                .send({
                    sender: "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
                    extrinsic: {
                        pallet: "Balances",
                        method: "transferKeepAlive",
                        args: [
                            "5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty",
                            "1000000000000",
                        ],
                    },
                });

            expect(response.status).toBe(200);
            expect(response.body).toEqual(mockResponse);
        });

        it("should handle EVM simulation errors", async () => {
            const mockErrorResponse = {
                success: false,
                stateChanges: {
                    sender: {
                        address: "0x123",
                        before: [],
                        after: [],
                        changes: [],
                    },
                    recipient: {
                        address: "0x456",
                        before: [],
                        after: [],
                        changes: [],
                    },
                    contractsAffected: [],
                },
                events: [],
                gas: {
                    gasUsed: "0",
                    gasPrice: "0",
                    totalCostWei: "0",
                    totalCostNative: "0",
                    nativeSymbol: "GLMR",
                },
                error: {
                    type: "revert" as const,
                    message: "Insufficient balance",
                },
            };

            mockedSimulateTransaction.mockResolvedValue(mockErrorResponse);

            const response = await request(app)
                .post("/simulate")
                .send({
                    sender: "0x742d35cc6634c0532925a3b844bc9e7595f0beb7",
                    transaction: {
                        to: "0x000000000000000000000000000000000000dead",
                        value: "1000000000000000000",
                    },
                });

            expect(response.status).toBe(422);
            expect(response.body.success).toBe(false);
            expect(response.body.error).toBeDefined();
        });

        it("should handle WASM simulation errors", async () => {
            const mockErrorResponse = {
                success: false,
                stateChanges: {
                    sender: {
                        address: "5GrwvaEF",
                        before: [],
                        after: [],
                        changes: [],
                    },
                    recipient: null,
                    otherAffected: [],
                },
                events: [],
                gas: {
                    weight: { refTime: "0", proofSize: "0" },
                    partialFee: "0",
                    partialFeeFormatted: "0",
                    nativeSymbol: "ASTR",
                },
                error: {
                    type: "module" as const,
                    pallet: "Balances",
                    error: "InsufficientBalance",
                    message: "Insufficient balance",
                },
            };

            mockedSimulateWasmTransaction.mockResolvedValue(mockErrorResponse);

            const response = await request(app)
                .post("/simulate")
                .send({
                    sender: "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
                    extrinsic: {
                        pallet: "Balances",
                        method: "transferKeepAlive",
                        args: [
                            "5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty",
                            "1000000000000",
                        ],
                    },
                });

            expect(response.status).toBe(422);
            expect(response.body.success).toBe(false);
            expect(response.body.error).toBeDefined();
        });
    });
});
