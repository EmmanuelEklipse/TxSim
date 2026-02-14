// src/types/index.ts

export interface SimulateRequest {
    sender: string;
    transaction: {
        to: string;
        data?: string;
        value?: string;
        gasLimit?: string;
    };
    trackTokens?: string[];
}

export interface TokenBalance {
    token: string;
    contractAddress: string | null;
    balance: string;
    decimals?: number;
    symbol?: string;
}

export interface AddressState {
    address: string;
    before: TokenBalance[];
    after: TokenBalance[];
    changes: TokenBalanceChange[];
}

export interface TokenBalanceChange {
    token: string;
    contractAddress: string | null;
    before: string;
    after: string;
    delta: string;
    decimals?: number;
    symbol?: string;
}

export interface StateImpactReport {
    sender: AddressState;
    recipient: AddressState;
    contractsAffected: AddressState[];
}

export interface GasReport {
    gasUsed: string;
    gasPrice: string;
    totalCostWei: string;
    totalCostNative: string;
    nativeSymbol: string;
}

export interface DecodedEvent {
    name: string;
    contract: string;
    args: Record<string, string>;
    signature: string;
    logIndex: number;
}

export interface DecodedError {
    type: "revert" | "panic" | "custom" | "unknown";
    message: string;
    raw?: string;
}

export interface SimulateResponse {
    success: boolean;
    stateChanges: StateImpactReport;
    events: DecodedEvent[];
    gas: GasReport;
    error?: DecodedError;
}
