import { ethers } from "ethers";
import { GasReport } from "../types";

export async function calculateGasReport(
    provider: ethers.JsonRpcProvider,
    receipt: ethers.TransactionReceipt | null,
    nativeSymbol: string = "ETH",
): Promise<GasReport> {
    if (!receipt) {
        return {
            gasUsed: "0",
            gasPrice: "0",
            totalCostWei: "0",
            totalCostNative: "0",
            nativeSymbol,
        };
    }

    const gasUsed = receipt.gasUsed;
    const gasPrice = receipt.gasPrice || 0n;
    const totalCostWei = gasUsed * gasPrice;

    return {
        gasUsed: gasUsed.toString(),
        gasPrice: gasPrice.toString(),
        totalCostWei: totalCostWei.toString(),
        totalCostNative: ethers.formatEther(totalCostWei),
        nativeSymbol,
    };
}
