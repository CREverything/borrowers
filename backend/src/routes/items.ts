import { Router, type RequestHandler, type Response } from "express";
import { authenticatedUserId } from "../auth.ts";
import { getPool } from "../db.ts";
import {
  createItem,
  listActiveItems,
  listItemsByLender,
  removeOwnItem,
  updateOwnItem,
  type OwnedResult,
} from "../items/repository.ts";
import { parseListingPatch, parseNewListing } from "../items/validation.ts";

/**
 * `protect` verifies the Clerk session and makes sure the user has a profile.
 * Every write uses authenticatedUserId(res) as the owner; any lender id in
 * the request body is ignored.
 */
export function createItemsRouter(protect: RequestHandler[]) {
  const router = Router();

  /** GET /api/items: public marketplace, active listings only. */
  router.get("/", async (_req, res) => {
    const items = await listActiveItems(getPool());
    // Revalidate every time, so new and edited listings show on refresh.
    res.set("Cache-Control", "no-cache");
    res.json(items);
  });

  /** POST /api/items: create a listing owned by the logged-in user. */
  router.post("/", ...protect, async (req, res) => {
    const parsed = parseNewListing(req.body);
    if (!parsed.ok) {
      res.status(400).json({ error: "Please fix the highlighted fields.", fields: parsed.errors });
      return;
    }
    const item = await createItem(getPool(), authenticatedUserId(res), parsed.value);
    res.status(201).json(item);
  });

  /** PATCH /api/items/:id: edit your own listing. */
  router.patch("/:id", ...protect, async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) return notFound(res);
    const parsed = parseListingPatch(req.body);
    if (!parsed.ok) {
      res.status(400).json({ error: "Please fix the highlighted fields.", fields: parsed.errors });
      return;
    }
    sendOwned(res, await updateOwnItem(getPool(), authenticatedUserId(res), id, parsed.value));
  });

  /** DELETE /api/items/:id: remove your own listing (soft delete). */
  router.delete("/:id", ...protect, async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) return notFound(res);
    sendOwned(res, await removeOwnItem(getPool(), authenticatedUserId(res), id));
  });

  return router;
}

/** GET /api/my-items: the logged-in user's listings, including hidden ones. */
export function createMyItemsRouter(protect: RequestHandler[]) {
  const router = Router();
  router.get("/", ...protect, async (_req, res) => {
    res.set("Cache-Control", "no-store");
    res.json(await listItemsByLender(getPool(), authenticatedUserId(res)));
  });
  return router;
}

function parseId(raw: unknown): number | null {
  const id = typeof raw === "string" ? Number(raw) : NaN;
  return Number.isInteger(id) && id > 0 && id <= 2_147_483_647 ? id : null;
}

function notFound(res: Response) {
  res.status(404).json({ error: "Listing not found." });
}

function sendOwned(res: Response, result: OwnedResult) {
  if (result.ok) {
    res.json(result.item);
  } else if (result.reason === "forbidden") {
    res.status(403).json({ error: "You can only change your own listings." });
  } else {
    notFound(res);
  }
}
