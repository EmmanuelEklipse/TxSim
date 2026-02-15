// src/types/wasm.ts

export interface WasmSimulateRequest {
    sender: string;
    extrinsic:
        | {
              pallet: string;
              method: string;
              args: any[];
          }
        | {
              rawHex: string;
          };
    trackAssets?: number[]; // Asset IDs to track (pallet-assets)
}

export interface WasmTokenBalance {
    token: string;
    assetId: number | null; // null for native
    balance: string;
    decimals: number;
    symbol: string;
}

export interface WasmBalanceChange {
    token: string;
    assetId: number | null;
    before: string;
    after: string;
    delta: string;
    decimals: number;
    symbol: string;
}

export interface WasmAddressState {
    address: string;
    before: WasmTokenBalance[];
    after: WasmTokenBalance[];
    changes: WasmBalanceChange[];
}

export interface WasmStateImpactReport {
    sender: WasmAddressState;
    recipient: WasmAddressState | null;
    otherAffected: WasmAddressState[];
}

export interface WasmGasReport {
    weight: {
        refTime: string;
        proofSize: string;
    };
    partialFee: string;
    partialFeeFormatted: string;
    nativeSymbol: string;
}

export interface WasmDecodedEvent {
    pallet: string;
    method: string;
    data: Record<string, any>;
    index: number;
}

export interface WasmDecodedError {
    type: string;
    pallet?: string;
    error?: string;
    message: string;
    raw?: string;
}

export interface WasmSimulateResponse {
    success: boolean;
    stateChanges: WasmStateImpactReport;
    events: WasmDecodedEvent[];
    gas: WasmGasReport;
    error?: WasmDecodedError;
}
