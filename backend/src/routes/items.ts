import { Router } from "express";
import { getPool } from "../db.ts";
import { listItems } from "../items/repository.ts";

export const itemsRouter = Router();

/** GET /api/items: every listing, ordered by id. */
itemsRouter.get("/", async (_req, res) => {
  const items = await listItems(getPool());
  // Listings change rarely; let browsers reuse a response for a short time.
  res.set("Cache-Control", "public, max-age=30");
  res.json(items);
});
