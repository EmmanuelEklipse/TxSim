import express from "express";
import { spawn, ChildProcess } from "child_process";
import { anvilService } from "./services/anvil";
import { chopsticksService } from "./services/chopsticks";
import unifiedSimulateRouter from "./routes/unified-simulate";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

let anvilProcess: ChildProcess | null = null;
let chopsticksProcess: ChildProcess | null = null;

const FORK_URL_EVM = process.env.FORK_URL_EVM;
const FORK_URL_WASM = process.env.FORK_URL_WASM;
const CHOPSTICKS_PORT = process.env.CHOPSTICKS_PORT || "8546";

app.use(express.json());

app.use("/simulate", unifiedSimulateRouter);

app.get("/health", async (req, res) => {
    const [anvilConnected, chopsticksConnected] = await Promise.all([
        anvilService.isConnected(),
        chopsticksService.isConnected(),
    ]);

    res.json({
        status: anvilConnected && chopsticksConnected ? "ok" : "degraded",
        evm: {
            status: anvilConnected ? "connected" : "disconnected",
            chain: "Moonbeam",
        },
        wasm: {
            status: chopsticksConnected ? "connected" : "disconnected",
            chain: "Astar",
        },
    });
});

function startAnvil(): Promise<void> {
    return new Promise((resolve, reject) => {
        console.log("Starting Anvil...");

        anvilProcess = spawn("anvil", ["--fork-url", FORK_URL_EVM!], {
            stdio: "inherit",
        });

        anvilProcess.on("error", (err) => {
            console.error("Failed to start Anvil:", err);
            reject(err);
        });

        setTimeout(() => {
            console.log("Anvil ready");
            resolve();
        }, 10000);
    });
}

function startChopsticks(): Promise<void> {
    return new Promise((resolve, reject) => {
        console.log("Starting Chopsticks...");

        chopsticksProcess = spawn(
            `PORT=${CHOPSTICKS_PORT} npx @acala-network/chopsticks --config ./config/chopsticks-config.yml`,
            [],
            {
                stdio: "inherit",
                shell: true,
            },
        );

        chopsticksProcess.on("error", (err) => {
            console.error("Failed to start Chopsticks:", err);
            reject(err);
        });

        setTimeout(() => {
            console.log("Chopsticks ready");
            resolve();
        }, 25000);
    });
}

async function start() {
    try {
        console.log("Starting TxSim...\n");

        await startAnvil();
        await anvilService.connect(FORK_URL_EVM);

        await startChopsticks();

        await chopsticksService.connect(`http://localhost:${CHOPSTICKS_PORT}`);

        app.listen(PORT, () => {
            console.log(`\nTxSim server running on port ${PORT}`);
            console.log(
                `  Unified endpoint: POST http://localhost:${PORT}/simulate`,
            );
            console.log(`    - Supports both EVM and WASM transactions`);
            console.log(
                `  Health check:    GET  http://localhost:${PORT}/health`,
            );
        });
    } catch (error) {
        console.error("Failed to start server:", error);
        cleanup();
        process.exit(1);
    }
}

function cleanup() {
    if (anvilProcess) {
        anvilProcess.kill();
        console.log("Anvil stopped");
    }
    if (chopsticksProcess) {
        chopsticksProcess.kill();
        console.log("Chopsticks stopped");
    }
}

process.on("SIGINT", async () => {
    console.log("\nShutting down...");
    await chopsticksService.disconnect();
    cleanup();
    process.exit(0);
});

process.on("SIGTERM", async () => {
    console.log("\nShutting down...");
    await chopsticksService.disconnect();
    cleanup();
    process.exit(0);
});

start();
