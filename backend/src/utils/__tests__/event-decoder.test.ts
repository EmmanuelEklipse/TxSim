import { decodeLog, decodeLogs, decodeLogsWithAbi } from "../event-decoder";
import { ethers } from "ethers";

describe("decodeLog", () => {
    it("should decode ERC20 Transfer event", () => {
        const log = {
            topics: [
                "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef", // Transfer(address,address,uint256)
                "0x000000000000000000000000742d35cc6634c0532925a3b844bc9e7595f0beb7",
                "0x000000000000000000000000000000000000000000000000000000000000dead",
            ],
            data: "0x00000000000000000000000000000000000000000000000000000000000003e8", // 1000
            address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
            index: 0,
        } as ethers.Log;

        const result = decodeLog(log);

        expect(result).not.toBeNull();
        expect(result?.name).toBe("Transfer");
        expect(result?.contract).toBe(
            "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
        );
        expect(result?.args.from).toBe(
            "0x742d35cc6634c0532925a3b844bc9e7595f0beb7",
        );
        expect(result?.args.to).toBe(
            "0x000000000000000000000000000000000000dead",
        );
        expect(result?.args.value).toBe("1000");
        expect(result?.logIndex).toBe(0);
    });

    it("should decode ERC20 Approval event", () => {
        const log = {
            topics: [
                "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925", // Approval(address,address,uint256)
                "0x000000000000000000000000742d35cc6634c0532925a3b844bc9e7595f0beb7",
                "0x0000000000000000000000001234567890123456789012345678901234567890",
            ],
            data: "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff", // max uint256
            address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
            index: 1,
        } as ethers.Log;

        const result = decodeLog(log);

        expect(result).not.toBeNull();
        expect(result?.name).toBe("Approval");
        expect(result?.args.owner).toBe(
            "0x742d35cc6634c0532925a3b844bc9e7595f0beb7",
        );
        expect(result?.args.spender).toBe(
            "0x1234567890123456789012345678901234567890",
        );
    });

    it("should return null for log with no topics", () => {
        const log = {
            topics: [],
            data: "0x",
            address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
            index: 0,
        } as ethers.Log;

        const result = decodeLog(log);

        expect(result).toBeNull();
    });

    it("should return null for unknown event", () => {
        const log = {
            topics: [
                "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef", // Unknown event
            ],
            data: "0x",
            address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
            index: 0,
        } as ethers.Log;

        const result = decodeLog(log);

        expect(result).toBeNull();
    });

    it("should handle OwnershipTransferred event", () => {
        const log = {
            topics: [
                "0x8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e0", // OwnershipTransferred
                "0x000000000000000000000000742d35cc6634c0532925a3b844bc9e7595f0beb7",
                "0x0000000000000000000000001234567890123456789012345678901234567890",
            ],
            data: "0x",
            address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
            index: 2,
        } as ethers.Log;

        const result = decodeLog(log);

        expect(result).not.toBeNull();
        expect(result?.name).toBe("OwnershipTransferred");
        expect(result?.args.previousOwner).toBe(
            "0x742d35cc6634c0532925a3b844bc9e7595f0beb7",
        );
        expect(result?.args.newOwner).toBe(
            "0x1234567890123456789012345678901234567890",
        );
    });
});

