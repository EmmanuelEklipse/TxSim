import { decodeEVMError, DecodedError } from "../error-decoder";
import { ethers } from "ethers";

describe("decodeEVMError", () => {
    describe("Panic Error Decoding", () => {
        it("should decode panic errors with valid code", () => {
            const panicData =
                "0x4e487b710000000000000000000000000000000000000000000000000000000000000011";
            const error = { data: panicData };

            const result = decodeEVMError(error);

            expect(result.type).toBe("panic");
            expect(result.message).toContain("Arithmetic overflow/underflow");
            expect(result.raw).toBe(panicData);
        });

        it("should handle panic errors with unknown code", () => {
            const panicData =
                "0x4e487b710000000000000000000000000000000000000000000000000000000000000099";
            const error = { data: panicData };

            const result = decodeEVMError(error);

            expect(result.type).toBe("panic");
            expect(result.message).toContain("Unknown panic code");
            expect(result.raw).toBe(panicData);
        });

        it("should handle panic errors with malformed data", () => {
            const panicData = "0x4e487b71abc"; // Too short
            const error = { data: panicData };

            const result = decodeEVMError(error);

            expect(result.type).toBe("panic");
            expect(result.message).toBe("Panic: Unable to decode panic code");
            expect(result.raw).toBe(panicData);
        });
    });

    describe("Revert Error Decoding", () => {
        it("should decode standard revert with reason string", () => {
            const abiCoder = new ethers.AbiCoder();
            const encodedReason = abiCoder.encode(
                ["string"],
                ["Insufficient balance"],
            );
            const revertData = "0x08c379a0" + encodedReason.slice(2);
            const error = { data: revertData };

            const result = decodeEVMError(error);

            expect(result.type).toBe("revert");
            expect(result.message).toBe("Insufficient balance");
            expect(result.raw).toBe(revertData);
        });

        it("should handle revert with empty reason", () => {
            const abiCoder = new ethers.AbiCoder();
            const encodedReason = abiCoder.encode(["string"], [""]);
            const revertData = "0x08c379a0" + encodedReason.slice(2);
            const error = { data: revertData };

            const result = decodeEVMError(error);

            expect(result.type).toBe("revert");
            expect(result.message).toBe("Transaction reverted");
            expect(result.raw).toBe(revertData);
        });

        it("should handle revert with malformed data", () => {
            const revertData = "0x08c379a0xyz"; // Invalid hex
            const error = { data: revertData };

            const result = decodeEVMError(error);

            expect(result.type).toBe("revert");
            expect(result.message).toBe(
                "Transaction reverted (unable to decode reason)",
            );
            expect(result.raw).toBe(revertData);
        });
    });

    describe("Custom Error Decoding", () => {
        it("should decode known custom errors", () => {
            // InsufficientBalance(address,uint256,uint256)
            const selector = "0xe450d38c";
            const abiCoder = new ethers.AbiCoder();
            const encodedArgs = abiCoder.encode(
                ["address", "uint256", "uint256"],
                [
                    "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7".toLowerCase(),
                    "1000",
                    "500",
                ],
            );
            const customErrorData = selector + encodedArgs.slice(2);
            const error = { data: customErrorData };

            const result = decodeEVMError(error);

            expect(result.type).toBe("custom");
            expect(result.message).toContain("InsufficientBalance");
            expect(result.raw).toBe(customErrorData);
        });

        it("should handle unknown custom error selectors", () => {
            const unknownSelector = "0x12345678";
            const error = {
                data:
                    unknownSelector +
                    "0000000000000000000000000000000000000000000000000000000000000001",
            };

            const result = decodeEVMError(error);

            // Should fall through to fallback
            expect(result.type).toBe("unknown");
        });

        it("should handle custom errors with invalid ABI", () => {
            const selector = "0xe450d38c";
            const invalidData = selector + "xyz"; // Invalid hex
            const error = { data: invalidData };

            const result = decodeEVMError(error);

            expect(result.type).toBe("custom");
            expect(result.message).toBe("InsufficientBalance");
            expect(result.raw).toBe(invalidData);
        });
    });

    describe("Fallback Error Handling", () => {
        it("should extract error from error.reason", () => {
            const error = { reason: "Transfer failed" };

            const result = decodeEVMError(error);

            expect(result.type).toBe("revert");
            expect(result.message).toBe("Transfer failed");
        });

        it("should extract error from error.info.error.message", () => {
            const error = {
                info: {
                    error: {
                        message: 'execution reverted: "Custom error message"',
                    },
                },
            };

            const result = decodeEVMError(error);

            expect(result.type).toBe("unknown");
            expect(result.message).toBe("Custom error message");
        });

        it("should extract error from error.message", () => {
            const error = {
                message: "Error: Something went wrong",
            };

            const result = decodeEVMError(error);

            expect(result.type).toBe("unknown");
            expect(result.message).toBe("Something went wrong");
        });

        it("should handle completely unknown errors", () => {
            const error = { someField: "someValue" };

            const result = decodeEVMError(error);

            expect(result.type).toBe("unknown");
            expect(result.message).toBe("Unknown error occurred");
        });
    });

    describe("extractErrorData", () => {
        it("should extract data from error.data", () => {
            const errorData =
                "0x08c379a0000000000000000000000000000000000000000000000000000000000000002";
            const error = { data: errorData };

            const result = decodeEVMError(error);

            expect(result.raw).toBe(errorData);
        });

        it("should extract data from error.info.error.data", () => {
            const errorData =
                "0x08c379a0000000000000000000000000000000000000000000000000000000000000002";
            const error = {
                info: {
                    error: {
                        data: errorData,
                    },
                },
            };

            const result = decodeEVMError(error);

            expect(result.raw).toBe(errorData);
        });

        it("should extract data from error.error.data", () => {
            const errorData =
                "0x08c379a0000000000000000000000000000000000000000000000000000000000000002";
            const error = {
                error: {
                    data: errorData,
                },
            };

            const result = decodeEVMError(error);

            expect(result.raw).toBe(errorData);
        });

        it("should extract data from message regex", () => {
            const errorData =
                "0x08c379a0000000000000000000000000000000000000000000000000000000000000002";
            const error = {
                message: `Transaction failed with data="${errorData}"`,
            };

            const result = decodeEVMError(error);

            expect(result.raw).toBe(errorData);
        });

        it("should return fallback when no data found", () => {
            const error = {
                message: "Transaction failed",
            };

            const result = decodeEVMError(error);

            expect(result.type).toBe("unknown");
            expect(result.message).toBe("Transaction failed");
            expect(result.raw).toBeUndefined();
        });
    });

    describe("cleanErrorMessage", () => {
        it("should clean execution reverted messages", () => {
            const error = {
                message: 'execution reverted: "Insufficient funds"',
            };

            const result = decodeEVMError(error);

            expect(result.message).toBe("Insufficient funds");
        });

        it("should clean reason messages", () => {
            const error = {
                message: 'reason="Transfer amount exceeds balance"',
            };

            const result = decodeEVMError(error);

            expect(result.message).toBe("Transfer amount exceeds balance");
        });

        it("should remove Error: prefix", () => {
            const error = {
                message: "Error: Network connection failed",
            };

            const result = decodeEVMError(error);

            expect(result.message).toBe("Network connection failed");
        });

        it("should replace generic execution reverted", () => {
            const error = {
                message: "execution reverted",
            };

            const result = decodeEVMError(error);

            expect(result.message).toBe("Transaction reverted");
        });
    });
});
