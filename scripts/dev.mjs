import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const backend = fileURLToPath(new URL("../backend/", import.meta.url));

if (!existsSync(new URL("../backend/node_modules/express/package.json", import.meta.url))) {
  console.error("[dev] Backend dependencies are missing. Run npm --prefix backend ci first.");
  process.exit(1);
}

const children = new Set();
let stopping = false;

function stop(code) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) child.kill("SIGTERM");
}

function start(name, cwd, args) {
  const child = spawn(process.execPath, args, {
    cwd,
    stdio: "inherit",
  });
  children.add(child);
  child.on("error", (error) => {
    console.error(`[dev] Could not start ${name}: ${error.message}`);
    stop(1);
  });
  child.on("exit", (code, signal) => {
    children.delete(child);
    if (!stopping) {
      console.error(`[dev] ${name} stopped (${signal ?? code}). Stopping development servers.`);
      stop(code || 1);
    }
  });
}

process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));

start("API", backend, [
  "--env-file-if-exists=../.env",
  "--env-file-if-exists=.env",
  "--disable-warning=ExperimentalWarning",
  "--watch",
  "src/index.ts",
]);
start("frontend", root, [fileURLToPath(new URL("../node_modules/vite/bin/vite.js", import.meta.url))]);
