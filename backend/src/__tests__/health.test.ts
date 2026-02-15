// src/__tests__/health.test.ts

import request from "supertest";
import express, { Express } from "express";
import { anvilService } from "../services/anvil";
import { chopsticksService } from "../services/chopsticks";

// Mock the services
jest.mock("../services/anvil");
jest.mock("../services/chopsticks");

const mockedAnvilService = anvilService as jest.Mocked<typeof anvilService>;
const mockedChopsticksService = chopsticksService as jest.Mocked<
    typeof chopsticksService
>;

describe("Health Route", () => {
    let app: Express;

    beforeEach(() => {
        app = express();

        // Setup the health route as it is in index.ts
        app.get("/health", async (req, res) => {
            const [anvilConnected, chopsticksConnected] = await Promise.all([
                anvilService.isConnected(),
                chopsticksService.isConnected(),
            ]);

            res.json({
                status:
                    anvilConnected && chopsticksConnected ? "ok" : "degraded",
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

        jest.clearAllMocks();
    });

    it("should return ok when all services are connected", async () => {
        mockedAnvilService.isConnected.mockResolvedValue(true);
        mockedChopsticksService.isConnected.mockResolvedValue(true);

        const response = await request(app).get("/health");

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
            status: "ok",
            evm: {
                status: "connected",
                chain: "Moonbeam",
            },
            wasm: {
                status: "connected",
                chain: "Astar",
            },
        });
    });

    it("should return degraded when Anvil is disconnected", async () => {
        mockedAnvilService.isConnected.mockResolvedValue(false);
        mockedChopsticksService.isConnected.mockResolvedValue(true);

        const response = await request(app).get("/health");

        expect(response.status).toBe(200);
        expect(response.body.status).toBe("degraded");
        expect(response.body.evm.status).toBe("disconnected");
        expect(response.body.wasm.status).toBe("connected");
    });

    it("should return degraded when Chopsticks is disconnected", async () => {
        mockedAnvilService.isConnected.mockResolvedValue(true);
        mockedChopsticksService.isConnected.mockResolvedValue(false);

        const response = await request(app).get("/health");

        expect(response.status).toBe(200);
        expect(response.body.status).toBe("degraded");
        expect(response.body.evm.status).toBe("connected");
        expect(response.body.wasm.status).toBe("disconnected");
    });

    it("should return degraded when both are disconnected", async () => {
        mockedAnvilService.isConnected.mockResolvedValue(false);
        mockedChopsticksService.isConnected.mockResolvedValue(false);

        const response = await request(app).get("/health");

        expect(response.status).toBe(200);
        expect(response.body.status).toBe("degraded");
        expect(response.body.evm.status).toBe("disconnected");
        expect(response.body.wasm.status).toBe("disconnected");
    });
});
