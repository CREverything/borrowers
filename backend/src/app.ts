import express, { type ErrorRequestHandler } from "express";
import { createRequireUser } from "./auth.ts";
import type { AuthConfig } from "./config.ts";
import { healthRouter } from "./routes/health.ts";
import { itemsRouter } from "./routes/items.ts";
import { createMeRouter } from "./routes/me.ts";

export interface AppOptions {
  auth: AuthConfig | null;
}

export function createApp({ auth }: AppOptions) {
  const app = express();
  // Add this to any route that needs a signed-in user (listing items,
  // borrow and event requests, trades).
  const requireUser = createRequireUser(auth);

  app.disable("x-powered-by");
  app.use(express.json({ limit: "32kb" }));

  app.use("/api/health", healthRouter);
  app.use("/api/items", itemsRouter);
  app.use("/api/me", createMeRouter(requireUser));

  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  // Express 5 forwards rejected promises from async handlers here.
  const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    console.error("[api] Unhandled error:", (error as Error).message);
    if (res.headersSent) return;
    res.status(500).json({ error: "Something went wrong." });
  };
  app.use(errorHandler);

  return app;
}
