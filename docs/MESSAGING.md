# Borrowers messaging

Messaging uses the existing Express process, Clerk accounts and TigerData PostgreSQL pool. Socket.IO works here because the backend is a persistent Node server. Messages are sent through authenticated HTTP endpoints, committed to PostgreSQL, then delivered to each participant's private Socket.IO user room. The browser cannot choose its own user ID or join conversation rooms. No paid service or separate database is involved.

## Set up

Install dependencies in both packages (`npm install` and `npm --prefix backend install`). The new runtime dependencies are `socket.io` in the backend and `socket.io-client` in the frontend; no additional authentication/database dependency is needed.

Apply **backend/db/messaging.sql** and **backend/db/direct-messaging.sql** to your existing TigerData database before starting the updated application. It creates `conversations`, `messages`, `messaging_blocks`, `conversation_reports` and indexes; it does not reset records or change Switchies. The existing `npm --prefix backend run db:migrate` command now includes this migration. That command also runs the application's existing schema/profile migrations. To apply only the new messaging tables without the broader profile migrations, run `npm --prefix backend run db:messaging:migrate`. This command uses exactly the existing Node environment-loader flags, applies the SQL in a transaction with lock/statement timeouts, and does not write existing records. It is safe to run again. Check the schema and exact inbox query with `npm --prefix backend run db:messaging:check`; this reads metadata and queries an unused check ID, without accessing a real user’s conversations.

No new runtime environment variable is required. The application reuses `DATABASE_URL`, `CLERK_SECRET_KEY`, `VITE_CLERK_PUBLISHABLE_KEY` (or server-side `CLERK_PUBLISHABLE_KEY`), `CLERK_AUTHORIZED_PARTIES`, and the optional Vite `BACKEND_URL`. Existing sample environment files document these. Never put database credentials or Clerk secrets in a `VITE_` variable.

The additive migration has been applied to the configured TigerData database and its tables/indexes and inbox SQL verified. No existing user, listing, request, balance or conversation records were changed. The integration suite also passed against an isolated schema on TigerData, verifying message persistence and real-time Socket.IO delivery on the hosted database. Local regression and browser tests use temporary local PostgreSQL schemas with test authentication. Environment files are never manually inspected, copied or modified by the setup/check scripts; only the existing loader reads them.

## Local two-account test

1. Apply the messaging migration to the database you use locally and configure Clerk using your existing setup.
2. Start Express with `npm run api` and Vite with `npm run dev` in separate terminals.
3. Open `http://localhost:5173` in a normal browser and a private window (or two browser profiles). Log into different real accounts. Use a listing owned by one of these accounts; bundled demo lenders cannot log in.
4. From the borrower's account, open that listing and click the message icon beside the lender's name. The chat should float above the current page.
5. Send a message. The lender's Messages badge should increment immediately. Open Messages, select the listing conversation, and reply.
6. Verify the typing indicator and Seen receipt while the recipient's chat is open, focused and at its latest messages. Minimize the recipient's chat and send again: the message must stay unread until viewed.
7. Navigate around, minimize/reopen, refresh, log out/back in, and reopen the inbox. Saved history should remain. Message a second listing to confirm it has a separate conversation.
8. Open a long conversation and scroll upward to load older pages. Incoming messages and focus changes should preserve your position; “Jump to latest messages” returns to the bottom.
9. Block the other account and try to send in either direction, including a second listing conversation. Unblock from the account that created the block. Submit a report with a reason and confirm success.
10. Submit, approve and return an ordinary borrow request. Chat itself never moves Switchies.

## Automated verification

Run the type checks:

```sh
npx tsc -b
npm --prefix backend run typecheck
```

The normal production build is `npm run build`. Like the existing Vite configuration, this command reads configured environment files. The implementation was also built with isolated configuration for checks that must not use local secrets.

Run the PostgreSQL/HTTP/Socket.IO integration tests using a **dedicated test database**:

```sh
TEST_DATABASE_URL=postgresql://user:password@localhost:5432/borrowers_test npm --prefix backend test
```

This test command never loads `.env` or falls back to `DATABASE_URL`. It creates a randomly named schema, runs migrations twice, verifies behavior, and removes only that test schema afterward. The test database role must have permission to create schemas.

To verify the configured TigerData connection through the existing loader, run `npm --prefix backend run test:messaging:tigerdata`. This wrapper passes the connection to the same suite privately through the child process environment. It creates a unique test schema, never uses existing application tables, and removes only that test schema afterward. It does not print credentials or manually inspect environment files. Without `TEST_DATABASE_URL`, database tests are explicitly skipped. Test authentication overrides exist only in the test harness; production always uses Clerk verification.

Missing schema/connection errors also have regression coverage: messaging returns a safe, specific 503 response rather than exposing driver details or falling through to a generic listing error.

Coverage includes private delivery in both directions, duplicate-conversation/message prevention, unread/read behavior, cursor pagination, offline recovery, typing authorization, access rejection, blocks across listings, reports, spam limits, unavailable/deleted listing previews, and the existing borrowing/approval/return balance flow. Browser checks additionally exercised desktop and mobile layout, real-time UI updates, navigation/minimization, refresh persistence, blocking and reporting with isolated test users. The configured backend startup/health and rejection of anonymous or invalid HTTP/socket credentials were also verified against the running application. Signing into two real Clerk accounts was not automated; use the manual two-account steps for that final account-level check.

## Message notifications

