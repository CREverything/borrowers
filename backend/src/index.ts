import { attachMessaging } from "./messaging/realtime.ts";
import { createApp } from "./app.ts";
import { missingAuthVars, readConfig } from "./config.ts";
import { closePool, createPool, pingDatabase } from "./db.ts";

const config = readConfig();
createPool(config.databaseUrl);

const app = createApp({ auth: config.auth });
const server = app.listen(config.port, config.host, () => {
  console.log(`[api] Listening on http://${config.host}:${config.port}`);
  console.log(
    config.auth
      ? `[auth] Clerk token verification on (origins: ${config.auth.authorizedParties.join(", ")})`
      : `[auth] Missing ${missingAuthVars().join(" and ")}. Protected endpoints will answer 503.`,
  );
});

const messaging = attachMessaging(server, config.auth);
app.locals.messaging = messaging;

// Report the database state at startup without blocking the server.
pingDatabase()
  .then(({ latencyMs }) => console.log(`[db] Connected to TigerData (${latencyMs} ms)`))
  .catch((error: Error) => console.error("[db] Could not reach TigerData:", error.message));

function shutdown(signal: string) {
  console.log(`[api] ${signal} received, shutting down`);
  messaging.disconnectSockets(true);
  void messaging.close(() => {
    closePool().finally(() => process.exit(0));
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
