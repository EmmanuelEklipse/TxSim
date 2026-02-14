// src/routes/unified-simulate.ts

import { Router, Request, Response } from "express";
import { isAddress } from "ethers";
import { decodeAddress } from "@polkadot/util-crypto";
import { simulateTransaction } from "../services/simulator";
import { simulateWasmTransaction } from "../services/simulator-wasm";
import {
    UnifiedSimulateRequest,
    isEvmRequest,
    isWasmRequest,
} from "../types/unified-types";
import { SimulateRequest } from "../types";
import { WasmSimulateRequest } from "../types/wasm";

const router = Router();

router.post("/", async (req: Request, res: Response) => {
    const body = req.body as UnifiedSimulateRequest;

    // Detect transaction type
    const isEvm = isEvmRequest(body);
    const isWasm = isWasmRequest(body);

    // Validate that exactly one type is present
    if (!isEvm && !isWasm) {
        return res.status(400).json({
            success: false,
            error: {
                type: "unknown",
                message:
                    'Request must contain either "transaction" (EVM) or "extrinsic" (WASM) field',
            },
        });
    }

    if (isEvm && isWasm) {
        return res.status(400).json({
            success: false,
            error: {
                type: "unknown",
                message:
                    'Request cannot contain both "transaction" and "extrinsic" fields',
            },
        });
    }

    // Route to EVM simulation
    if (isEvm) {
        return handleEvmSimulation(body, res);
    }

    // Route to WASM simulation
    if (isWasm) {
        return handleWasmSimulation(body, res);
    }
});

/**
 * Handle EVM transaction simulation
 */
async function handleEvmSimulation(body: SimulateRequest, res: Response) {
    // Validate required fields
    if (!body.sender || !body.transaction?.to) {
        return res.status(400).json({
            success: false,
            balanceChanges: [],
            gasUsed: "0",
            error: {
                message: "Missing required fields: sender, transaction.to",
            },
        });
    }

    // Validate addresses
    if (!isAddress(body.sender)) {
        return res.status(400).json({
            success: false,
            balanceChanges: [],
            gasUsed: "0",
            error: { message: "Invalid sender address" },
        });
    }

    if (!isAddress(body.transaction.to)) {
        return res.status(400).json({
            success: false,
            balanceChanges: [],
            gasUsed: "0",
            error: { message: "Invalid transaction.to address" },
        });
    }

    // Validate token addresses if provided
    if (body.trackTokens) {
        for (const token of body.trackTokens) {
            if (!isAddress(token)) {
                return res.status(400).json({
                    success: false,
                    balanceChanges: [],
                    gasUsed: "0",
                    error: { message: `Invalid token address: ${token}` },
                });
            }
        }
    }

    // Run simulation
    try {
        const result = await simulateTransaction(body);
        if (!result.success) {
            return res.status(422).json(result);
        }
        return res.json(result);
    } catch (error: any) {
        // Fatal errors (state corruption, cleanup failures) return 500
        console.error("EVM simulation fatal error:", error);
        return res.status(500).json({
            success: false,
            error: {
                type: "fatal",
                message: error.message || "Internal simulation error",
            },
        });
    }
}

/**
 * Handle WASM transaction simulation
 */
async function handleWasmSimulation(body: WasmSimulateRequest, res: Response) {
    // Validate sender
    if (!body.sender) {
        return res.status(400).json({
            success: false,
            error: {
                type: "unknown",
                message: "Missing required field: sender",
            },
        });
    }

    try {
        decodeAddress(body.sender);
    } catch {
        return res.status(400).json({
            success: false,
            error: { type: "unknown", message: "Invalid sender address" },
        });
    }

    // Validate extrinsic
    if (!body.extrinsic) {
        return res.status(400).json({
            success: false,
            error: {
                type: "unknown",
                message: "Missing required field: extrinsic",
            },
        });
    }

    const hasCallParams =
        "pallet" in body.extrinsic && "method" in body.extrinsic;
    const hasRawHex = "rawHex" in body.extrinsic;

    if (!hasCallParams && !hasRawHex) {
        return res.status(400).json({
            success: false,
            error: {
                type: "unknown",
                message:
                    "Extrinsic must have either (pallet, method, args) or rawHex",
            },
        });
    }

    // Run simulation
    try {
        const result = await simulateWasmTransaction(body);
        if (!result.success) {
            return res.status(422).json(result);
        }
        return res.json(result);
    } catch (error: any) {
        // Fatal errors (state corruption, cleanup failures) return 500
        console.error("WASM simulation fatal error:", error);
        return res.status(500).json({
            success: false,
            error: {
                type: "fatal",
                message: error.message || "Internal simulation error",
            },
        });
    }
}

export default router;
