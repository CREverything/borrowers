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
import { listNotifications, markRead } from "../notifications/repository.ts";
import {
  decideExtension,
  initiateReturn,
  markHandedOver,
  parseExtension,
  reconcileDeadlineReminders,
  requestExtension,
} from "../requests/loans.ts";
import { listLoansNear } from "../requests/repository.ts";
import {
  createReview,
  listReviews,
  markReturned,
  parseScore,
  rateBorrower,
  setReturnTime,
} from "../requests/lifecycle.ts";
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
      // Approving needs the time the lender wants the item back.
      const returnDueAt = typeof req.body?.returnDueAt === "string" ? req.body.returnDueAt : undefined;
      await respond(res, 200, () =>
        decideRequest(getPool(), authenticatedUserId(res), id, decision, returnDueAt),
      );
    });
  }

  /** POST /api/requests/:id/return-time: lender changes when they want it back. */
  router.post("/requests/:id/return-time", ...guard, async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) return sendError(res, new RequestError(404, "Request not found."));
    await respond(res, 200, () => setReturnTime(getPool(), authenticatedUserId(res), id, req.body?.returnDueAt));
  });

  /** POST /api/requests/:id/returned: lender confirms it's back, optionally scoring the borrower. */
  router.post("/requests/:id/returned", ...guard, async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) return sendError(res, new RequestError(404, "Request not found."));
    await respond(res, 200, () =>
      markReturned(getPool(), authenticatedUserId(res), id, parseScore(req.body, 500, false)),
    );
  });

  /** POST /api/requests/:id/handed-over: either side records the item changed hands. */
  router.post("/requests/:id/handed-over", ...guard, async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) return sendError(res, new RequestError(404, "Request not found."));
    await respond(res, 200, () => markHandedOver(getPool(), authenticatedUserId(res), id));
  });

  /** POST /api/requests/:id/return: borrower says it's back; the lender then confirms. */
  router.post("/requests/:id/return", ...guard, async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) return sendError(res, new RequestError(404, "Request not found."));
    await respond(res, 200, () => initiateReturn(getPool(), authenticatedUserId(res), id));
  });

  /** POST /api/requests/:id/extensions: borrower asks for a later return time. */
  router.post("/requests/:id/extensions", ...guard, async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) return sendError(res, new RequestError(404, "Request not found."));
    await respond(res, 201, () =>
      requestExtension(getPool(), authenticatedUserId(res), id, parseExtension(req.body)),
    );
  });

  /** POST /api/extensions/:id/approve and /decline: the lender responds. */
  for (const decision of ["approve", "decline"] as const) {
    router.post(`/extensions/:id/${decision}`, ...guard, async (req, res) => {
      const id = parseId(req.params.id);
      if (id === null) return sendError(res, new RequestError(404, "Extension request not found."));
      await respond(res, 200, () => decideExtension(getPool(), authenticatedUserId(res), id, decision));
    });
  }

  /** GET /api/deadlines: my borrowed items due within 72 hours or overdue, soonest first. */
  router.get("/deadlines", ...guard, async (_req, res) => {
    const userId = authenticatedUserId(res);
    const loans = await listLoansNear(getPool(), userId, 72 * 3_600_000);
    res.json(
      loans
        .filter((l) => l.borrowerId === userId)
        .sort((a, b) => Date.parse(a.returnDueAt!) - Date.parse(b.returnDueAt!))
        .map((l) => ({ requestId: l.id, itemId: l.itemId, itemTitle: l.itemTitle, returnDueAt: l.returnDueAt })),
    );
  });

  /** POST /api/requests/:id/rate-borrower: lender scores the borrower after the return. */
  router.post("/requests/:id/rate-borrower", ...guard, async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) return sendError(res, new RequestError(404, "Request not found."));
    await respond(res, 200, () =>
      rateBorrower(getPool(), authenticatedUserId(res), id, parseScore(req.body, 500, true)!),
    );
  });

  /** GET /api/items/:id/reviews: public reviews for a listing. */
  router.get("/items/:id/reviews", async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) return sendError(res, new RequestError(404, "Listing not found."));
    res.set("Cache-Control", "no-cache");
    res.json(await listReviews(getPool(), id));
  });

  /** POST /api/items/:id/reviews: borrower reviews a listing they've returned. One per listing. */
  router.post("/items/:id/reviews", ...guard, async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) return sendError(res, new RequestError(404, "Listing not found."));
    await respond(res, 201, () =>
      createReview(getPool(), authenticatedUserId(res), id, parseScore(req.body, 1000, true)!),
    );
  });

  /** GET /api/notifications: my latest notifications and unread count. */
  router.get("/notifications", ...guard, async (_req, res) => {
    const userId = authenticatedUserId(res);
    // No scheduler: deadline reminders are caught up whenever notifications are read.
    await reconcileDeadlineReminders(getPool(), userId);
    res.json(await listNotifications(getPool(), userId));
  });

  /** POST /api/notifications/read: mark some ({ ids }) or all ({}) as read. */
  router.post("/notifications/read", ...guard, async (req, res) => {
    const raw: unknown = req.body?.ids;
    const ids = Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string" && /^\d+$/.test(x)) : undefined;
    await markRead(getPool(), authenticatedUserId(res), ids);
    res.json({ ok: true });
  });

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
