import { getTokenMetadata, getTokenBalance } from "../token-info";
import { ethers } from "ethers";

describe("token-info", () => {
    let mockProvider: any;

    beforeEach(() => {
        mockProvider = {
            call: jest.fn(),
        };
    });

    describe("getTokenMetadata", () => {
        it("should handle contract call errors gracefully", async () => {
            mockProvider.call.mockRejectedValue(new Error("Contract error"));

            const result = await getTokenMetadata(
                mockProvider,
                "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
            );

            expect(result.symbol).toBe("UNKNOWN");
            expect(result.decimals).toBe(18);
        });

        it("should normalize token address to lowercase", async () => {
            mockProvider.call.mockRejectedValue(new Error("Contract error"));

            const result = await getTokenMetadata(
                mockProvider,
                "0xA0B86991C6218B36C1D19D4A2E9EB0CE3606EB48",
            );

            expect(result.address).toBe(
                "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
            );
        });
    });

    describe("getTokenBalance", () => {
        it("should return 0 on error", async () => {
            mockProvider.call.mockRejectedValue(new Error("Contract error"));

            const result = await getTokenBalance(
                mockProvider,
                "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
                "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7",
            );

            expect(result).toBe(0n);
        });
    });
});
