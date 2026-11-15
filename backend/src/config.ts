/**
 * Reads server configuration from the environment. Values come from the
 * root .env and then backend/.env (later files win), loaded by
 * `node --env-file-if-exists`, or from the host's environment in production.
 * Nothing here is ever sent to the browser.
 */
export interface AuthConfig {
  secretKey: string;
  publishableKey: string;
  /** Frontend origins allowed to send session tokens (checked against the token's azp claim). */
  authorizedParties: string[];
}

export interface Config {
  databaseUrl: string;
  port: number;
  host: string;
  /** null when Clerk isn't configured; protected endpoints then answer 503. */
  auth: AuthConfig | null;
}

// Vite's dev server and `vite preview`.
const DEFAULT_AUTHORIZED_PARTIES = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
];

/** Names (never values) of the Clerk variables that are missing, for startup logs. */
export function missingAuthVars(env: NodeJS.ProcessEnv = process.env): string[] {
  const missing: string[] = [];
  if (!env.CLERK_SECRET_KEY?.trim()) missing.push("CLERK_SECRET_KEY");
  if (!(env.CLERK_PUBLISHABLE_KEY || env.VITE_CLERK_PUBLISHABLE_KEY)?.trim()) {
    missing.push(
      env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
        ? "VITE_CLERK_PUBLISHABLE_KEY (found NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY; rename it)"
        : "VITE_CLERK_PUBLISHABLE_KEY",
    );
  }
  return missing;
}

export function readAuthConfig(env: NodeJS.ProcessEnv = process.env): AuthConfig | null {
  const secretKey = env.CLERK_SECRET_KEY?.trim();
  // The publishable key is public, so the frontend's VITE_ one in the root .env can be reused.
  const publishableKey = (env.CLERK_PUBLISHABLE_KEY || env.VITE_CLERK_PUBLISHABLE_KEY)?.trim();
  if (!secretKey || !publishableKey) return null;
  if (!secretKey.startsWith("sk_")) throw new Error("CLERK_SECRET_KEY must be a Clerk secret key (sk_...).");
  if (!publishableKey.startsWith("pk_")) {
    throw new Error("CLERK_PUBLISHABLE_KEY must be a Clerk publishable key (pk_...).");
  }

  const parties = env.CLERK_AUTHORIZED_PARTIES?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  return {
    secretKey,
    publishableKey,
    authorizedParties: parties?.length ? parties : DEFAULT_AUTHORIZED_PARTIES,
  };
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const databaseUrl = env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL is not set. Add your TigerData connection string to the root .env or backend/.env.",
    );
  }

  const port = Number(env.PORT ?? 3001);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error("PORT must be a positive integer.");
  }

  return {
    databaseUrl,
    port,
    // Local-only by default. Set HOST=0.0.0.0 when deploying behind a proxy.
    host: env.HOST?.trim() || "127.0.0.1",
    auth: readAuthConfig(env),
  };
}
