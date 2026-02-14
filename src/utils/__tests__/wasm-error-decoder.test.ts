import { decodeWasmError } from "../wasm-error-decoder";
import { ApiPromise } from "@polkadot/api";

// Mock ApiPromise
const createMockApi = () => {
    return {
        registry: {
            findMetaError: jest.fn(),
        },
    } as unknown as ApiPromise;
};

describe("decodeWasmError", () => {
    describe("Module Errors", () => {
        it("should decode module errors with valid metadata", () => {
            const mockApi = createMockApi();
            const mockError = {
                isModule: true,
                asModule: {},
                toHuman: () => ({ Module: { index: 5, error: 2 } }),
            };

            (mockApi.registry.findMetaError as jest.Mock).mockReturnValue({
                section: "Balances",
                name: "InsufficientBalance",
                docs: ["The account does not have enough free balance"],
            });

            const result = decodeWasmError(mockApi, mockError);

            expect(result.type).toBe("module");
            expect(result.pallet).toBe("Balances");
            expect(result.error).toBe("InsufficientBalance");
            expect(result.message).toContain("Balances.InsufficientBalance");
            expect(result.message).toContain(
                "The account does not have enough free balance",
            );
            expect(result.raw).toBeDefined();
        });

        it("should handle module errors with missing metadata", () => {
            const mockApi = createMockApi();
            const mockError = {
                isModule: true,
                asModule: {},
                toHuman: () => ({ Module: { index: 99, error: 99 } }),
            };

            (mockApi.registry.findMetaError as jest.Mock).mockImplementation(
                () => {
                    throw new Error("Metadata not found");
                },
            );

            const result = decodeWasmError(mockApi, mockError);

            expect(result.type).toBe("module");
            expect(result.message).toBe("Unknown module error");
            expect(result.raw).toBeDefined();
        });

        it("should handle module errors with invalid error codes", () => {
            const mockApi = createMockApi();
            const mockError = {
                isModule: true,
                asModule: {},
                toHuman: () => null,
            };

            (mockApi.registry.findMetaError as jest.Mock).mockImplementation(
                () => {
                    throw new Error("Invalid error code");
                },
            );

            const result = decodeWasmError(mockApi, mockError);

            expect(result.type).toBe("module");
            expect(result.message).toBe("Unknown module error");
        });
    });

    describe("Dispatch Error Types", () => {
        it("should decode BadOrigin errors", () => {
            const mockApi = createMockApi();
            const mockError = {
                isBadOrigin: true,
            };

            const result = decodeWasmError(mockApi, mockError);

            expect(result.type).toBe("badOrigin");
            expect(result.message).toBe(
                "Bad origin - caller not authorized for this action",
            );
        });

        it("should decode CannotLookup errors", () => {
            const mockApi = createMockApi();
            const mockError = {
                isCannotLookup: true,
            };

            const result = decodeWasmError(mockApi, mockError);

            expect(result.type).toBe("cannotLookup");
            expect(result.message).toBe(
                "Cannot lookup - invalid account or reference",
            );
        });

        it("should decode Other errors with message", () => {
            const mockApi = createMockApi();
            const mockError = {
                isOther: true,
                asOther: {
                    toString: () => "Custom other error",
                },
            };

            const result = decodeWasmError(mockApi, mockError);

            expect(result.type).toBe("other");
            expect(result.message).toBe("Custom other error");
        });

        it("should handle Other errors with no message", () => {
            const mockApi = createMockApi();
            const mockError = {
                isOther: true,
                asOther: null,
            };

            const result = decodeWasmError(mockApi, mockError);

            expect(result.type).toBe("other");
            expect(result.message).toBe("Other error");
        });
    });

    describe("Fallback Handling", () => {
        it("should handle string errors", () => {
            const mockApi = createMockApi();
            const error = "Transaction failed due to insufficient gas";

            const result = decodeWasmError(mockApi, error);

            expect(result.type).toBe("unknown");
            expect(result.message).toBe(
                "Transaction failed due to insufficient gas",
            );
        });

        it("should handle error objects with message", () => {
            const mockApi = createMockApi();
            const error = {
                message: "Network connection timeout",
                toString: () => "Error: Network connection timeout",
            };

            const result = decodeWasmError(mockApi, error);

            expect(result.type).toBe("unknown");
            expect(result.message).toBe("Network connection timeout");
            expect(result.raw).toBe("Error: Network connection timeout");
        });

        it("should handle completely unknown errors", () => {
            const mockApi = createMockApi();
            const error = { someField: "someValue", anotherField: 123 };

            const result = decodeWasmError(mockApi, error);

            expect(result.type).toBe("unknown");
            expect(result.message).toBe("Unknown error occurred");
            expect(result.raw).toBeDefined();
        });

        it("should handle null errors", () => {
            const mockApi = createMockApi();
            const error = null;

            const result = decodeWasmError(mockApi, error);

            expect(result.type).toBe("unknown");
            expect(result.message).toBe("Unknown error occurred");
        });

        it("should handle undefined errors", () => {
            const mockApi = createMockApi();
            const error = undefined;

            const result = decodeWasmError(mockApi, error);

            expect(result.type).toBe("unknown");
            expect(result.message).toBe("Unknown error occurred");
        });
    });

    describe("Edge Cases", () => {
        it("should handle errors with multiple type flags", () => {
            const mockApi = createMockApi();
            const mockError = {
                isModule: true,
                isBadOrigin: true, // Should prioritize isModule
                asModule: {},
                toHuman: () => ({ Module: { index: 5, error: 2 } }),
            };

            (mockApi.registry.findMetaError as jest.Mock).mockReturnValue({
                section: "System",
                name: "InvalidOrigin",
                docs: ["Invalid origin"],
            });

            const result = decodeWasmError(mockApi, mockError);

            expect(result.type).toBe("module");
            expect(result.pallet).toBe("System");
        });

        it("should handle errors with toHuman returning undefined", () => {
            const mockApi = createMockApi();
            const mockError = {
                isModule: true,
                asModule: {},
                toHuman: undefined,
            };

            (mockApi.registry.findMetaError as jest.Mock).mockImplementation(
                () => {
                    throw new Error("Cannot decode");
                },
            );

            const result = decodeWasmError(mockApi, mockError);

            expect(result.type).toBe("module");
            expect(result.message).toBe("Unknown module error");
        });
    });
});
