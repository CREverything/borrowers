import { Router, type RequestHandler, type Response } from "express";
import { authenticatedUserId } from "../auth.ts";
import { getPool } from "../db.ts";
import { createReport, listMyReports, parseReport } from "../reports/repository.ts";
import { RequestError } from "../requests/repository.ts";

/**
 * Issue reports: /api/reports. The reporter always comes from the verified
 * session. Report text is never logged.
 */
export function createReportsRouter(protect: RequestHandler[]) {
  const router = Router();
  const noStore: RequestHandler = (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  };

  /** POST /api/reports: report an issue with a borrowing you're part of. */
  router.post("/", ...protect, noStore, async (req, res) => {
    await respond(res, async () => {
      const saved = await createReport(getPool(), authenticatedUserId(res), parseReport(req.body));
      res.status(saved.duplicate ? 200 : 201).json({ id: saved.id, status: saved.status, createdAt: saved.createdAt });
    });
  });

  /** GET /api/reports: the reports you've submitted. */
  router.get("/", ...protect, noStore, async (_req, res) => {
    res.json(await listMyReports(getPool(), authenticatedUserId(res)));
  });

  return router;
}

async function respond(res: Response, work: () => Promise<void>) {
  try {
    await work();
  } catch (error) {
    if (error instanceof RequestError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    throw error;
  }
}
