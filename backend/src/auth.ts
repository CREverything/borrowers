import { clerkMiddleware, getAuth } from "@clerk/express";
import type { RequestHandler, Response } from "express";
import type { AuthConfig } from "./config.ts";

/**
 * Middleware chain for protected endpoints. Clerk verifies the session token
 * (from the Authorization: Bearer header, or Clerk's session cookie): its
 * signature, expiry, and that it was issued to one of our frontend origins.
 * Only then is the user ID from the token stored for the route handler.
 *
 * Never read a user ID from the request body, query or custom headers.
 * Use authenticatedUserId(res) instead.
 */
export function createRequireUser(auth: AuthConfig | null): RequestHandler[] {
  if (!auth) {
    return [
      (_req, res) => {
        res.status(503).json({ error: "Sign-in isn't configured on the server." });
      },
    ];
  }

  const verify = clerkMiddleware({
    secretKey: auth.secretKey,
    publishableKey: auth.publishableKey,
    authorizedParties: auth.authorizedParties,
  });

  const requireSignedIn: RequestHandler = (req, res, next) => {
    const { userId } = getAuth(req);
    if (!userId) {
      res.status(401).json({ error: "Sign in required." });
      return;
    }
    res.locals.userId = userId;
    next();
  };

  return [verify, requireSignedIn];
}

/** The verified Clerk user ID. Only valid after createRequireUser() has run. */
export function authenticatedUserId(res: Response): string {
  const userId: unknown = res.locals.userId;
  if (typeof userId !== "string") throw new Error("Route is missing the requireUser middleware.");
  return userId;
}
