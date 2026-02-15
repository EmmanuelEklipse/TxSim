import {
    decodeWasmEvents,
    filterEventsByExtrinsicIndex,
    getLastExtrinsicIndex,
    filterRelevantEvents,
} from "../wasm-event-decoder";
import { ApiPromise } from "@polkadot/api";

// Mock ApiPromise
const createMockApi = () => {
    return {
        events: {
            Balances: {
                Transfer: {
                    meta: {
                        fields: [
                            { name: "from" },
                            { name: "to" },
                            { name: "amount" },
                        ],
                    },
                },
            },
        },
    } as unknown as ApiPromise;
};

describe("decodeWasmEvents", () => {
    it("should decode events with ApplyExtrinsic phase", () => {
        const mockApi = createMockApi();

        const mockEvents = [
            {
                event: {
                    section: "Balances",
                    method: "Transfer",
                    data: ["sender", "recipient", "1000"],
                },
                phase: {
                    isApplyExtrinsic: true,
                    asApplyExtrinsic: { toNumber: () => 1 },
                },
            },
        ];

        const result = decodeWasmEvents(mockApi, mockEvents);

        expect(result).toHaveLength(1);
        expect(result[0].event.pallet).toBe("Balances");
        expect(result[0].event.method).toBe("Transfer");
        expect(result[0].phase.type).toBe("ApplyExtrinsic");
        expect(result[0].phase.value).toBe(1);
    });

    it("should decode events with Initialization phase", () => {
        const mockApi = createMockApi();

        const mockEvents = [
            {
                event: {
                    section: "System",
                    method: "ExtrinsicSuccess",
                    data: [],
                },
                phase: {
                    isApplyExtrinsic: false,
                    isInitialization: true,
                },
            },
        ];

        const result = decodeWasmEvents(mockApi, mockEvents);

        expect(result).toHaveLength(1);
        expect(result[0].phase.type).toBe("Initialization");
    });

    it("should decode events with Finalization phase", () => {
        const mockApi = createMockApi();

        const mockEvents = [
            {
                event: {
                    section: "System",
                    method: "ExtrinsicSuccess",
                    data: [],
                },
                phase: {
                    isApplyExtrinsic: false,
                    isInitialization: false,
                    isFinalization: true,
                },
            },
        ];

        const result = decodeWasmEvents(mockApi, mockEvents);

        expect(result).toHaveLength(1);
        expect(result[0].phase.type).toBe("Finalization");
    });

    it("should handle events without metadata", () => {
        const mockApi = { events: {} } as unknown as ApiPromise;

        const mockEvents = [
            {
                event: {
                    section: "Unknown",
                    method: "UnknownEvent",
                    data: ["data1", "data2"],
                },
                phase: {
                    isApplyExtrinsic: true,
                    asApplyExtrinsic: { toNumber: () => 0 },
                },
            },
        ];

        const result = decodeWasmEvents(mockApi, mockEvents);

        expect(result).toHaveLength(1);
        expect(result[0].event.pallet).toBe("Unknown");
    });

    it("should skip records without event", () => {
        const mockApi = createMockApi();

        const mockEvents = [
            {
                event: null,
                phase: {},
            },
        ];

        const result = decodeWasmEvents(mockApi, mockEvents);

        expect(result).toHaveLength(0);
    });
});

describe("filterEventsByExtrinsicIndex", () => {
    it("should filter events by extrinsic index", () => {
        const events = [
            {
                phase: { type: "ApplyExtrinsic", value: 1 },
                event: {
                    pallet: "Balances",
                    method: "Transfer",
                    data: {},
                    index: 0,
                },
            },
            {
                phase: { type: "ApplyExtrinsic", value: 2 },
                event: {
                    pallet: "System",
                    method: "ExtrinsicSuccess",
                    data: {},
                    index: 1,
                },
            },
            {
                phase: { type: "ApplyExtrinsic", value: 1 },
                event: {
                    pallet: "Balances",
                    method: "Deposit",
                    data: {},
                    index: 2,
                },
            },
        ];

        const result = filterEventsByExtrinsicIndex(events, 1);

        expect(result).toHaveLength(2);
        expect(result[0].pallet).toBe("Balances");
        expect(result[1].pallet).toBe("Balances");
    });

    it("should return empty array if no events match", () => {
        const events = [
            {
                phase: { type: "ApplyExtrinsic", value: 1 },
                event: {
                    pallet: "Balances",
                    method: "Transfer",
                    data: {},
                    index: 0,
                },
            },
        ];

        const result = filterEventsByExtrinsicIndex(events, 99);

        expect(result).toEqual([]);
    });
});

describe("getLastExtrinsicIndex", () => {
    it("should return the highest extrinsic index", () => {
        const events = [
            {
                phase: { type: "ApplyExtrinsic", value: 1 },
                event: {
                    pallet: "Balances",
                    method: "Transfer",
                    data: {},
                    index: 0,
                },
            },
            {
                phase: { type: "ApplyExtrinsic", value: 5 },
                event: {
                    pallet: "System",
                    method: "ExtrinsicSuccess",
                    data: {},
                    index: 1,
                },
            },
            {
                phase: { type: "ApplyExtrinsic", value: 3 },
                event: {
                    pallet: "Balances",
                    method: "Deposit",
                    data: {},
                    index: 2,
                },
            },
        ];

        const result = getLastExtrinsicIndex(events);

        expect(result).toBe(5);
    });

    it("should return -1 if no ApplyExtrinsic events", () => {
        const events = [
            {
                phase: { type: "Initialization" },
                event: {
                    pallet: "System",
                    method: "ExtrinsicSuccess",
                    data: {},
                    index: 0,
                },
            },
        ];

        const result = getLastExtrinsicIndex(events);

        expect(result).toBe(-1);
    });
});

describe("filterRelevantEvents", () => {
    it("should filter events by relevant pallets", () => {
        const events = [
            { pallet: "balances", method: "Transfer", data: {}, index: 0 },
            { pallet: "unknown", method: "Something", data: {}, index: 1 },
            {
                pallet: "system",
                method: "ExtrinsicSuccess",
                data: {},
                index: 2,
            },
        ];

        const result = filterRelevantEvents(events);

        expect(result).toHaveLength(2);
        expect(result[0].pallet).toBe("balances");
        expect(result[1].pallet).toBe("system");
    });

    it("should filter events by relevant methods", () => {
        const events = [
            { pallet: "unknown", method: "Transfer", data: {}, index: 0 },
            { pallet: "unknown", method: "Something", data: {}, index: 1 },
            {
                pallet: "unknown",
                method: "ExtrinsicFailed",
                data: {},
                index: 2,
            },
        ];

        const result = filterRelevantEvents(events);

        expect(result).toHaveLength(2);
        expect(result[0].method).toBe("Transfer");
        expect(result[1].method).toBe("ExtrinsicFailed");
    });
});
