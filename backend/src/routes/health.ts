import { Router } from "express";
import { pingDatabase } from "../db.ts";

export const healthRouter = Router();

/**
 * GET /api/health
 * 200 when the API can reach TigerData, 503 when it cannot. Error details
 * stay in the server log so connection info is never sent to clients.
 */
healthRouter.get("/", async (_req, res) => {
  try {
    const { latencyMs } = await pingDatabase();
    res.json({ status: "ok", database: "up", latencyMs });
  } catch (error) {
    console.error("[health] Database check failed:", (error as Error).message);
    res.status(503).json({ status: "error", database: "down" });
  }
});
