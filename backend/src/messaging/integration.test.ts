import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { once } from "node:events";
import test from "node:test";
import pg from "pg";
import { io as client, type Socket } from "socket.io-client";
import { createApp } from "../app.ts";
import { closePool, createPool } from "../db.ts";
import { ensureUserProfile } from "../users/profiles.ts";
import { attachMessaging } from "./realtime.ts";

// Never loads .env or DATABASE_URL. Each run creates its own schema in an explicitly supplied test DB.
test(
  "messaging HTTP, PostgreSQL and Socket.IO integration",
  { skip: !process.env.TEST_DATABASE_URL },
  async (t) => {
    const schema = `messaging_test_${randomUUID().replaceAll("-", "")}`;
    const admin = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
    await admin.query(`create schema ${schema}`);
    const url = new URL(process.env.TEST_DATABASE_URL!);
    url.searchParams.set("options", `-c search_path=${schema}`);
    const pool = createPool(url.toString());
    const sockets: Socket[] = [];
    const app = createApp({
      auth: null,
      fetchProfile: async (id) => ({ displayName: `${id} Student`, avatarUrl: null }),
      requireUser: [
        (req, res, next) => {
          const token = req.headers.authorization?.replace("Bearer ", "");
          if (!token || !["borrower", "lender", "stranger"].includes(token)) {
            res.status(401).json({ error: "Log in required." });
            return;
          }
          res.locals.userId = token;
          next();
        },
      ],
    });
    const server = createServer(app);
    const io = attachMessaging(
      server,
      {
        secretKey: "sk_test_unused",
        publishableKey: "pk_test_dGVzdC5jbGVyay5hY2NvdW50cy5kZXYk",
        authorizedParties: ["http://localhost"],
      },
      async (token) => {
        if (token === "short-lived") return { userId: "borrower", expiresAt: Date.now() + 150 };
        if (!["borrower", "lender", "stranger"].includes(token)) throw new Error("Invalid token");
        return { userId: token, expiresAt: Date.now() + 120_000 };
      },
    );
    app.locals.messaging = io;
    const profile = async (id: string) => ({ displayName: `${id} Student`, avatarUrl: null });
    try {
      for (let i = 0; i < 2; i++) {
        await pool.query(await readFile(new URL("../../db/schema.sql", import.meta.url), "utf8"));
        await pool.query(
          await readFile(new URL("../../db/messaging.sql", import.meta.url), "utf8"),
        );
        await pool.query(
          await readFile(new URL("../../db/direct-messaging.sql", import.meta.url), "utf8"),
        );
      }
      for (const id of ["borrower", "lender", "stranger"])
        await ensureUserProfile(pool, id, profile);
      const items =
        await pool.query(`insert into items(title,category,condition,lender_id,location,switchies_per_day,icon_key,max_borrow_days)
      values ('Calculus book','textbooks','Good','lender','Campus',1,'book',14),('Headphones','tech','Good','lender','Campus',1,'headphones',14) returning id`);
      const [book, headphones] = items.rows.map((r) => r.id as number);
      server.listen(0, "127.0.0.1");
      await once(server, "listening");
      const address = server.address();
      assert(address && typeof address !== "string");
      const base = `http://127.0.0.1:${address.port}`;
      async function request(user: string, path: string, body?: unknown, expected = 200) {
        const response = await fetch(`${base}/api${path}`, {
          method: body === undefined ? "GET" : "POST",
          headers: { Authorization: `Bearer ${user}`, "Content-Type": "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        const data: any = await response.json();
        assert.equal(response.status, expected, JSON.stringify(data));
        return data;
      }
      const api = (user: string, path: string, body?: unknown, status = 200) =>
        request(user, `/messaging${path}`, body, status);
      async function connect(user: string) {
        const socket = client(base, {
          path: "/api/messaging/socket.io",
          auth: { token: user },
          transports: ["websocket"],
          autoConnect: false,
        });
        sockets.push(socket);
        const ready = event(socket, "connect");
        socket.connect();
        await ready;
        return socket;
      }
      const b = await connect("borrower"),
        l = await connect("lender"),
        stranger = await connect("stranger");
      function event(socket: Socket, name: string): Promise<any[]> {
        return new Promise((resolve, reject) => {
          const done = (...args: unknown[]) => {
            clearTimeout(timer);
            resolve(args);
          };
          const timer = setTimeout(() => {
            socket.off(name, done);
            reject(new Error(`Timed out waiting for ${name}`));
          }, 4000);
          socket.once(name, done);
        });
      }
      let conversation = "";
      let second = "";
      let firstMessage = "";
      let directConversation = "";
      await t.test(
        "authenticated starts, self-message rejection and no duplicate conversations",
        async () => {
          await api("", "/conversations", undefined, 401);
          await api("lender", "/conversations", { itemId: book }, 400);
          const [a, d] = await Promise.all([
            api("borrower", "/conversations", { itemId: book }, 201),
            api("borrower", "/conversations", { itemId: book }, 201),
          ]);
          assert.equal(a.id, d.id);
          assert.equal(a.item.title, "Calculus book");
          assert(!("location" in a.item));
          conversation = a.id;
          second = (await api("borrower", "/conversations", { itemId: headphones }, 201)).id;
          assert.notEqual(conversation, second);
        },
      );
      await t.test(
        "profile messaging creates one direct thread per pair and preserves listing threads",
        async () => {
          await api("", "/conversations", { recipientId: "lender" }, 401);
          await api("borrower", "/conversations", { recipientId: "borrower" }, 400);
          await api("borrower", "/conversations", { recipientId: "missing" }, 404);
          await api("borrower", "/conversations", { recipientId: "lender", itemId: book }, 400);
          const [a, reversed] = await Promise.all([
            api("borrower", "/conversations", { recipientId: "lender" }, 201),
            api("lender", "/conversations", { recipientId: "borrower" }, 201),
          ]);
          assert.equal(a.id, reversed.id);
          assert.equal(a.isDirect, true);
          assert.equal(a.itemId, null);
          assert.notEqual(a.id, conversation);
          directConversation = a.id;
          assert.equal((await api("borrower", `/conversations/${conversation}`)).isDirect, false);
          const received = event(l, "message");
          const message = await api(
            "borrower",
            `/conversations/${a.id}/messages`,
            { content: "Hello from your profile", clientNonce: randomUUID() },
            201,
          );
          assert.equal((await received)[0].conversationId, a.id);
          await api("lender", `/conversations/${a.id}/read`, { throughId: message.id });
          const replied = event(b, "message");
          const reply = await api(
            "lender",
            `/conversations/${a.id}/messages`,
            { content: "Hello back", clientNonce: randomUUID() },
            201,
          );
          assert.equal((await replied)[0].id, reply.id);
          await api("borrower", `/conversations/${a.id}/read`, { throughId: reply.id });
          await api("stranger", `/conversations/${a.id}/messages`, undefined, 404);
        },
      );
      await t.test(
        "private rooms, real-time delivery both ways, idempotency, persistence and unread counts",
        async () => {
          let leaked = false;
          stranger.on("message", () => {
            leaked = true;
          });
          const received = event(l, "message");
          const nonce = randomUUID();
          const message = await api(
            "borrower",
            `/conversations/${conversation}/messages`,
            {
              content: "Is it available? <script>alert(1)</script>",
              clientNonce: nonce,
              senderId: "stranger",
            },
            201,
          );
          const [delivered] = await received;
          assert.equal(delivered.id, message.id);
          assert.equal(delivered.senderId, "borrower");
          firstMessage = message.id;
          const retried = await api(
            "borrower",
            `/conversations/${conversation}/messages`,
            { content: message.content, clientNonce: nonce },
            201,
          );
          assert.equal(message.id, retried.id);
          assert.equal((await api("lender", "/conversations")).unreadCount, 1);
          assert.equal(
            (await api("lender", `/conversations/${conversation}/messages`)).messages.length,
            1,
          );
          assert.equal(
            (await api("borrower", "/conversations", { itemId: book }, 201)).id,
            conversation,
          );
          const reply = event(b, "message");
          await api(
            "lender",
            `/conversations/${conversation}/messages`,
            { content: "Yes!", clientNonce: randomUUID() },
            201,
          );
          assert.equal((await reply)[0].content, "Yes!");
          assert.equal(leaked, false);
        },
      );
      await t.test(
        "message notifications are private, persistent and deduplicated on retry",
        async () => {
          const lenderUpdates = await request("lender", "/notifications");
          const listingUpdates = lenderUpdates.notifications.filter(
            (n: any) => n.kind === "message_received" && n.data.conversationId === conversation,
          );
          assert.equal(listingUpdates.length, 1);
          assert.equal(listingUpdates[0].data.messageId, firstMessage);
          assert.equal(listingUpdates[0].data.senderName, "borrower S.");
          assert.equal(listingUpdates[0].data.itemTitle, "Calculus book");
          assert.equal(listingUpdates[0].read, false);
          assert.equal(listingUpdates[0].requestId, null);
          const direct = lenderUpdates.notifications.find(
            (n: any) => n.data.conversationId === directConversation,
          );
          assert(direct);
          assert.equal(direct.itemId, null);
          assert.equal(direct.data.itemTitle, null);
          assert.equal((await request("stranger", "/notifications")).notifications.length, 0);
          const borrowerUpdates = await request("borrower", "/notifications");
          assert.equal(
            borrowerUpdates.notifications.filter((n: any) => n.data.conversationId === conversation)
              .length,
            1,
          );
          // Reading the bell's notification list must not mark chat messages seen.
          await request("borrower", "/notifications/read", {});
          const history = await api("borrower", `/conversations/${conversation}/messages`);
          assert.equal(history.messages.find((m: any) => m.senderId === "lender").readAt, null);
        },
      );
      await t.test(
        "read receipts acknowledge only viewed messages and sync both users",
        async () => {
          const read = event(b, "messages:read");
          await api("lender", `/conversations/${conversation}/read`, { throughId: firstMessage });
          assert.equal((await read)[0].readerId, "lender");
          const messages = (await api("lender", `/conversations/${conversation}/messages`))
            .messages;
          assert(messages[0].readAt);
          assert.equal(messages[1].readAt, null);
          assert.equal((await api("lender", "/conversations")).unreadCount, 0);
          const notifications = await request("lender", "/notifications");
          assert.equal(
            notifications.notifications.find((n: any) => n.data.messageId === firstMessage).read,
            true,
          );
          const newer = await api(
            "borrower",
            `/conversations/${conversation}/messages`,
            { content: "Thanks", clientNonce: randomUUID() },
            201,
          );
          await api("lender", `/conversations/${conversation}/read`, { throughId: firstMessage });
          assert.equal((await api("lender", "/conversations")).unreadCount, 1);
          const alerts = await request("lender", "/notifications");
          assert.equal(
            alerts.notifications.find((n: any) => n.data.messageId === newer.id).read,
            false,
          );
          assert.equal(
            (await api("lender", `/conversations/${conversation}/messages`)).messages.find(
              (m: { id: string }) => m.id === newer.id,
            ).readAt,
            null,
          );
        },
      );
      await t.test(
        "typing is authorized, temporary and delivered to the other participant",
        async () => {
          const typed = event(l, "typing");
          b.emit("typing", { conversationId: conversation, typing: true });
          const [data] = await typed;
          assert.equal(data.userId, "borrower");
          assert.equal(data.typing, true);
          let leaked = false;
          l.once("typing", () => {
            leaked = true;
          });
          stranger.emit("typing", { conversationId: conversation, typing: true });
          await new Promise((r) => setTimeout(r, 100));
          assert.equal(leaked, false);
        },
      );
      await t.test(
        "unauthorized history, send, read, block and report requests are rejected",
        async () => {
          for (const suffix of ["", "/messages"])
            await api("stranger", `/conversations/${conversation}${suffix}`, undefined, 404);
          for (const [suffix, body] of [
            ["messages", { content: "attack", clientNonce: randomUUID() }],
            ["read", { throughId: firstMessage }],
            ["block", { blocked: true }],
            ["report", { reason: "attack" }],
          ] as const)
            await api("stranger", `/conversations/${conversation}/${suffix}`, body, 404);
          await api(
            "borrower",
            `/conversations/${conversation}/messages`,
            { content: "   ", clientNonce: randomUUID() },
            400,
          );
          await api(
            "borrower",
            `/conversations/${conversation}/messages`,
            { content: "x".repeat(4001), clientNonce: randomUUID() },
            400,
          );
          await api(
            "borrower",
            `/conversations/${conversation}/read`,
            { throughId: "9223372036854775808" },
            400,
          );
        },
      );
      await t.test(
        "block applies across listings, unblock is owned, reports persist privately",
        async () => {
          await api("borrower", `/conversations/${conversation}/block`, { blocked: true });
          for (const id of [conversation, second, directConversation]) {
            await api(
              "lender",
              `/conversations/${id}/messages`,
              { content: "Blocked", clientNonce: randomUUID() },
              403,
            );
            await api(
              "borrower",
              `/conversations/${id}/messages`,
              { content: "Blocked", clientNonce: randomUUID() },
              403,
            );
          }
          await api("lender", `/conversations/${conversation}/block`, { blocked: false });
          assert.equal((await api("lender", `/conversations/${conversation}`)).blocked, true);
          await api(
            "borrower",
            `/conversations/${conversation}/report`,
            { reason: "Unwanted messages" },
            201,
          );
          assert.equal(
            (await pool.query("select count(*)::int as n from conversation_reports")).rows[0].n,
            1,
          );
          await api("borrower", `/conversations/${conversation}/block`, { blocked: false });
          assert.equal((await api("borrower", `/conversations/${second}`)).blocked, false);
        },
      );
      await t.test(
        "reconnect recovers messages sent while offline and pagination is complete",
        async () => {
          l.disconnect();
          await api(
            "borrower",
            `/conversations/${conversation}/messages`,
            { content: "While offline", clientNonce: randomUUID() },
            201,
          );
          const ready = event(l, "connect");
          l.connect();
          await ready;
          assert(
            (await api("lender", `/conversations/${conversation}/messages`)).messages.some(
              (m: { content: string }) => m.content === "While offline",
            ),
          );
          for (let i = 0; i < 85; i++)
            await pool.query(
              "insert into messages(conversation_id,sender_id,client_nonce,content) values($1,$2,$3,$4)",
              [second, "borrower", randomUUID(), `History ${i}`],
            );
          let before = "";
          const ids: string[] = [];
          for (let page = 0; page < 4; page++) {
            const result = await api(
              "lender",
              `/conversations/${second}/messages${before ? `?before=${before}` : ""}`,
            );
            ids.push(...result.messages.map((m: { id: string }) => m.id));
            if (!result.hasMore) break;
            before = result.messages[0].id;
          }
          assert.equal(ids.length, 85);
          assert.equal(new Set(ids).size, 85);
          const sorted = [...ids].sort((a, b) => (BigInt(a) < BigInt(b) ? -1 : 1));
          let after = sorted[0];
          const recovered: string[] = [];
          for (let page = 0; page < 4; page++) {
            const result = await api("lender", `/conversations/${second}/messages?after=${after}`);
            recovered.push(...result.messages.map((m: { id: string }) => m.id));
            if (!result.hasMore) break;
            after = result.messages[result.messages.length - 1].id;
          }
          assert.deepEqual(recovered, sorted.slice(1));
        },
      );
      await t.test("database-backed send rate limiting applies across connections", async () => {
        await api(
          "borrower",
          `/conversations/${conversation}/messages`,
          { content: "Too fast", clientNonce: randomUUID() },
          429,
        );
      });
      await t.test(
        "messaging never changes Switchies; existing borrow/approve/return still works",
        async () => {
          const before = await pool.query(
            "select clerk_id,switchies_balance from users order by clerk_id",
          );
          assert(before.rows.every((r) => r.switchies_balance === 5));
          const date = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
          const borrow = await request(
            "borrower",
            "/requests",
            { itemId: book, startDate: date, endDate: date },
            201,
          );
          const approved = await request("lender", `/requests/${borrow.id}/approve`, {
            returnDueAt: `${date}T18:00:00.000Z`,
          });
          assert.equal(approved.status, "approved");
          const balances = await pool.query(
            "select clerk_id,switchies_balance from users where clerk_id in ($1,$2) order by clerk_id",
            ["borrower", "lender"],
          );
          assert.deepEqual(
            balances.rows.map((r) => r.switchies_balance),
            [4, 6],
          );
          assert.equal(
            (await request("lender", `/requests/${borrow.id}/returned`, {})).status,
            "returned",
          );
        },
      );
      await t.test("unavailable listings preserve history and item previews", async () => {
        await pool.query("update items set status='removed' where id=$1", [book]);
        assert.equal(
          (await api("borrower", `/conversations/${conversation}`)).itemUnavailable,
          true,
        );
        assert(
          (await api("lender", `/conversations/${conversation}/messages`)).messages.length > 0,
        );
        await pool.query("delete from messages where conversation_id=$1", [second]); // test data only, permits hard-delete fixture
        await pool.query("delete from items where id=$1", [headphones]);
        const preserved = await api("borrower", `/conversations/${second}`);
        assert.equal(preserved.itemId, null);
        assert.equal(preserved.item.title, "Headphones");
        assert.equal(preserved.itemUnavailable, true);
      });
      await t.test("inbox cursor keeps timestamp precision across multiple pages", async () => {
        const extra =
          await pool.query(`insert into items(title,category,condition,lender_id,location,switchies_per_day,icon_key,max_borrow_days)
        select 'Inbox '||n,'tech','Good','lender','Campus',1,'box',14 from generate_series(1,45) n returning id`);
        for (const row of extra.rows)
          await pool.query(
            `insert into conversations(item_id,original_item_id,item_snapshot,borrower_id,lender_id)
        values($1,$1,'{"title":"Inbox","iconKey":"box","switchiesPerDay":1}'::jsonb,'borrower','lender')`,
            [row.id],
          );
        const page1 = await api("borrower", "/conversations");
        assert.equal(page1.conversations.length, 40);
        assert(page1.nextCursor);
        const page2 = await api(
          "borrower",
          `/conversations?before=${encodeURIComponent(page1.nextCursor)}`,
        );
        const ids = [...page1.conversations, ...page2.conversations].map(
          (c: { id: string }) => c.id,
        );
        assert.equal(ids.length, 48);
        assert.equal(new Set(ids).size, 48);
        assert.equal(page2.nextCursor, null);
      });
      await t.test("socket sessions expire and request authentication refresh", async () => {
        const short = await connect("short-lived");
        const refreshing = event(short, "session:refresh"),
          closed = event(short, "disconnect");
        await refreshing;
        assert.equal((await closed)[0], "io server disconnect");
      });
      await t.test("socket handshake rejects unauthenticated connections", async () => {
        const socket = client(base, {
          path: "/api/messaging/socket.io",
          auth: { token: "invalid" },
          autoConnect: false,
          reconnection: false,
        });
        sockets.push(socket);
        const rejected = event(socket, "connect_error");
        socket.connect();
        assert.match((await rejected)[0].message, /authentication failed/);
      });
    } finally {
      sockets.forEach((s) => s.disconnect());
      await new Promise<void>((resolve) => io.close(() => resolve()));
      await closePool();
      await admin.query(`drop schema ${schema} cascade`);
      await admin.end();
    }
  },
);
