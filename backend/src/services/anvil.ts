import { ethers } from "ethers";
import { Mutex } from "async-mutex";

class AnvilService {
    private provider: ethers.JsonRpcProvider | null = null;
    private anvilUrl: string;
    private forkUrl: string | null = null;
    private forkBlockNumber: number | null = null;
    private mutex: Mutex = new Mutex();

    constructor(anvilUrl: string = "http://127.0.0.1:8545") {
        this.anvilUrl = anvilUrl;
    }

    async connect(forkUrl?: string): Promise<void> {
        this.provider = new ethers.JsonRpcProvider(this.anvilUrl);

        if (forkUrl) {
            this.forkUrl = forkUrl;
        } else {
            // Fallback to env variable
            this.forkUrl = process.env.FORK_URL_EVM || null;
        }

        const blockNumber = await this.provider.getBlockNumber();
        this.forkBlockNumber = blockNumber;

        console.log(`Connected to Anvil at block ${blockNumber}`);
        if (this.forkUrl) {
            console.log(`Fork URL configured: ${this.forkUrl}`);
        }
    }

    getProvider(): ethers.JsonRpcProvider {
        if (!this.provider) {
            throw new Error("Anvil not connected. Call connect() first.");
        }
        return this.provider;
    }

    async isConnected(): Promise<boolean> {
        try {
            await this.provider?.getBlockNumber();
            return true;
        } catch {
            return false;
        }
    }

    async snapshot(): Promise<string> {
        const provider = this.getProvider();
        const snapshotId = await provider.send("evm_snapshot", []);
        return snapshotId;
    }

    async revert(snapshotId: string): Promise<boolean> {
        const provider = this.getProvider();
        const success = await provider.send("evm_revert", [snapshotId]);
        return success;
    }

    async impersonate(address: string): Promise<void> {
        const provider = this.getProvider();
        await provider.send("anvil_impersonateAccount", [address]);
    }

    async stopImpersonating(address: string): Promise<void> {
        const provider = this.getProvider();
        await provider.send("anvil_stopImpersonatingAccount", [address]);
    }

    async getImpersonatedSigner(address: string): Promise<ethers.Signer> {
        const provider = this.getProvider();
        await this.impersonate(address);
        return provider.getSigner(address);
    }

    async reset(): Promise<void> {
        const provider = this.getProvider();

        if (this.forkUrl && this.forkBlockNumber) {
            await provider.send("anvil_reset", [
                {
                    forking: {
                        jsonRpcUrl: this.forkUrl,
                        blockNumber: this.forkBlockNumber,
                    },
                },
            ]);
        } else {
            await provider.send("anvil_reset", []);
        }
    }

    getMutex(): Mutex {
        return this.mutex;
    }
}

export const anvilService = new AnvilService();
