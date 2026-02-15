import { ethers } from "ethers";

const ERC20_ABI = [
    "function balanceOf(address) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function symbol() view returns (string)",
];

export interface TokenMetadata {
    address: string;
    symbol: string;
    decimals: number;
}

// Cache token metadata to avoid repeated calls
const tokenCache = new Map<string, TokenMetadata>();

export async function getTokenMetadata(
    provider: ethers.JsonRpcProvider,
    tokenAddress: string,
): Promise<TokenMetadata> {
    const key = tokenAddress.toLowerCase();

    if (tokenCache.has(key)) {
        return tokenCache.get(key)!;
    }

    try {
        const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
        const [symbol, decimals] = await Promise.all([
            contract.symbol().catch(() => "UNKNOWN"),
            contract.decimals().catch(() => 18),
        ]);

        const metadata: TokenMetadata = {
            address: key,
            symbol,
            decimals: Number(decimals),
        };

        tokenCache.set(key, metadata);
        return metadata;
    } catch {
        return {
            address: key,
            symbol: "UNKNOWN",
            decimals: 18,
        };
    }
}

export async function getTokenBalance(
    provider: ethers.JsonRpcProvider,
    tokenAddress: string,
    walletAddress: string,
): Promise<bigint> {
    try {
        const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
        return await contract.balanceOf(walletAddress);
    } catch {
        return 0n;
    }
}
