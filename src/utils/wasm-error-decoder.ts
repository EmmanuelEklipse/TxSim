import { ApiPromise } from "@polkadot/api";
import { WasmDecodedError } from "../types/wasm";

export function decodeWasmError(api: ApiPromise, error: any): WasmDecodedError {
    // Handle plain object errors (from toHuman/toJSON) which don't have isModule
    if (
        error &&
        typeof error === "object" &&
        !error.isModule &&
        !error.isBadOrigin
    ) {
        // Module error
        if (error.module) {
            try {
                const mod = error.module;
                const index =
                    typeof mod.index === "string"
                        ? parseInt(mod.index)
                        : mod.index;
                const err =
                    typeof mod.error === "string"
                        ? parseInt(mod.error)
                        : mod.error;

                const decoded = api.registry.findMetaError({
                    index,
                    error: err,
                });
                return {
                    type: "module",
                    pallet: decoded.section,
                    error: decoded.name,
                    message: `${decoded.section}.${decoded.name}: ${decoded.docs.join(" ")}`,
                    raw: JSON.stringify(error),
                };
            } catch {}
        }

        // Token error
        if (error.token) {
            return {
                type: "token",
                message:
                    typeof error.token === "string"
                        ? `Token Error: ${error.token}`
                        : `Token Error: ${JSON.stringify(error.token)}`,
                raw: JSON.stringify(error),
            };
        }

        // Arithmetic error
        if (error.arithmetic) {
            return {
                type: "arithmetic",
                message:
                    typeof error.arithmetic === "string"
                        ? `Arithmetic Error: ${error.arithmetic}`
                        : `Arithmetic Error: ${JSON.stringify(error.arithmetic)}`,
                raw: JSON.stringify(error),
            };
        }

        // Generic single key variant
        const keys = Object.keys(error);
        if (keys.length === 1) {
            const key = keys[0];
            const val = error[key];
            if (typeof val === "string" || typeof val === "number") {
                return {
                    type: key,
                    message: `${key}: ${val}`,
                    raw: JSON.stringify(error),
                };
            }
        }
    }

    // Handle DispatchError
    if (error && error.isModule) {
        try {
            const decoded = api.registry.findMetaError(error.asModule);
            return {
                type: "module",
                pallet: decoded.section,
                error: decoded.name,
                message: `${decoded.section}.${decoded.name}: ${decoded.docs.join(" ")}`,
                raw: JSON.stringify(error.toHuman()),
            };
        } catch {
            return {
                type: "module",
                message: "Unknown module error",
                raw: JSON.stringify(error.toHuman?.() || error),
            };
        }
    }

    if (error && error.isBadOrigin) {
        return {
            type: "badOrigin",
            message: "Bad origin - caller not authorized for this action",
        };
    }

    if (error && error.isCannotLookup) {
        return {
            type: "cannotLookup",
            message: "Cannot lookup - invalid account or reference",
        };
    }

    if (error && error.isOther) {
        return {
            type: "other",
            message: error.asOther?.toString() || "Other error",
        };
    }

    // String error
    if (typeof error === "string") {
        return {
            type: "unknown",
            message: error,
        };
    }

    // Error object
    if (error && error.message) {
        return {
            type: "unknown",
            message: error.message,
            raw: error.toString(),
        };
    }

    return {
        type: "unknown",
        message: "Unknown error occurred",
        raw: JSON.stringify(error),
    };
}
