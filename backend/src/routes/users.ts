import { Router } from "express";
import { getPool } from "../db.ts";
import { getPublicProfile } from "../users/publicProfile.ts";

/** GET /api/users/:id: an account's public profile. No login needed. */
export const usersRouter = Router();

usersRouter.get("/:id", async (req, res) => {
  const id = req.params.id;
  // Clerk ids ("user_...") and demo ids ("u-maya"); anything else can't exist.
  if (typeof id !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) {
    res.status(404).json({ error: "Profile not found." });
    return;
  }
  const profile = await getPublicProfile(getPool(), id);
  if (!profile) {
    res.status(404).json({ error: "Profile not found." });
    return;
  }
  res.set("Cache-Control", "no-cache");
  res.json(profile);
});
