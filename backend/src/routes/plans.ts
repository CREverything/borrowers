import { Router, type RequestHandler, type Response } from "express";
import { authenticatedUserId } from "../auth.ts";
import { getPool } from "../db.ts";
import {
  createPlan,
  deletePlan,
  duplicatePlan,
  getPlan,
  listPlans,
  submitPlanRequests,
  updatePlan,
} from "../plans/repository.ts";
import { parsePlanInput, parseSelections } from "../plans/validation.ts";
import { RequestError } from "../requests/repository.ts";

/**
 * Saved event plans: /api/plans. Every route needs a logged-in user and only
 * ever sees that user's plans.
 */
export function createPlansRouter(protect: RequestHandler[]) {
  const router = Router();
  const noStore: RequestHandler = (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  };
  const guard = [...protect, noStore];
  const owner = (res: Response) => authenticatedUserId(res);

  router.get("/", ...guard, async (_req, res) => {
    res.json(await listPlans(getPool(), owner(res)));
  });

  router.post("/", ...guard, async (req, res) => {
    await respond(res, 201, () => createPlan(getPool(), owner(res), parsePlanInput(req.body, true)));
  });

  router.get("/:id", ...guard, async (req, res) => {
    await respond(res, 200, () => getPlan(getPool(), owner(res), planId(req.params.id)));
  });

  router.patch("/:id", ...guard, async (req, res) => {
    await respond(res, 200, () =>
      updatePlan(getPool(), owner(res), planId(req.params.id), parsePlanInput(req.body, false)),
    );
  });

  router.delete("/:id", ...guard, async (req, res) => {
    await respond(res, 200, async () => {
      await deletePlan(getPool(), owner(res), planId(req.params.id));
      return { ok: true };
    });
  });

  router.post("/:id/duplicate", ...guard, async (req, res) => {
    await respond(res, 201, () => duplicatePlan(getPool(), owner(res), planId(req.params.id)));
  });

  /** POST /api/plans/:id/requests: request the selected listings; per-listing results. */
  router.post("/:id/requests", ...guard, async (req, res) => {
    await respond(res, 200, () =>
      submitPlanRequests(getPool(), owner(res), planId(req.params.id), parseSelections(req.body)),
    );
  });

  return router;
}

function planId(raw: unknown): string {
  const id = String(raw);
  if (!/^\d{1,18}$/.test(id)) throw new RequestError(404, "Plan not found.");
  return id;
}

async function respond(res: Response, status: number, work: () => Promise<unknown>) {
  try {
    res.status(status).json(await work());
  } catch (error) {
    if (error instanceof RequestError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    throw error;
  }
}
