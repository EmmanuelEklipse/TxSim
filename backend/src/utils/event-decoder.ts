import { ethers } from "ethers";

export interface DecodedEvent {
    name: string;
    contract: string;
    args: Record<string, string>;
    signature: string;
    logIndex: number;
}

// Common ERC20/ERC721/ERC1155 events
const KNOWN_EVENT_ABIS = [
    // ERC20
    "event Transfer(address indexed from, address indexed to, uint256 value)",
    "event Approval(address indexed owner, address indexed spender, uint256 value)",

    // ERC721
    "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
    "event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId)",
    "event ApprovalForAll(address indexed owner, address indexed operator, bool approved)",

    // ERC1155
    "event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value)",
    "event TransferBatch(address indexed operator, address indexed from, address indexed to, uint256[] ids, uint256[] values)",

    // Common DeFi
    "event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)",
    "event Mint(address indexed sender, uint256 amount0, uint256 amount1)",
    "event Burn(address indexed sender, uint256 amount0, uint256 amount1, address indexed to)",
    "event Sync(uint112 reserve0, uint112 reserve1)",

    // Ownership
    "event OwnershipTransferred(address indexed previousOwner, address indexed newOwner)",

    // Proxy
    "event Upgraded(address indexed implementation)",
];

// Pre-compute topic hashes for quick lookup
const EVENT_INTERFACES: ethers.Interface[] = [];
const TOPIC_TO_INTERFACE: Map<string, ethers.Interface> = new Map();

// Initialize on module load
(function initEventDecoder() {
    for (const abi of KNOWN_EVENT_ABIS) {
        try {
            const iface = new ethers.Interface([abi]);
            EVENT_INTERFACES.push(iface);

            // Get the topic hash for this event
            const fragment = iface.fragments[0];
            if (fragment && fragment.type === "event") {
                const eventFragment = fragment as ethers.EventFragment;
                const topic = iface.getEvent(eventFragment.name)?.topicHash;
                if (topic) {
                    TOPIC_TO_INTERFACE.set(topic.toLowerCase(), iface);
                }
            }
        } catch {}
    }
})();

export function decodeLog(log: ethers.Log): DecodedEvent | null {
    if (!log.topics || log.topics.length === 0) return null;

    const topic0 = log.topics[0].toLowerCase();

    // Try known events first (fast path)
    const knownInterface = TOPIC_TO_INTERFACE.get(topic0);
    if (knownInterface) {
        const decoded = tryDecodeWithInterface(log, knownInterface);
        if (decoded) return decoded;
    }

    // Try all known interfaces (handles topic collision for different signatures)
    for (const iface of EVENT_INTERFACES) {
        const decoded = tryDecodeWithInterface(log, iface);
        if (decoded) return decoded;
    }

    return null;
}

function tryDecodeWithInterface(
    log: ethers.Log,
    iface: ethers.Interface,
): DecodedEvent | null {
    try {
        const parsed = iface.parseLog({
            topics: log.topics as string[],
            data: log.data,
        });

        if (!parsed) return null;

        // Build args object with named parameters
        const args: Record<string, string> = {};
        parsed.fragment.inputs.forEach((input, index) => {
            const value = parsed.args[index];
            args[input.name || `arg${index}`] = formatArgValue(value);
        });

        return {
            name: parsed.name,
            contract: log.address.toLowerCase(),
            args,
            signature: parsed.signature,
            logIndex: log.index,
        };
    } catch {
        return null;
    }
}

function formatArgValue(value: any): string {
    if (value === null || value === undefined) {
        return "null";
    }

    // BigInt or BigNumber
    if (typeof value === "bigint" || value._isBigNumber) {
        return value.toString();
    }

    // Array
    if (Array.isArray(value)) {
        return `[${value.map(formatArgValue).join(", ")}]`;
    }

    // Address (keep lowercase for consistency)
    if (
        typeof value === "string" &&
        value.startsWith("0x") &&
        value.length === 42
    ) {
        return value.toLowerCase();
    }

    return value.toString();
}

export function decodeLogs(logs: ethers.Log[]): DecodedEvent[] {
    const decoded: DecodedEvent[] = [];

    for (const log of logs) {
        const event = decodeLog(log);
        if (event) {
            decoded.push(event);
        }
    }

    // Sort by log index
    return decoded.sort((a, b) => a.logIndex - b.logIndex);
}

// For custom ABIs (e.g., user provides contract ABI)
export function decodeLogsWithAbi(
    logs: ethers.Log[],
    abi: string[],
): DecodedEvent[] {
    const customInterface = new ethers.Interface(abi);
    const decoded: DecodedEvent[] = [];

    for (const log of logs) {
        // Try custom ABI first
        const customDecoded = tryDecodeWithInterface(log, customInterface);
        if (customDecoded) {
            decoded.push(customDecoded);
            continue;
        }

        // Fallback to known events
        const knownDecoded = decodeLog(log);
        if (knownDecoded) {
            decoded.push(knownDecoded);
        }
    }

    return decoded.sort((a, b) => a.logIndex - b.logIndex);
}
