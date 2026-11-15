import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";
import { createPlanEventHandler } from "./server/planEvent";

const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";
const DEFAULT_BACKEND_URL = "http://127.0.0.1:3001";

/** Serves the event planning API from the dev and preview servers. */
function borrowersApi(apiKey: string | undefined, model: string): Plugin {
  const planEvent = createPlanEventHandler({ apiKey, model });
  return {
    name: "borrowers-api",
    configureServer(server) {
      server.middlewares.use("/api/plan-event", planEvent);
    },
    configurePreviewServer(server) {
      server.middlewares.use("/api/plan-event", planEvent);
    },
  };
}

export default defineConfig(({ mode }) => {
  // An empty prefix loads every variable from .env files into this Node
  // process only. Vite exposes just VITE_-prefixed variables to browser code,
  // so GOOGLE_API_KEY stays on the server.
  const env = loadEnv(mode, process.cwd(), "");
  // VITE_ variables are bundled into browser code. Refuse to start or build
  // if a Clerk secret key (sk_...) has been put in one by mistake.
  const leaked = Object.keys(env).filter(
    (name) => name.startsWith("VITE_") && /^sk_(test|live)_/.test(env[name].trim()),
  );
  if (leaked.length > 0) {
    throw new Error(
      `[borrowers] ${leaked.join(", ")} contains a Clerk secret key. Only the publishable key (pk_...) may use a VITE_ name. Move the secret to CLERK_SECRET_KEY and rotate it in the Clerk dashboard.`,
    );
  }
  if (!env.VITE_CLERK_PUBLISHABLE_KEY) {
    console.warn(
      env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
        ? "[borrowers] Found NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, but Vite apps need VITE_CLERK_PUBLISHABLE_KEY. Rename it in .env. Login will be turned off."
        : "[borrowers] VITE_CLERK_PUBLISHABLE_KEY is not set. Login will be turned off.",
    );
  }
  if (!env.GOOGLE_API_KEY) {
    console.warn("[borrowers] GOOGLE_API_KEY is not set. Event planning will use built-in templates.");
  }

  // Everything else under /api goes to the Express backend in backend/.
  // Plugin middleware runs before Vite's proxy, so /api/plan-event is still
  // handled above.
  const proxy = {
    "/api/messaging/socket.io": { target: env.BACKEND_URL || DEFAULT_BACKEND_URL, changeOrigin: true, ws: true },
    "/api": { target: env.BACKEND_URL || DEFAULT_BACKEND_URL, changeOrigin: true },
  };

  return {
    plugins: [react(), borrowersApi(env.GOOGLE_API_KEY, env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL)],
    server: { proxy },
    preview: { proxy },
  };
});
