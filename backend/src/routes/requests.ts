import { Router, type RequestHandler, type Response } from "express";
import { authenticatedUserId } from "../auth.ts";
import { getPool } from "../db.ts";
import {
  cancelEventRequest,
  cancelRequest,
  createBorrowRequest,
  createEventRequest,
  decideRequest,
  listForBorrower,
  listForLender,
  RequestError,
} from "../requests/repository.ts";
import { parseBorrowRequest, parseEventRequest, parseId } from "../requests/validation.ts";

/**
 * Borrow and event requests. Every route needs a logged-in user (`protect`);
 * the borrower or lender is always the verified session user.
 */
export function createRequestsRouter(protect: RequestHandler[]) {
  const router = Router();
  const noStore: RequestHandler = (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  };
  const guard = [...protect, noStore];

  /** GET /api/requests: my borrow and event requests. */
  router.get("/requests", ...guard, async (_req, res) => {
    res.json(await listForBorrower(getPool(), authenticatedUserId(res)));
  });

  /** POST /api/requests: ask to borrow one item. */
  router.post("/requests", ...guard, async (req, res) => {
    const parsed = parseBorrowRequest(req.body);
    if (!parsed.ok) return sendError(res, new RequestError(400, parsed.error));
    await respond(res, 201, () => createBorrowRequest(getPool(), authenticatedUserId(res), parsed.value));
  });

  /** POST /api/requests/:id/cancel: borrower withdraws a pending request. */
  router.post("/requests/:id/cancel", ...guard, async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) return sendError(res, new RequestError(404, "Request not found."));
    await respond(res, 200, () => cancelRequest(getPool(), authenticatedUserId(res), id));
  });

  /** POST /api/requests/:id/approve and /decline: the item's lender responds. */
  for (const decision of ["approve", "decline"] as const) {
    router.post(`/requests/:id/${decision}`, ...guard, async (req, res) => {
      const id = parseId(req.params.id);
      if (id === null) return sendError(res, new RequestError(404, "Request not found."));
      await respond(res, 200, () => decideRequest(getPool(), authenticatedUserId(res), id, decision));
    });
  }

  /** GET /api/incoming-requests: requests for my listings. */
  router.get("/incoming-requests", ...guard, async (_req, res) => {
    res.json(await listForLender(getPool(), authenticatedUserId(res)));
  });

  /** POST /api/event-requests: request several items for one event. */
  router.post("/event-requests", ...guard, async (req, res) => {
    const parsed = parseEventRequest(req.body);
    if (!parsed.ok) return sendError(res, new RequestError(400, parsed.error));
    await respond(res, 201, () => createEventRequest(getPool(), authenticatedUserId(res), parsed.value));
  });

  /** POST /api/event-requests/:id/cancel */
  router.post("/event-requests/:id/cancel", ...guard, async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) return sendError(res, new RequestError(404, "Request not found."));
    await respond(res, 200, async () => {
      await cancelEventRequest(getPool(), authenticatedUserId(res), id);
      return { ok: true };
    });
  });

  return router;
}

/** Runs `work`, turning RequestErrors into their HTTP status. Other errors go to the error handler. */
async function respond(res: Response, status: number, work: () => Promise<unknown>) {
  try {
    res.status(status).json(await work());
  } catch (error) {
    if (error instanceof RequestError) return sendError(res, error);
    throw error;
  }
}

function sendError(res: Response, error: RequestError) {
  res.status(error.status).json({ error: error.message });
}
