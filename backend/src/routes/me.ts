import { Router, type RequestHandler } from "express";
import { authenticatedUserId } from "../auth.ts";
import { getPool } from "../db.ts";
import { getAccount } from "../requests/repository.ts";

/**
 * GET /api/me
 * The logged-in user's id, profile name and Switchies balance, all read from
 * TigerData for the verified session user. Also creates their profile row on
 * first use (via `protect`).
 */
export function createMeRouter(protect: RequestHandler[]) {
  const router = Router();
  router.get("/", ...protect, async (_req, res) => {
    res.set("Cache-Control", "no-store");
    res.json(await getAccount(getPool(), authenticatedUserId(res)));
  });
  return router;
}
