import { buildStateImpactReport } from "../state-impact";
import { ethers } from "ethers";
import * as tokenInfo from "../token-info";

// Mock token-info module
jest.mock("../token-info");

describe("buildStateImpactReport", () => {
    let mockProvider: ethers.JsonRpcProvider;

    beforeEach(() => {
        mockProvider = {} as ethers.JsonRpcProvider;

        // Mock getTokenMetadata
        (tokenInfo.getTokenMetadata as jest.Mock).mockResolvedValue({
            symbol: "USDC",
            decimals: 6,
            address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
        });
    });

    it("should build state impact report with native transfer", async () => {
        const sender = "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7";
        const recipient = "0x000000000000000000000000000000000000dead";

        const balancesBefore = new Map();
        balancesBefore.set(sender.toLowerCase(), {
            native: 1000000000000000000n, // 1 ETH
            tokens: new Map(),
        });
        balancesBefore.set(recipient.toLowerCase(), {
            native: 0n,
            tokens: new Map(),
        });

        const balancesAfter = new Map();
        balancesAfter.set(sender.toLowerCase(), {
            native: 900000000000000000n, // 0.9 ETH
            tokens: new Map(),
        });
        balancesAfter.set(recipient.toLowerCase(), {
            native: 100000000000000000n, // 0.1 ETH
            tokens: new Map(),
        });

        const result = await buildStateImpactReport(
            mockProvider,
            sender,
            recipient,
            [],
            balancesBefore,
            balancesAfter,
            "ETH",
        );

        expect(result.sender.address).toBe(sender.toLowerCase());
        expect(result.sender.changes).toHaveLength(1);
        expect(result.sender.changes[0].delta).toBe("-100000000000000000");

        expect(result.recipient.address).toBe(recipient.toLowerCase());
        expect(result.recipient.changes).toHaveLength(1);
        expect(result.recipient.changes[0].delta).toBe("100000000000000000");

        expect(result.contractsAffected).toHaveLength(0);
    });

    it("should build state impact report with token transfer", async () => {
        const sender = "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7";
        const recipient = "0x000000000000000000000000000000000000dead";
        const tokenAddress = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

        const balancesBefore = new Map();
        balancesBefore.set(sender.toLowerCase(), {
            native: 1000000000000000000n,
            tokens: new Map([[tokenAddress.toLowerCase(), 1000000n]]), // 1 USDC
        });
        balancesBefore.set(recipient.toLowerCase(), {
            native: 0n,
            tokens: new Map([[tokenAddress.toLowerCase(), 0n]]),
        });

        const balancesAfter = new Map();
        balancesAfter.set(sender.toLowerCase(), {
            native: 1000000000000000000n,
            tokens: new Map([[tokenAddress.toLowerCase(), 500000n]]), // 0.5 USDC
        });
        balancesAfter.set(recipient.toLowerCase(), {
            native: 0n,
            tokens: new Map([[tokenAddress.toLowerCase(), 500000n]]), // 0.5 USDC
        });

        const result = await buildStateImpactReport(
            mockProvider,
            sender,
            recipient,
            [tokenAddress],
            balancesBefore,
            balancesAfter,
            "ETH",
        );

        expect(result.sender.changes).toHaveLength(1);
        expect(result.sender.changes[0].token).toBe("USDC");
        expect(result.sender.changes[0].delta).toBe("-500000");

        expect(result.recipient.changes).toHaveLength(1);
        expect(result.recipient.changes[0].delta).toBe("500000");
    });

    it("should handle contracts affected", async () => {
        const sender = "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7";
        const recipient = "0x000000000000000000000000000000000000dead";
        const contract = "0x1234567890123456789012345678901234567890";

        const balancesBefore = new Map();
        balancesBefore.set(sender.toLowerCase(), {
            native: 1000000000000000000n,
            tokens: new Map(),
        });
        balancesBefore.set(recipient.toLowerCase(), {
            native: 0n,
            tokens: new Map(),
        });
        balancesBefore.set(contract.toLowerCase(), {
            native: 500000000000000000n,
            tokens: new Map(),
        });

        const balancesAfter = new Map();
        balancesAfter.set(sender.toLowerCase(), {
            native: 900000000000000000n,
            tokens: new Map(),
        });
        balancesAfter.set(recipient.toLowerCase(), {
            native: 100000000000000000n,
            tokens: new Map(),
        });
        balancesAfter.set(contract.toLowerCase(), {
            native: 600000000000000000n, // Contract balance increased
            tokens: new Map(),
        });

        const result = await buildStateImpactReport(
            mockProvider,
            sender,
            recipient,
            [],
            balancesBefore,
            balancesAfter,
            "ETH",
        );

        expect(result.contractsAffected).toHaveLength(1);
        expect(result.contractsAffected[0].address).toBe(
            contract.toLowerCase(),
        );
        expect(result.contractsAffected[0].changes[0].delta).toBe(
            "100000000000000000",
        );
    });

    it("should use tokenRecipient when provided", async () => {
        const sender = "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7";
        const transactionTo = "0x1111111111111111111111111111111111111111";
        const tokenRecipient = "0x2222222222222222222222222222222222222222";

        const balancesBefore = new Map();
        balancesBefore.set(sender.toLowerCase(), {
            native: 1000000000000000000n,
            tokens: new Map(),
        });
        balancesBefore.set(tokenRecipient.toLowerCase(), {
            native: 0n,
            tokens: new Map(),
        });

        const balancesAfter = new Map();
        balancesAfter.set(sender.toLowerCase(), {
            native: 900000000000000000n,
            tokens: new Map(),
        });
        balancesAfter.set(tokenRecipient.toLowerCase(), {
            native: 100000000000000000n,
            tokens: new Map(),
        });

        const result = await buildStateImpactReport(
            mockProvider,
            sender,
            transactionTo,
            [],
            balancesBefore,
            balancesAfter,
            "ETH",
            tokenRecipient,
        );

        expect(result.recipient.address).toBe(tokenRecipient.toLowerCase());
    });

    it("should handle missing token metadata (fallback to UNKNOWN)", async () => {
        const sender = "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7";
        const recipient = "0x000000000000000000000000000000000000dead";
        const unknownToken = "0x9999999999999999999999999999999999999999";

        const balancesBefore = new Map();
        const balancesAfter = new Map();

        // But we have balances for it from the simulation
        balancesBefore.set(sender.toLowerCase(), {
            native: 0n,
            tokens: new Map([[unknownToken.toLowerCase(), 100n]]),
        });
        balancesBefore.set(recipient.toLowerCase(), {
            native: 0n,
            tokens: new Map(),
        });

        balancesAfter.set(sender.toLowerCase(), {
            native: 0n,
            tokens: new Map([[unknownToken.toLowerCase(), 50n]]),
        });
        balancesAfter.set(recipient.toLowerCase(), {
            native: 0n,
            tokens: new Map(),
        });

        // Don't pass unknownToken in the list, so it triggers fallback
        const result = await buildStateImpactReport(
            mockProvider,
            sender,
            recipient,
            [],
            balancesBefore,
            balancesAfter,
        );

        expect(result.sender.changes[0].token).toBe("UNKNOWN");
    });

    it("should handle address missing in after snapshot", async () => {
        const sender = "0xSender";
        const disappeared = "0xDisappeared";

        const balancesBefore = new Map();
        balancesBefore.set(sender.toLowerCase(), {
            native: 0n,
            tokens: new Map(),
        });
        balancesBefore.set(disappeared.toLowerCase(), {
            native: 100n,
            tokens: new Map(),
        });

        const balancesAfter = new Map();
        balancesAfter.set(sender.toLowerCase(), {
            native: 0n,
            tokens: new Map(),
        });
        // disappeared is missing from balancesAfter

        const result = await buildStateImpactReport(
            mockProvider,
            sender,
            "0xRecipient",
            [],
            balancesBefore,
            balancesAfter,
        );

        expect(result.contractsAffected).not.toContainEqual(
            expect.objectContaining({ address: disappeared.toLowerCase() }),
        );
    });

    it("should handle token balance present in after but not before (minting)", async () => {
        const sender = "0xSender";
        const token = "0xToken";

        const balancesBefore = new Map();
        balancesBefore.set(sender.toLowerCase(), {
            native: 0n,
            tokens: new Map(),
        });

        const balancesAfter = new Map();
        balancesAfter.set(sender.toLowerCase(), {
            native: 0n,
            tokens: new Map([[token.toLowerCase(), 100n]]),
        });

        // We skip passing token in tokenAddresses to trigger fallback metadata
        const result = await buildStateImpactReport(
            mockProvider,
            sender,
            "0xRecipient",
            [],
            balancesBefore,
            balancesAfter,
        );

        expect(result.sender.changes[0].delta).toBe("100");
        expect(result.sender.changes[0].before).toBe("0");
        expect(result.sender.changes[0].after).toBe("100");
    });

    it("should ignore addresses with no changes", async () => {
        const sender = "0xSender";
        const recipient = "0xRecipient";
        const unaffected = "0xUnaffected";

        const balancesBefore = new Map();
        balancesBefore.set(sender.toLowerCase(), {
            native: 10n,
            tokens: new Map(),
        });
        balancesBefore.set(recipient.toLowerCase(), {
            native: 0n,
            tokens: new Map(),
        });
        balancesBefore.set(unaffected.toLowerCase(), {
            native: 100n,
            tokens: new Map(),
        });

        const balancesAfter = new Map();
        balancesAfter.set(sender.toLowerCase(), {
            native: 9n,
            tokens: new Map(),
        }); // -1
        balancesAfter.set(recipient.toLowerCase(), {
            native: 1n,
            tokens: new Map(),
        }); // +1
        balancesAfter.set(unaffected.toLowerCase(), {
            native: 100n,
            tokens: new Map(),
        }); // No change

        const result = await buildStateImpactReport(
            mockProvider,
            sender,
            recipient,
            [],
            balancesBefore,
            balancesAfter,
        );

        expect(result.contractsAffected).toHaveLength(0);
    });
});