describe("decodeLogs", () => {
    it("should decode multiple logs and sort by index", () => {
        const logs = [
            {
                topics: [
                    "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
                    "0x000000000000000000000000742d35cc6634c0532925a3b844bc9e7595f0beb7",
                    "0x000000000000000000000000000000000000000000000000000000000000dead",
                ],
                data: "0x00000000000000000000000000000000000000000000000000000000000003e8",
                address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
                index: 2,
            },
            {
                topics: [
                    "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925",
                    "0x000000000000000000000000742d35cc6634c0532925a3b844bc9e7595f0beb7",
                    "0x0000000000000000000000001234567890123456789012345678901234567890",
                ],
                data: "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
                address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
                index: 0,
            },
        ] as ethers.Log[];

        const result = decodeLogs(logs);

        expect(result).toHaveLength(2);
        expect(result[0].name).toBe("Approval");
        expect(result[0].logIndex).toBe(0);
        expect(result[1].name).toBe("Transfer");
        expect(result[1].logIndex).toBe(2);
    });

    it("should filter out unknown events", () => {
        const logs = [
            {
                topics: [
                    "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
                    "0x000000000000000000000000742d35cc6634c0532925a3b844bc9e7595f0beb7",
                    "0x000000000000000000000000000000000000000000000000000000000000dead",
                ],
                data: "0x00000000000000000000000000000000000000000000000000000000000003e8",
                address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
                index: 0,
            },
            {
                topics: [
                    "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
                ],
                data: "0x",
                address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
                index: 1,
            },
        ] as ethers.Log[];

        const result = decodeLogs(logs);

        expect(result).toHaveLength(1);
        expect(result[0].name).toBe("Transfer");
    });

    it("should return empty array for empty logs", () => {
        const result = decodeLogs([]);

        expect(result).toEqual([]);
    });
});

describe("decodeLogsWithAbi", () => {
    it("should decode logs with custom ABI", () => {
        const customAbi = [
            "event CustomEvent(address indexed user, uint256 amount)",
        ];

        // Create a custom event log
        const iface = new ethers.Interface(customAbi);
        const topic = iface.getEvent("CustomEvent")?.topicHash;

        const logs = [
            {
                topics: [
                    topic!,
                    "0x000000000000000000000000742d35cc6634c0532925a3b844bc9e7595f0beb7",
                ],
                data: "0x00000000000000000000000000000000000000000000000000000000000003e8",
                address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
                index: 0,
            },
        ] as ethers.Log[];

        const result = decodeLogsWithAbi(logs, customAbi);

        expect(result).toHaveLength(1);
        expect(result[0].name).toBe("CustomEvent");
        expect(result[0].args.user).toBe(
            "0x742d35cc6634c0532925a3b844bc9e7595f0beb7",
        );
        expect(result[0].args.amount).toBe("1000");
    });

    it("should fallback to known events if custom ABI fails", () => {
        const customAbi = [
            "event CustomEvent(address indexed user, uint256 amount)",
        ];

        const logs = [
            {
                topics: [
                    "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef", // Transfer
                    "0x000000000000000000000000742d35cc6634c0532925a3b844bc9e7595f0beb7",
                    "0x000000000000000000000000000000000000000000000000000000000000dead",
                ],
                data: "0x00000000000000000000000000000000000000000000000000000000000003e8",
                address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
                index: 0,
            },
        ] as ethers.Log[];

        const result = decodeLogsWithAbi(logs, customAbi);

        expect(result).toHaveLength(1);
        expect(result[0].name).toBe("Transfer");
    });

    it("should sort logs by index", () => {
        const customAbi = [
            "event CustomEvent(address indexed user, uint256 amount)",
        ];

        const logs = [
            {
                topics: [
                    "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
                    "0x000000000000000000000000742d35cc6634c0532925a3b844bc9e7595f0beb7",
                    "0x000000000000000000000000000000000000000000000000000000000000dead",
                ],
                data: "0x00000000000000000000000000000000000000000000000000000000000003e8",
                address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
                index: 2,
            },
            {
                topics: [
                    "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925",
                    "0x000000000000000000000000742d35cc6634c0532925a3b844bc9e7595f0beb7",
                    "0x0000000000000000000000001234567890123456789012345678901234567890",
                ],
                data: "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
                address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
                index: 0,
            },
        ] as ethers.Log[];

        const result = decodeLogsWithAbi(logs, customAbi);

        expect(result).toHaveLength(2);
        expect(result[0].logIndex).toBe(0);
        expect(result[1].logIndex).toBe(2);
    });
});
