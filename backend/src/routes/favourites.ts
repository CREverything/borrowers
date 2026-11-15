import { Router, type RequestHandler } from "express";
import { authenticatedUserId } from "../auth.ts";
import { getPool } from "../db.ts";
import { listFavouriteItems } from "../items/repository.ts";

/**
 * The logged-in user's favourites. Always for the verified session user;
 * saving is idempotent, so a double click can't create duplicates.
 */
export function createFavouritesRouter(protect: RequestHandler[]) {
  const router = Router();
  const noStore: RequestHandler = (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  };

  /** GET /api/favourites: saved listings that are still available. */
  router.get("/", ...protect, noStore, async (_req, res) => {
    res.json(await listFavouriteItems(getPool(), authenticatedUserId(res)));
  });

  /** PUT /api/favourites/:itemId: save a listing. */
  router.put("/:itemId", ...protect, noStore, async (req, res) => {
    const itemId = parseItemId(req.params.itemId);
    if (itemId === null) return void res.status(404).json({ error: "Listing not found." });
    const result = await getPool().query(
      `insert into favourites (user_id, item_id)
       select $1, id from items where id = $2 and status = 'active'
       on conflict do nothing`,
      [authenticatedUserId(res), itemId],
    );
    if (result.rowCount === 0) {
      const exists = await getPool().query("select 1 from items where id = $1 and status = 'active'", [itemId]);
      if (!exists.rowCount) return void res.status(404).json({ error: "That listing isn't available." });
    }
    res.json({ ok: true });
  });

  /** DELETE /api/favourites/:itemId: unsave a listing. */
  router.delete("/:itemId", ...protect, noStore, async (req, res) => {
    const itemId = parseItemId(req.params.itemId);
    if (itemId === null) return void res.status(404).json({ error: "Listing not found." });
    await getPool().query("delete from favourites where user_id = $1 and item_id = $2", [
      authenticatedUserId(res),
      itemId,
    ]);
    res.json({ ok: true });
  });

  return router;
}

function parseItemId(raw: unknown): number | null {
  const id = typeof raw === "string" ? Number(raw) : NaN;
  return Number.isInteger(id) && id > 0 && id <= 2_147_483_647 ? id : null;
}
