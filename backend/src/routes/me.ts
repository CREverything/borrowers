import { Router, type RequestHandler } from "express";
import { authenticatedUserId } from "../auth.ts";

/**
 * GET /api/me
 * Returns the user ID from the verified session token. The frontend uses it
 * to confirm that sign-in works end to end. No database records are involved.
 */
export function createMeRouter(requireUser: RequestHandler[]) {
  const router = Router();
  router.get("/", ...requireUser, (_req, res) => {
    res.set("Cache-Control", "no-store");
    res.json({ userId: authenticatedUserId(res) });
  });
  return router;
}
