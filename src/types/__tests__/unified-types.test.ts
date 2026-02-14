// src/types/__tests__/unified-types.test.ts

import {
    isEvmRequest,
    isWasmRequest,
    isEvmResponse,
    isWasmResponse,
} from "../unified-types";
import { SimulateRequest, SimulateResponse } from "../index";
import { WasmSimulateRequest, WasmSimulateResponse } from "../wasm";

describe("Unified Types - Type Guards", () => {
    describe("isEvmRequest", () => {
        it("should return true for valid EVM request", () => {
            const request: SimulateRequest = {
                sender: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
                transaction: {
                    to: "0x000000000000000000000000000000000000dEaD",
                    value: "1000000000000000000",
                },
            };

            expect(isEvmRequest(request)).toBe(true);
        });

        it("should return false for WASM request", () => {
            const request: WasmSimulateRequest = {
                sender: "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
                extrinsic: {
                    pallet: "Balances",
                    method: "transferKeepAlive",
                    args: [
                        "5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty",
                        "1000000000000",
                    ],
                },
            };

            expect(isEvmRequest(request)).toBe(false);
        });
    });

    describe("isWasmRequest", () => {
        it("should return true for valid WASM request with pallet/method", () => {
            const request: WasmSimulateRequest = {
                sender: "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
                extrinsic: {
                    pallet: "Balances",
                    method: "transferKeepAlive",
                    args: [
                        "5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty",
                        "1000000000000",
                    ],
                },
            };

            expect(isWasmRequest(request)).toBe(true);
        });

        it("should return true for valid WASM request with rawHex", () => {
            const request: WasmSimulateRequest = {
                sender: "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
                extrinsic: {
                    rawHex: "0x1234567890abcdef",
                },
            };

            expect(isWasmRequest(request)).toBe(true);
        });

        it("should return false for EVM request", () => {
            const request: SimulateRequest = {
                sender: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
                transaction: {
                    to: "0x000000000000000000000000000000000000dEaD",
                },
            };

            expect(isWasmRequest(request)).toBe(false);
        });
    });

    describe("isEvmResponse", () => {
        it("should return true for EVM response", () => {
            const response: SimulateResponse = {
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

            expect(isEvmResponse(response)).toBe(true);
        });

        it("should return false for WASM response", () => {
            const response: WasmSimulateResponse = {
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

            expect(isEvmResponse(response)).toBe(false);
        });
    });

    describe("isWasmResponse", () => {
        it("should return true for WASM response", () => {
            const response: WasmSimulateResponse = {
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

            expect(isWasmResponse(response)).toBe(true);
        });

        it("should return false for EVM response", () => {
            const response: SimulateResponse = {
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

            expect(isWasmResponse(response)).toBe(false);
        });
    });
});
