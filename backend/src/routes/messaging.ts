import { Router, type RequestHandler } from "express";
import type { Server } from "socket.io";
import { authenticatedUserId } from "../auth.ts";
import { getPool } from "../db.ts";
import {
  getConversation,
  history,
  listConversations,
  MessagingError,
  participant,
  readMessages,
  reportConversation,
  sendMessage,
  setBlock,
  startConversation,
  startDirectConversation,
} from "../messaging/repository.ts";
import { messagingDatabaseFailure } from "../messaging/errors.ts";
import { publish, userRoom } from "../messaging/realtime.ts";

export function createMessagingRouter(protect: RequestHandler[]) {
  const router = Router();
  router.use(...protect, (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  const io = (req: { app: { locals: Record<string, unknown> } }) =>
    req.app.locals.messaging as Server | undefined;
  router.get("/conversations", async (req, res) => {
    res.json(
      await listConversations(
        getPool(),
        authenticatedUserId(res),
        typeof req.query.before === "string" ? req.query.before : undefined,
      ),
    );
  });
  router.post("/conversations", async (req, res) => {
    const userId = authenticatedUserId(res);
    if (req.body?.itemId !== undefined && req.body?.recipientId !== undefined)
      throw new MessagingError(400, "Choose either a listing or a profile.");
    const conversation =
      req.body?.recipientId !== undefined
        ? await startDirectConversation(getPool(), userId, req.body.recipientId)
        : await startConversation(getPool(), userId, req.body?.itemId);
    const c = await participant(getPool(), conversation.id as string, userId);
    publish(io(req), c, "conversation:changed", { conversationId: c.id });
    res.status(201).json(conversation);
  });
  router.get("/conversations/:id", async (req, res) => {
    res.json(await getConversation(getPool(), String(req.params.id), authenticatedUserId(res)));
  });
  router.get("/conversations/:id/messages", async (req, res) => {
    res.json(
      await history(
        getPool(),
        authenticatedUserId(res),
        String(req.params.id),
        typeof req.query.before === "string" ? req.query.before : undefined,
        typeof req.query.after === "string" ? req.query.after : undefined,
      ),
    );
  });
  router.post("/conversations/:id/messages", async (req, res) => {
    const result = await sendMessage(
      getPool(),
      authenticatedUserId(res),
      String(req.params.id),
      req.body,
    );
    publish(io(req), result.conversation, "message", result.message);
    res.status(201).json(result.message);
  });
  router.post("/conversations/:id/read", async (req, res) => {
    const userId = authenticatedUserId(res);
    const id = String(req.params.id);
    const result = await readMessages(getPool(), userId, id, req.body?.throughId);
    if (result.readAt)
      publish(io(req), result.conversation, "messages:read", {
        conversationId: id,
        readerId: userId,
        throughId: req.body.throughId,
        readAt: result.readAt,
      });
    res.json({ ok: true });
  });
  router.post("/conversations/:id/block", async (req, res) => {
    const c = await setBlock(
      getPool(),
      authenticatedUserId(res),
      String(req.params.id),
      req.body?.blocked,
    );
    // A block applies to every listing conversation with this user.
    io(req)
      ?.to([userRoom(c.borrower_id), userRoom(c.lender_id)])
      .emit("conversation:changed", {});
    res.json({ ok: true });
  });
  router.post("/conversations/:id/report", async (req, res) => {
    await reportConversation(
      getPool(),
      authenticatedUserId(res),
      String(req.params.id),
      req.body?.reason,
    );
    res.status(201).json({ ok: true });
  });
  router.use(((error, _req, res, next) => {
    if (error instanceof MessagingError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    const failure = messagingDatabaseFailure(error);
    if (failure) {
      res.status(failure.status).json({ error: failure.error });
      return;
    }
    next(error);
  }) as import("express").ErrorRequestHandler);
  return router;
}
