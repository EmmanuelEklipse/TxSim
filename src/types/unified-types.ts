// src/types/unified-types.ts

import { SimulateRequest, SimulateResponse } from "./index";
import { WasmSimulateRequest, WasmSimulateResponse } from "./wasm";

/**
 * Unified request type that accepts both EVM and WASM simulation requests.
 * Discriminated by the presence of 'transaction' (EVM) or 'extrinsic' (WASM) field.
 */
export type UnifiedSimulateRequest = SimulateRequest | WasmSimulateRequest;

/**
 * Unified response type for both EVM and WASM simulations.
 */
export type UnifiedSimulateResponse = SimulateResponse | WasmSimulateResponse;

/**
 * Type guard to check if a request is an EVM simulation request.
 */
export function isEvmRequest(
    req: UnifiedSimulateRequest,
): req is SimulateRequest {
    return "transaction" in req && req.transaction !== undefined;
}

/**
 * Type guard to check if a request is a WASM simulation request.
 */
export function isWasmRequest(
    req: UnifiedSimulateRequest,
): req is WasmSimulateRequest {
    return "extrinsic" in req && req.extrinsic !== undefined;
}

/**
 * Type guard to check if a response is an EVM simulation response.
 */
export function isEvmResponse(
    res: UnifiedSimulateResponse,
): res is SimulateResponse {
    return "gas" in res && "gasUsed" in res.gas;
}

/**
 * Type guard to check if a response is a WASM simulation response.
 */
export function isWasmResponse(
    res: UnifiedSimulateResponse,
): res is WasmSimulateResponse {
    return "gas" in res && "weight" in res.gas;
}
