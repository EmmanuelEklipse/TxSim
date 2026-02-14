import { ApiPromise } from "@polkadot/api";
import { WasmDecodedEvent } from "../types/wasm";

export interface WasmEventRecord {
    phase: { type: string; value?: number };
    event: WasmDecodedEvent;
}

export function decodeWasmEvents(
    api: ApiPromise,
    events: any[],
): WasmEventRecord[] {
    const decoded: WasmEventRecord[] = [];

    events.forEach((record, index) => {
        const { event, phase } = record;
        if (!event) return;

        const pallet = event.section;
        const method = event.method;

        // Parse phase to determine which extrinsic this event belongs to
        let phaseInfo: { type: string; value?: number } = { type: "unknown" };
        if (phase.isApplyExtrinsic) {
            phaseInfo = {
                type: "ApplyExtrinsic",
                value: phase.asApplyExtrinsic.toNumber(),
            };
        } else if (phase.isInitialization) {
            phaseInfo = { type: "Initialization" };
        } else if (phase.isFinalization) {
            phaseInfo = { type: "Finalization" };
        }

        // Decode event data
        const data: Record<string, any> = {};
        const eventMeta = api.events[pallet]?.[method]?.meta;
        const fieldNames =
            eventMeta?.fields?.map(
                (f: any) => f.name?.toString() || f.typeName?.toString(),
            ) || [];

        event.data.forEach((value: any, i: number) => {
            const fieldName = fieldNames[i] || `arg${i}`;
            data[fieldName] = formatEventValue(value);
        });

        decoded.push({
            phase: phaseInfo,
            event: {
                pallet,
                method,
                data,
                index,
            },
        });
    });

    return decoded;
}

function formatEventValue(value: any): any {
    if (value === null || value === undefined) return null;

    // Prefer toHuman() or toJSON() for Polkadot types
    if (value.toHuman && typeof value.toHuman === "function") {
        return value.toHuman();
    }
    if (value.toJSON && typeof value.toJSON === "function") {
        return value.toJSON();
    }
    if (value.toString && typeof value.toString === "function") {
        return value.toString();
    }

    if (typeof value === "object") {
        if (Array.isArray(value)) {
            return value.map(formatEventValue);
        }
        const obj: Record<string, any> = {};
        for (const key of Object.keys(value)) {
            obj[key] = formatEventValue(value[key]);
        }
        return obj;
    }

    return value;
}

// Filter events belonging to a specific extrinsic index
export function filterEventsByExtrinsicIndex(
    events: WasmEventRecord[],
    extrinsicIndex: number,
): WasmDecodedEvent[] {
    return events
        .filter(
            (e) =>
                e.phase.type === "ApplyExtrinsic" &&
                e.phase.value === extrinsicIndex,
        )
        .map((e) => e.event);
}

// Get the highest extrinsic index (your injected call is always the last one)
export function getLastExtrinsicIndex(events: WasmEventRecord[]): number {
    let max = -1;
    for (const e of events) {
        if (e.phase.type === "ApplyExtrinsic" && e.phase.value !== undefined) {
            if (e.phase.value > max) max = e.phase.value;
        }
    }
    return max;
}

// Filter for relevant event types
export function filterRelevantEvents(
    events: WasmDecodedEvent[],
): WasmDecodedEvent[] {
    const relevantPallets = [
        "balances",
        "assets",
        "tokens",
        "system",
        "transactionPayment",
    ];
    const relevantMethods = [
        "Transfer",
        "Deposit",
        "Withdraw",
        "Reserved",
        "Unreserved",
        "ExtrinsicSuccess",
        "ExtrinsicFailed",
    ];

    return events.filter(
        (e) =>
            relevantPallets.includes(e.pallet) ||
            relevantMethods.includes(e.method),
    );
}
