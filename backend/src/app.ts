import express, { type ErrorRequestHandler, type RequestHandler } from "express";
import { authenticatedUserId, createProfileFetcher, createRequireUser } from "./auth.ts";
import type { AuthConfig } from "./config.ts";
import { getPool } from "./db.ts";
import { healthRouter } from "./routes/health.ts";
import { createItemsRouter, createMyItemsRouter } from "./routes/items.ts";
import { createMeRouter } from "./routes/me.ts";
import { createRequestsRouter } from "./routes/requests.ts";
import { ensureUserProfile, type FetchProfile } from "./users/profiles.ts";

export interface AppOptions {
  auth: AuthConfig | null;
  /**
   * Test-only overrides. Production passes neither, so requests are verified
   * by Clerk and profiles come from Clerk's API.
   */
  requireUser?: RequestHandler[];
  fetchProfile?: FetchProfile;
}

export function createApp({ auth, requireUser: requireUserOverride, fetchProfile }: AppOptions) {
  const app = express();
  // Add this to any route that needs a logged-in user.
  const requireUser = requireUserOverride ?? createRequireUser(auth);
  const loadProfile = fetchProfile ?? createProfileFetcher(auth);

  // Creates the user's TigerData profile on their first authenticated request.
  const ensureProfile: RequestHandler = async (_req, res, next) => {
    await ensureUserProfile(getPool(), authenticatedUserId(res), loadProfile);
    next();
  };
  // For routes that read or write the user's own data.
  const protect = [...requireUser, ensureProfile];

  app.disable("x-powered-by");
  app.use(express.json({ limit: "32kb" }));

  app.use("/api/health", healthRouter);
  app.use("/api/items", createItemsRouter(protect));
  app.use("/api/my-items", createMyItemsRouter(protect));
  app.use("/api/me", createMeRouter(protect));
  app.use("/api", createRequestsRouter(protect));

  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  // Express 5 forwards rejected promises from async handlers here.
  const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    if (res.headersSent) return;
    const status = (error as { status?: number }).status;
    // Malformed JSON and oversized bodies from express.json().
    if (typeof status === "number" && status >= 400 && status < 500) {
      res.status(status).json({ error: "The request couldn't be read." });
      return;
    }
    // A database check constraint caught invalid data validation missed.
    const code = (error as { code?: string }).code;
    if (code === "23514" || code === "22001" || code === "22P02") {
      res.status(400).json({ error: "Some of the listing details aren't valid." });
      return;
    }
    console.error("[api] Unhandled error:", (error as Error).message);
    res.status(500).json({ error: "Something went wrong." });
  };
  app.use(errorHandler);

  return app;
}
