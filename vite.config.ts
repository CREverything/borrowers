import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";
import { createPlanEventHandler } from "./server/planEvent";

const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";

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
  if (!env.GOOGLE_API_KEY) {
    console.warn("[borrowers] GOOGLE_API_KEY is not set. Event planning will use built-in templates.");
  }

  return {
    plugins: [react(), borrowersApi(env.GOOGLE_API_KEY, env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL)],
  };
});
