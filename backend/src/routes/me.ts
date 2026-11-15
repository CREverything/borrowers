import { Router, type RequestHandler } from "express";
import { authenticatedUserId } from "../auth.ts";
import { getPool } from "../db.ts";
import { getAccount } from "../requests/repository.ts";
import { getActivitySummary, viewerToday } from "../users/activity.ts";

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

  /**
   * GET /api/me/activity-summary?today=YYYY-MM-DD
   * Counts for the activity bar. The user always comes from the verified
   * session; `today` only sets which loans count as started.
   */
  router.get("/activity-summary", ...protect, async (req, res) => {
    res.set("Cache-Control", "no-store");
    const today = viewerToday(req.query.today);
    res.json(await getActivitySummary(getPool(), authenticatedUserId(res), today));
  });
  return router;
}