New messages create a `message_received` update in the existing notifications table, in the same transaction as the saved message. Retries reuse the message and never create a second notification. Only the other participant receives the update. Listing messages include the item title; direct messages show the sender and a short text preview.

Socket events refresh the notification bell and popup immediately. The Notifications page includes a Messages filter. Clicking a popup or a message update opens that conversation in the floating chat without leaving the current page; conversation links also work after a reload or in a new tab. Viewing messages clears only their corresponding notifications. Reading the Notifications page itself does not mark chat messages Seen. No additional database migration, environment variable, dependency or browser notification permission is needed.

## Design and security

- Item detail pages show a white outlined **Message Lender** button below **Request to Borrow**; lender cards have no message icon. Profiles show a yellow **Message** button beside the name. Both use the same floating chat and login gating.
- Profile messages create one direct conversation per user pair, regardless of who starts it. The direct-chat migration permits a null original listing ID and adds a unique normalized user-pair index; no existing conversation/message records are rewritten. Direct chats have no item preview or unavailable-listing warning.
- One conversation per borrower/listing, enforced by a unique constraint. The server derives the lender from the listing and rejects self-messaging.
- Foreign keys preserve the original listing snapshot if the item is physically deleted. Soft-deleted/hidden listings show an unavailable indicator. Existing conversations remain readable and usable.
- Message history uses numeric ID cursors (40 messages per page). Reconnection fetches missed messages in pages, including more than one page of missed messages. Inbox pages also contain 40 conversations.
- Every endpoint checks the authenticated participant. Socket handshakes verify Clerk sessions and allowed frontend origins. Connections reconnect with fresh tokens when their session token expires.
- Read requests include the last viewed message ID, so an unseen message arriving concurrently stays unread. A recipient's visible, focused, expanded chat must be at its latest messages before the UI marks messages read.
- Message content renders as React text, never HTML. Messages allow up to 4,000 characters. SQL uses parameters. Per-user limits allow 30 sends/minute, 10 new conversations/minute and 5 reports/hour; PostgreSQL locks serialize these checks across tabs. Typing events are transient and throttled.
- Sends use a unique client retry key. A failed send keeps its draft and retry key, so retrying an uncertain delivery does not create another message. No message is shown as sent before the server saves it.
- A block applies to both directions across all listings. Either user may only remove their own block. Block and send operations serialize in PostgreSQL so a committed block prevents subsequent sends.
- Item previews and socket events do not automatically reveal contact information or pickup locations.

## Deployment and current limits

Deploy Express as **one persistent Node process** and route `/api/*` to it. The Vite development and preview proxy supports WebSocket upgrades at `/api/messaging/socket.io`; a production reverse proxy must forward that path (including HTTP polling and WebSocket upgrades). Configure `CLERK_AUTHORIZED_PARTIES` with your actual frontend origin, and keep the frontend/API on one origin as the existing app expects. A static-only/serverless function deployment cannot host this Socket.IO server.

Messages and rate limits persist across restarts. Live socket fan-out uses Socket.IO's single-process adapter. Multiple backend replicas would need a shared adapter and appropriate load-balancer configuration before use; that infrastructure is deliberately not introduced here.

Reports are stored privately for the Borrowers operator to review in `conversation_reports`; this change does not add an admin moderation interface, email/push notifications, attachments, or automatic moderation. Request-status system messages were optional and are omitted to preserve the existing borrowing transactions. One conversation can be expanded at a time, with a minimize bubble; the inbox keeps every conversation available. The expanded window survives application navigation, and messages survive reload/logout. Drafts are kept only while that conversation remains mounted and are cleared on account changes.

## Files

New files:

- `backend/db/messaging.sql`: additive schema and indexes.
- `backend/db/direct-messaging.sql`: compatible extension for listing-free profile conversations.
- `backend/src/messaging/repository.ts`: queries, authorization, transactions, validation, rate limits, blocks and reports.
- `backend/src/messaging/realtime.ts`: authenticated sockets, private user rooms and typing.
- `backend/src/messaging/integration.test.ts`: isolated PostgreSQL/HTTP/socket coverage.
- `backend/src/messaging/errors.ts` and `errors.test.ts`: safe, actionable database failure responses and regression coverage.
- `backend/src/scripts/messagingDb.ts`: additive migration and read-only schema/inbox diagnostics using the existing loader.
- `backend/src/scripts/testMessaging.ts`: isolated hosted-database integration runner using the existing loader.
- `backend/src/routes/messaging.ts`: protected messaging API.
- `src/services/messagingApi.ts`: browser API types and requests.
- `src/components/MessagingProvider.tsx`: account-scoped messaging state and socket lifecycle.
- `src/components/MessagingPanel.tsx`: inbox, floating chat, composer and moderation dialogs.
- `src/components/NotificationLink.tsx`: message notification links that open the floating chat.
- `docs/MESSAGING.md`: this setup/testing guide.

Modified files: package manifests/lockfiles for the two Socket.IO dependencies; `backend/src/app.ts`, `backend/src/index.ts`, `backend/src/migrations.ts` for API/socket/migration registration; `vite.config.ts` for the WebSocket proxy; `src/main.tsx`, `src/components/Header.tsx`, `src/components/LoginPrompt.tsx`, `src/pages/ItemDetailPage.tsx`, `src/pages/UserPage.tsx` and `src/index.css` for the existing app integration; and `README.md` for the guide link.
