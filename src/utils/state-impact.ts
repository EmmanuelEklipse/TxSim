import { ethers } from "ethers";
import {
    StateImpactReport,
    AddressState,
    TokenBalance,
    TokenBalanceChange,
} from "../types";
import { getTokenMetadata } from "./token-info";

interface BalanceSnapshot {
    native: bigint;
    tokens: Map<string, bigint>;
}

export async function buildStateImpactReport(
    provider: ethers.JsonRpcProvider,
    sender: string,
    transactionTo: string,
    tokenAddresses: string[],
    balancesBefore: Map<string, BalanceSnapshot>,
    balancesAfter: Map<string, BalanceSnapshot>,
    nativeSymbol: string = "ETH",
    tokenRecipient?: string | null, // NEW: actual token recipient
): Promise<StateImpactReport> {
    // Get token metadata
    const tokenMetadata = new Map<
        string,
        { symbol: string; decimals: number }
    >();

    for (const tokenAddress of tokenAddresses) {
        const metadata = await getTokenMetadata(provider, tokenAddress);
        tokenMetadata.set(tokenAddress.toLowerCase(), {
            symbol: metadata.symbol,
            decimals: metadata.decimals,
        });
    }

    // Sender state
    const senderState = buildAddressState(
        sender,
        balancesBefore.get(sender.toLowerCase())!,
        balancesAfter.get(sender.toLowerCase())!,
        tokenMetadata,
        nativeSymbol,
    );

    // Determine who the "recipient" should be in the report
    // If there's a token recipient (from calldata), use that
    // Otherwise use the transaction.to address
    const recipientAddress = tokenRecipient || transactionTo;

    const recipientState = buildAddressState(
        recipientAddress,
        balancesBefore.get(recipientAddress.toLowerCase()) || {
            native: 0n,
            tokens: new Map(),
        },
        balancesAfter.get(recipientAddress.toLowerCase()) || {
            native: 0n,
            tokens: new Map(),
        },
        tokenMetadata,
        nativeSymbol,
    );

    // Other affected addresses
    const contractsAffected: AddressState[] = [];
    const excludeAddresses = new Set([
        sender.toLowerCase(),
        recipientAddress.toLowerCase(),
    ]);

    for (const [address, beforeSnapshot] of balancesBefore) {
        if (excludeAddresses.has(address)) continue;

        const afterSnapshot = balancesAfter.get(address);
        if (afterSnapshot) {
            const state = buildAddressState(
                address,
                beforeSnapshot,
                afterSnapshot,
                tokenMetadata,
                nativeSymbol,
            );

            if (state.changes.length > 0) {
                contractsAffected.push(state);
            }
        }
    }

    return {
        sender: senderState,
        recipient: recipientState,
        contractsAffected,
    };
}

function buildAddressState(
    address: string,
    before: BalanceSnapshot,
    after: BalanceSnapshot,
    tokenMetadata: Map<string, { symbol: string; decimals: number }>,
    nativeSymbol: string,
): AddressState {
    const beforeBalances: TokenBalance[] = [];
    const afterBalances: TokenBalance[] = [];
    const changes: TokenBalanceChange[] = [];

    // Native balance
    beforeBalances.push({
        token: nativeSymbol,
        contractAddress: null,
        balance: before.native.toString(),
        decimals: 18,
        symbol: nativeSymbol,
    });

    afterBalances.push({
        token: nativeSymbol,
        contractAddress: null,
        balance: after.native.toString(),
        decimals: 18,
        symbol: nativeSymbol,
    });

    const nativeDelta = after.native - before.native;
    if (nativeDelta !== 0n) {
        changes.push({
            token: nativeSymbol,
            contractAddress: null,
            before: before.native.toString(),
            after: after.native.toString(),
            delta: nativeDelta.toString(),
            decimals: 18,
            symbol: nativeSymbol,
        });
    }

    // Token balances
    const allTokens = new Set([
        ...before.tokens.keys(),
        ...after.tokens.keys(),
    ]);

    for (const tokenAddress of allTokens) {
        const metadata = tokenMetadata.get(tokenAddress) || {
            symbol: "UNKNOWN",
            decimals: 18,
        };

        const beforeBal = before.tokens.get(tokenAddress) || 0n;
        const afterBal = after.tokens.get(tokenAddress) || 0n;

        beforeBalances.push({
            token: metadata.symbol,
            contractAddress: tokenAddress,
            balance: beforeBal.toString(),
            decimals: metadata.decimals,
            symbol: metadata.symbol,
        });

        afterBalances.push({
            token: metadata.symbol,
            contractAddress: tokenAddress,
            balance: afterBal.toString(),
            decimals: metadata.decimals,
            symbol: metadata.symbol,
        });

        const delta = afterBal - beforeBal;
        if (delta !== 0n) {
            changes.push({
                token: metadata.symbol,
                contractAddress: tokenAddress,
                before: beforeBal.toString(),
                after: afterBal.toString(),
                delta: delta.toString(),
                decimals: metadata.decimals,
                symbol: metadata.symbol,
            });
        }
    }

    return {
        address: address.toLowerCase(),
        before: beforeBalances,
        after: afterBalances,
        changes,
    };
}
