/** Run the integration suite in its own disposable schema using the existing loader/connection. */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readConfig } from "../config.ts";

try {
  const databaseUrl = readConfig().databaseUrl;
  console.log("Running messaging tests in a randomly named isolated schema; existing application tables are not used.");
  const child = spawn(process.execPath, ["--test", fileURLToPath(new URL("../messaging/integration.test.ts", import.meta.url))], {
    stdio: "inherit",
    // Never pass credentials on the command line or print this environment.
    env: { ...process.env, TEST_DATABASE_URL: databaseUrl },
  });
  child.on("error", () => { console.error("Could not start messaging integration tests."); process.exitCode = 1; });
  child.on("exit", code => { process.exitCode = code ?? 1; });
} catch {
  console.error("Could not load the existing database configuration for messaging tests.");
  process.exitCode = 1;
}
