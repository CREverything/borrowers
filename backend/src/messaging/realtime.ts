import { createClerkClient } from "@clerk/express";
import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import type { AuthConfig } from "../config.ts";
import { getPool } from "../db.ts";
import { createProfileFetcher } from "../auth.ts";
import { ensureUserProfile } from "../users/profiles.ts";
import { isBlocked, otherUser, participant, type Participant } from "./repository.ts";

export type VerifySocket = (token: string) => Promise<{ userId: string; expiresAt: number }>;
export function socketVerifier(auth: AuthConfig | null): VerifySocket {
  const clerk = auth
    ? createClerkClient({ secretKey: auth.secretKey, publishableKey: auth.publishableKey })
    : null;
  return async (token) => {
    if (!clerk || !auth) throw new Error("Login isn't configured.");
    const state = await clerk.authenticateRequest(
      new Request(`${auth.authorizedParties[0]}/api/messaging`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
      { authorizedParties: auth.authorizedParties },
    );
    const session = state.toAuth();
    if (!session?.userId || !session.sessionClaims?.exp) throw new Error("Log in required.");
    return { userId: session.userId, expiresAt: session.sessionClaims.exp * 1000 };
  };
}
export const userRoom = (id: string) => `messaging:user:${id}`;
export function publish(io: Server | undefined, c: Participant, event: string, payload: unknown) {
  io?.to([userRoom(c.borrower_id), userRoom(c.lender_id)]).emit(event, payload);
}
export function attachMessaging(
  server: HttpServer,
  auth: AuthConfig | null,
  verify: VerifySocket = socketVerifier(auth),
) {
  const io = new Server(server, {
    path: "/api/messaging/socket.io",
    maxHttpBufferSize: 16_384,
    cors: { origin: auth?.authorizedParties ?? [], methods: ["GET", "POST"] },
    allowRequest: (req, done) =>
      done(null, !req.headers.origin || !!auth?.authorizedParties.includes(req.headers.origin)),
  });
  const fetchProfile = createProfileFetcher(auth);
  io.use(async (socket, next) => {
    try {
      const token: unknown = socket.handshake.auth?.token;
      if (typeof token !== "string" || token.length > 16_000) throw new Error("Log in required.");
      const session = await verify(token);
      if (session.expiresAt <= Date.now()) throw new Error("Session expired.");
      await ensureUserProfile(getPool(), session.userId, fetchProfile);
      socket.data.userId = session.userId;
      socket.data.expiresAt = session.expiresAt;
      // Credentials are needed only for verification; don't retain them in the handshake.
      delete socket.handshake.auth.token;
      next();
    } catch {
      next(new Error("Messaging authentication failed. Please sign in again."));
    }
  });
  io.on("connection", (socket) => {
    const userId: string = socket.data.userId;
    void socket.join(userRoom(userId));
    // Reconnect with a fresh Clerk token; a long-lived connection must not outlive authentication.
    const expiry = setTimeout(
      () => {
        socket.emit("session:refresh");
        socket.disconnect(true);
      },
      Math.min(2_147_483_647, socket.data.expiresAt - Date.now()),
    );
    socket.on("disconnect", () => clearTimeout(expiry));
    let lastTyping = 0;
    socket.on("typing", async (input: unknown) => {
      if (Date.now() - lastTyping < 900 || Date.now() >= socket.data.expiresAt) return;
      lastTyping = Date.now();
      const data = input as { conversationId?: unknown; typing?: unknown } | null;
      if (typeof data?.conversationId !== "string" || typeof data.typing !== "boolean") return;
      try {
        const c = await participant(getPool(), data.conversationId, userId);
        if (await isBlocked(getPool(), c.borrower_id, c.lender_id)) return;
        io.to(userRoom(otherUser(c, userId))).emit("typing", {
          conversationId: c.id,
          userId,
          typing: data.typing,
        });
      } catch {
        /* Invalid/unauthorized typing events are discarded. */
      }
    });
  });
  return io;
}
