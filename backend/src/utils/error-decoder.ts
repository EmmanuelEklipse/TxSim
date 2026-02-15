import { ethers } from "ethers";

const PANIC_CODES: Record<string, string> = {
    "0x00": "Generic compiler panic",
    "0x01": "Assertion failed",
    "0x11": "Arithmetic overflow/underflow",
    "0x12": "Division or modulo by zero",
    "0x21": "Conversion to invalid enum value",
    "0x22": "Incorrectly encoded storage byte array",
    "0x31": "Pop on empty array",
    "0x32": "Array index out of bounds",
    "0x41": "Too much memory allocated",
    "0x51": "Called invalid internal function",
};

// Common custom error signatures (only actively used ones)
const CUSTOM_ERRORS: Record<string, string> = {
    "0xe450d38c": "InsufficientBalance(address,uint256,uint256)", // ERC20
    "0xfb8f41b2": "InsufficientAllowance(address,uint256,uint256)", // ERC20
};

export interface DecodedError {
    type: "revert" | "panic" | "custom" | "unknown";
    message: string;
    raw?: string;
}

export function decodeEVMError(error: any): DecodedError {
    const data = extractErrorData(error);

    // Try to decode from data
    if (data && data.length >= 10) {
        const selector = data.slice(0, 10).toLowerCase();

        // Panic error
        if (selector === "0x4e487b71") {
            return decodePanic(data);
        }

        // Standard revert with reason
        if (selector === "0x08c379a0") {
            return decodeRevertReason(data);
        }

        // Try custom error
        const customError = decodeCustomError(selector, data);
        if (customError) {
            return customError;
        }
    }

    // Fallback: parse from error object
    return parseErrorFallback(error);
}

function extractErrorData(error: any): string | null {
    // Direct data field
    if (error.data && typeof error.data === "string") {
        return error.data;
    }

    // Nested in error info
    if (error.info?.error?.data) {
        return error.info.error.data;
    }

    // In error.error
    if (error.error?.data) {
        return error.error.data;
    }

    // Parse from message (ethers sometimes embeds it)
    const match = error.message?.match(/data="(0x[a-fA-F0-9]+)"/);
    if (match) {
        return match[1];
    }

    return null;
}

function decodePanic(data: string): DecodedError {
    try {
        const abiCoder = new ethers.AbiCoder();
        const [code] = abiCoder.decode(["uint256"], "0x" + data.slice(10));
        const codeHex = "0x" + code.toString(16).padStart(2, "0");
        const meaning =
            PANIC_CODES[codeHex] || `Unknown panic code: ${codeHex}`;

        return {
            type: "panic",
            message: `Panic: ${meaning}`,
            raw: data,
        };
    } catch {
        return {
            type: "panic",
            message: "Panic: Unable to decode panic code",
            raw: data,
        };
    }
}

function decodeRevertReason(data: string): DecodedError {
    try {
        const abiCoder = new ethers.AbiCoder();
        const [reason] = abiCoder.decode(["string"], "0x" + data.slice(10));

        return {
            type: "revert",
            message: reason || "Transaction reverted",
            raw: data,
        };
    } catch {
        return {
            type: "revert",
            message: "Transaction reverted (unable to decode reason)",
            raw: data,
        };
    }
}

function decodeCustomError(
    selector: string,
    data: string,
): DecodedError | null {
    const errorSig = CUSTOM_ERRORS[selector];
    if (!errorSig) return null;

    try {
        const iface = new ethers.Interface([`error ${errorSig}`]);
        const decoded = iface.parseError(data);

        if (decoded) {
            const args = decoded.args.map((arg) => arg.toString()).join(", ");
            return {
                type: "custom",
                message: `${decoded.name}(${args})`,
                raw: data,
            };
        }
    } catch {}

    // Return just the error name if decoding args fails
    const errorName = errorSig.split("(")[0];
    return {
        type: "custom",
        message: errorName,
        raw: data,
    };
}

function parseErrorFallback(error: any): DecodedError {
    // Ethers reason field
    if (error.reason) {
        return {
            type: "revert",
            message: error.reason,
        };
    }

    // Nested error message
    if (error.info?.error?.message) {
        const msg = error.info.error.message;
        return {
            type: "unknown",
            message: cleanErrorMessage(msg),
        };
    }

    // Direct message
    if (error.message) {
        return {
            type: "unknown",
            message: cleanErrorMessage(error.message),
        };
    }

    return {
        type: "unknown",
        message: "Unknown error occurred",
    };
}

function cleanErrorMessage(msg: string): string {
    // Extract revert reason from common patterns
    const revertMatch =
        msg.match(/execution reverted: "([^"]+)"/) ||
        msg.match(/reason="([^"]+)"/);
    if (revertMatch) return revertMatch[1];

    // Remove verbose prefixes
    return msg
        .replace(/^Error: /, "")
        .replace(/^execution reverted$/, "Transaction reverted")
        .trim();
}
