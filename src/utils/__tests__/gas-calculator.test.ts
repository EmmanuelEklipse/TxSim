import { calculateGasReport } from "../gas-calculator";
import { ethers } from "ethers";

describe("calculateGasReport", () => {
    let mockProvider: ethers.JsonRpcProvider;

    beforeEach(() => {
        mockProvider = {} as ethers.JsonRpcProvider;
    });

    it("should return zero values when receipt is null", async () => {
        const result = await calculateGasReport(mockProvider, null, "ETH");

        expect(result).toEqual({
            gasUsed: "0",
            gasPrice: "0",
            totalCostWei: "0",
            totalCostNative: "0",
            nativeSymbol: "ETH",
        });
    });

    it("should calculate gas report with valid receipt", async () => {
        const mockReceipt = {
            gasUsed: 21000n,
            gasPrice: 1000000000n, // 1 Gwei
        } as ethers.TransactionReceipt;

        const result = await calculateGasReport(
            mockProvider,
            mockReceipt,
            "GLMR",
        );

        expect(result.gasUsed).toBe("21000");
        expect(result.gasPrice).toBe("1000000000");
        expect(result.totalCostWei).toBe("21000000000000");
        expect(result.totalCostNative).toBe("0.000021");
        expect(result.nativeSymbol).toBe("GLMR");
    });

    it("should handle receipt with null gasPrice", async () => {
        const mockReceipt = {
            gasUsed: 50000n,
            gasPrice: null,
        } as unknown as ethers.TransactionReceipt;

        const result = await calculateGasReport(
            mockProvider,
            mockReceipt,
            "ETH",
        );

        expect(result.gasUsed).toBe("50000");
        expect(result.gasPrice).toBe("0");
        expect(result.totalCostWei).toBe("0");
        expect(result.totalCostNative).toBe("0.0");
    });

    it("should use default native symbol when not provided", async () => {
        const mockReceipt = {
            gasUsed: 21000n,
            gasPrice: 1000000000n,
        } as ethers.TransactionReceipt;

        const result = await calculateGasReport(mockProvider, mockReceipt);

        expect(result.nativeSymbol).toBe("ETH");
    });

    it("should handle large gas values", async () => {
        const mockReceipt = {
            gasUsed: 1000000n,
            gasPrice: 100000000000n, // 100 Gwei
        } as ethers.TransactionReceipt;

        const result = await calculateGasReport(
            mockProvider,
            mockReceipt,
            "ETH",
        );

        expect(result.gasUsed).toBe("1000000");
        expect(result.gasPrice).toBe("100000000000");
        expect(result.totalCostWei).toBe("100000000000000000");
        expect(result.totalCostNative).toBe("0.1");
    });
});
