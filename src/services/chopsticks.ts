import { ApiPromise, HttpProvider } from "@polkadot/api";
import { Mutex } from "async-mutex";

class ChopsticksService {
    private api: ApiPromise | null = null;
    private provider: HttpProvider | null = null;
    private endpoint: string;
    private mutex: Mutex = new Mutex();
    private originalBlockHash: string | null = null; 
    private originalBlockNumber: number | null = null; 

    constructor(endpoint: string = "http://localhost:8546") {
        this.endpoint = endpoint;
    }

    async connect(endpoint?: string): Promise<void> {
        if (endpoint) {
            this.endpoint = endpoint;
        }

        console.log(`Connecting to Chopsticks at ${this.endpoint}...`);

        this.provider = new HttpProvider(this.endpoint);
        this.api = await ApiPromise.create({ provider: this.provider });

        const [chain, header] = await Promise.all([
            this.api.rpc.system.chain(),
            this.api.rpc.chain.getHeader(),
        ]);

        // ← STORE THE ORIGINAL FORK POINT
        this.originalBlockHash = header.hash.toString();
        this.originalBlockNumber = header.number.toNumber();

        console.log(`Connected to ${chain} at block #${header.number}`);
        console.log(`Original block hash: ${this.originalBlockHash}`);
    }

    getApi(): ApiPromise {
        if (!this.api) {
            throw new Error("Chopsticks not connected. Call connect() first.");
        }
        return this.api;
    }

    async isConnected(): Promise<boolean> {
        try {
            if (!this.api) return false;
            await this.api.rpc.system.health();
            return true;
        } catch {
            return false;
        }
    }

    // Disable signature verification for fake signatures
    async disableSignatureVerification(): Promise<void> {
        if (!this.provider) {
            throw new Error("Provider not initialized");
        }
        await (this.provider as any).send("dev_setSignatureVerification", [
            false,
        ]);
    }

    // Enable signature verification
    async enableSignatureVerification(): Promise<void> {
        if (!this.provider) {
            throw new Error("Provider not initialized");
        }
        await (this.provider as any).send("dev_setSignatureVerification", [
            true,
        ]);
    }

    // Dry run with fallback chain
    async dryRun(
        extrinsic: any,
        sender: string,
    ): Promise<{
        success: boolean;
        error?: any;
        weight?: { refTime: string; proofSize: string };
    }> {
        const api = this.getApi();

        // Method 1: call.dryRunApi with 3 args (origin, call, xcm_version)
        try {
            const result = await (api.call as any).dryRunApi.dryRunCall(
                { system: { Signed: sender } },
                extrinsic.method,
                5, // XCM_VERSION — required 3rd arg on modern runtimes
            );

            return this.parseDryRunResult(result);
        } catch (e1: any) {
            console.log("dryRunApi 3-arg failed:", e1.message);
        }

        // Method 2: system.dryRun RPC (older runtimes)
        try {
            const result = await api.rpc.system.dryRun(extrinsic.toHex());

            if (result.isOk) {
                return {
                    success: true,
                    weight: { refTime: "0", proofSize: "0" },
                };
            } else {
                return { success: false, error: result.asErr };
            }
        } catch (e2: any) {
            console.log("system.dryRun failed:", e2.message);
        }

        // Method 3: Skip dry run, rely on execution + event checking
        console.log("All dry run methods unavailable, skipping pre-validation");
        return { success: true, weight: { refTime: "0", proofSize: "0" } };
    }

    private parseDryRunResult(result: any): {
        success: boolean;
        error?: any;
        weight?: { refTime: string; proofSize: string };
    } {
        if (result.isOk) {
            const execResult = result.asOk;

            // Check execution_result field
            if (execResult.executionResult) {
                const execution = execResult.executionResult;
                if (execution.isOk) {
                    const postInfo = execution.asOk;
                    return {
                        success: true,
                        weight: {
                            refTime:
                                postInfo.actualWeight?.refTime?.toString() ||
                                "0",
                            proofSize:
                                postInfo.actualWeight?.proofSize?.toString() ||
                                "0",
                        },
                    };
                } else {
                    return { success: false, error: execution.asErr };
                }
            }

            // Older format: direct Ok/Err
            if (execResult.isOk) {
                return {
                    success: true,
                    weight: {
                        refTime:
                            execResult.asOk.actualWeight?.refTime?.toString() ||
                            "0",
                        proofSize:
                            execResult.asOk.actualWeight?.proofSize?.toString() ||
                            "0",
                    },
                };
            } else {
                return { success: false, error: execResult.asErr };
            }
        } else {
            return { success: false, error: result.asErr };
        }
    }

    // Get payment info (fee estimation)
    async getPaymentInfo(
        extrinsic: any,
        sender: string,
    ): Promise<{
        partialFee: string;
        weight: { refTime: string; proofSize: string };
    }> {
        const api = this.getApi();
        const info = await extrinsic.paymentInfo(sender);

        return {
            partialFee: info.partialFee.toString(),
            weight: {
                refTime: info.weight.refTime?.toString() || "0",
                proofSize: info.weight.proofSize?.toString() || "0",
            },
        };
    }

    // Submit extrinsic
    async submitExtrinsic(extrinsicHex: string): Promise<string> {
        // Use raw RPC to avoid Polkadot.js re-decoding the extrinsic
        const result = await this.rawRpc("author_submitExtrinsic", [
            extrinsicHex,
        ]);
        return result;
    }

    // Raw JSON-RPC call to Chopsticks
    private async rawRpc(method: string, params: any[] = []): Promise<any> {
        const response = await fetch(this.endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                jsonrpc: "2.0",
                id: Date.now(),
                method,
                params,
            }),
        });

        const json = (await response.json()) as any;

        if (json.error) {
            throw new Error(`RPC error: ${JSON.stringify(json.error)}`);
        }

        return json.result;
    }

    // Produce a new block
    async newBlock(): Promise<string> {
        const result = await this.rawRpc("dev_newBlock", [{}]);
        return result;
    }

    // Execute extrinsic via dev_newBlock (bypasses signature)
    async executeExtrinsic(callHex: string): Promise<string> {
        const result = await this.rawRpc("dev_newBlock", [
            {
                unsignedExtrinsics: [callHex],
            },
        ]);
        return result;
    }

    // Reset to original fork point
    async reset(): Promise<void> {
        if (!this.originalBlockHash) {
            console.warn("No original block hash stored, reconnecting instead...");
            await this.disconnect();
            await this.connect();
            return;
        }

        try {
            // Reset to the original block hash (the fork point)
            await this.rawRpc("dev_setHead", [this.originalBlockHash]);
            console.log(`Reset to original block: ${this.originalBlockNumber} (${this.originalBlockHash})`);
        } catch (error) {
            console.error("Reset via dev_setHead failed:", error);
            console.log("Attempting reconnect...");
            await this.disconnect();
            await this.connect();
        }
    }

    async disconnect(): Promise<void> {
        if (this.api) {
            await this.api.disconnect();
            this.api = null;
            this.provider = null;
            this.originalBlockHash = null; 
            this.originalBlockNumber = null;
            console.log("Chopsticks API disconnected");
        }
    }

    getMutex(): Mutex {
        return this.mutex;
    }
}

export const chopsticksService = new ChopsticksService();