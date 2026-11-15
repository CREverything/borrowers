import {
  Flag,
  MessageCircle,
  Minus,
  Package,
  Send,
  ShieldBan,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useAuthState } from "../auth/AuthContext";
import { paths, navigate } from "../router";
import {
  messagingApi,
  type ChatMessage,
  type Conversation,
  type HistoryPage,
} from "../services/messagingApi";
import Dialog from "./Dialog";
import FadeText from "./FadeText";
import { iconChoices } from "./ItemIllustration";
import { useMessaging } from "./MessagingProvider";
import { Avatar } from "./UserMenu";

/**
 * The minimised chat bar's width depends on the other person's name, so it
 * publishes its width as --chat-minimized-width; other corner widgets (the
 * favourites button) use it to sit beside the bar instead of under it.
 */
let minimizedObserver: ResizeObserver | null = null;
function publishMinimizedWidth(el: HTMLDivElement | null) {
  const root = document.documentElement;
  minimizedObserver?.disconnect();
  minimizedObserver = null;
  if (!el) {
    root.style.removeProperty("--chat-minimized-width");
    return;
  }
  minimizedObserver = new ResizeObserver(() =>
    root.style.setProperty("--chat-minimized-width", `${el.offsetWidth}px`),
  );
  minimizedObserver.observe(el);
}

const time = (value: string) =>
  new Date(value).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
const dateTime = (value: string) =>
  new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
function mergeMessages(old: ChatMessage[], incoming: ChatMessage[]) {
  const map = new Map(old.map((m) => [m.id, m]));
  incoming.forEach((m) => {
    const prior = map.get(m.id);
    map.set(m.id, { ...m, readAt: m.readAt ?? prior?.readAt ?? null });
  });
  return Array.from(map.values()).sort((a, b) =>
    BigInt(a.id) < BigInt(b.id) ? -1 : 1,
  );
}
export default function MessagingPanel() {
  const chat = useMessaging();
  return (
    <>
      {chat.inboxOpen && (
        <section
          className="messages-inbox"
          id="messages-inbox"
          aria-label="Messages inbox"
        >
          <div className="chat-heading">
            <h2>Messages</h2>
            <button
              className="chat-icon"
              aria-label="Close inbox"
              onClick={chat.toggleInbox}
            >
              <X size={19} />
            </button>
          </div>
          {chat.error && (
            <div className="chat-notice" role="alert">
              {chat.error}{" "}
              <button className="link-btn" onClick={() => void chat.refresh()}>
                Retry
              </button>
            </div>
          )}
          <div className="messages-inbox__list">
            {chat.loading && chat.conversations.length === 0 ? (
              <p className="chat-empty" role="status">
                Loading conversations…
              </p>
            ) : chat.conversations.length === 0 && !chat.error ? (
              <div className="chat-empty">
                <MessageCircle size={30} aria-hidden="true" />
                <h3>Communication is key!</h3>
                <p>Message a lender to arrange your next borrow.</p>
              </div>
            ) : null}
            {chat.conversations.map((c) => (
              <button
                key={c.id}
                className={`inbox-conversation${c.unreadCount ? " inbox-conversation--unread" : ""}`}
                onClick={() => chat.select(c)}
              >
                <Avatar name={c.otherName} imageUrl={c.otherAvatar} size={40} />
                <span className="inbox-conversation__copy">
                  <strong>{c.otherName}</strong>
                  <span>
                    {c.isDirect ? "Direct conversation" : c.item?.title}
                  </span>
                  <span className="muted">
                    {c.lastMessage?.content ??
                      (c.isDirect ? "Say hello" : "Say hello about this item")}
                  </span>
                  <time dateTime={c.lastMessageAt ?? c.createdAt}>
                    {dateTime(c.lastMessageAt ?? c.createdAt)}
                  </time>
                </span>
                {c.unreadCount > 0 && (
                  <span
                    className="chat-unread"
                    aria-label={`${c.unreadCount} unread messages`}
                  >
                    {c.unreadCount}
                  </span>
                )}
              </button>
            ))}
            {chat.nextCursor && (
              <button
                className="btn btn--secondary chat-more"
                disabled={chat.loading}
                onClick={() => void chat.loadMore()}
              >
                {chat.loading ? "Loading…" : "More conversations"}
              </button>
            )}
          </div>
        </section>
      )}
      {chat.active && (
        <ChatWindow key={chat.active.id} conversation={chat.active} />
      )}
    </>
  );
}
function ChatWindow({ conversation: c }: { conversation: Conversation }) {
  const chat = useMessaging();
  const ItemIcon =
    iconChoices.find((choice) => choice.key === c.item?.iconKey)?.icon ??
    Package;
  const { user, getToken } = useAuthState();
  const tokenRef = useRef(getToken);
  tokenRef.current = getToken;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [typing, setTyping] = useState(false);
  const [focused, setFocused] = useState(
    document.hasFocus() && document.visibilityState === "visible",
  );
  const [atBottom, setAtBottom] = useState(true);
  const [moderation, setModeration] = useState<"block" | "report" | null>(null);
  const [reason, setReason] = useState("");
  const [moderating, setModerating] = useState(false);
  const [moderationError, setModerationError] = useState("");
  const [notice, setNotice] = useState("");
  const scroll = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const pinned = useRef(true);
  const anchor = useRef<{ height: number; top: number } | null>(null);
  const alive = useRef(true);
  const inFlight = useRef(false);
  const retry = useRef<{ content: string; nonce: string } | null>(null);
  const typingTimeout = useRef<number>();
  const typingLastSent = useRef(0);
  const lastRead = useRef("");
  const markBusy = useRef(false);
  const readRetry = useRef<ReturnType<typeof setTimeout>>();
  const [readAttempt, setReadAttempt] = useState(0);
  const api = useCallback(
    <T,>(path: string, body?: unknown) =>
      messagingApi<T>(
        () => tokenRef.current(),
        `/conversations/${c.id}${path}`,
        body,
      ),
    [c.id],
  );

  useEffect(() => {
    alive.current = true;
    const updateFocus = () =>
      setFocused(document.hasFocus() && document.visibilityState === "visible");
    window.addEventListener("focus", updateFocus);
    window.addEventListener("blur", updateFocus);
    document.addEventListener("visibilitychange", updateFocus);
    return () => {
      alive.current = false;
      window.clearTimeout(typingTimeout.current);
      clearTimeout(readRetry.current);
      window.removeEventListener("focus", updateFocus);
      window.removeEventListener("blur", updateFocus);
      document.removeEventListener("visibilitychange", updateFocus);
    };
  }, []);
  useEffect(() => {
    let cancelled = false;
    const existing = messagesRef.current;
    const last = existing[existing.length - 1];
    if (!last) setLoading(true);
    setError("");
    const sync = async () => {
      try {
        if (!last) {
          const page = await api<HistoryPage>("/messages");
          if (cancelled) return;
          setMessages((old) => mergeMessages(page.messages, old));
          setHasMore(page.hasMore);
        } else {
          // Fill every gap after reconnect without discarding loaded history or its scroll position.
          let after = last.id;
          while (!cancelled) {
            const page = await api<HistoryPage>(`/messages?after=${after}`);
            if (cancelled) return;
            setMessages((old) => mergeMessages(old, page.messages));
            if (!page.hasMore || !page.messages.length) break;
            after = page.messages[page.messages.length - 1].id;
          }
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void sync();
    return () => {
      cancelled = true;
    };
  }, [api, chat.revision, reload]);
  useEffect(() => {
    const socket = chat.socket;
    if (!socket) return;
    const receive = (message: ChatMessage) => {
      if (message.conversationId !== c.id) return;
      setMessages((old) => mergeMessages(old, [message]));
      setTyping(false);
    };
    const read = (event: {
      conversationId: string;
      readerId: string;
      throughId: string;
      readAt: string;
    }) => {
      if (event.conversationId !== c.id) return;
      setMessages((old) =>
        old.map((m) =>
          m.senderId !== event.readerId &&
          BigInt(m.id) <= BigInt(event.throughId)
            ? { ...m, readAt: m.readAt ?? event.readAt }
            : m,
        ),
      );
    };
    const type = (event: {
      conversationId: string;
      userId: string;
      typing: boolean;
    }) => {
      if (event.conversationId !== c.id || event.userId === user?.id) return;
      setTyping(event.typing);
      window.clearTimeout(typingTimeout.current);
      typingTimeout.current = window.setTimeout(() => setTyping(false), 3000);
    };
    socket.on("message", receive);
    socket.on("messages:read", read);
    socket.on("typing", type);
    return () => {
      socket.off("message", receive);
      socket.off("messages:read", read);
      socket.off("typing", type);
    };
  }, [chat.socket, c.id, user?.id]);
  useLayoutEffect(() => {
    const el = scroll.current;
    if (!el) return;
    if (anchor.current) {
      el.scrollTop =
        anchor.current.top + el.scrollHeight - anchor.current.height;
      anchor.current = null;
    } else if (pinned.current) el.scrollTop = el.scrollHeight;
  }, [messages, loading, chat.minimized, typing]);
  useEffect(() => {
    if (
      chat.minimized ||
      !focused ||
      !atBottom ||
      loading ||
      !messages.length ||
      markBusy.current
    )
      return;
    const last = messages[messages.length - 1];
    if (
      lastRead.current === last.id ||
      !messages.some((m) => m.senderId !== user?.id && !m.readAt)
    )
      return;
    markBusy.current = true;
    let succeeded = false;
    void api("/read", { throughId: last.id })
      .then(() => {
        if (!alive.current) return;
        succeeded = true;
        lastRead.current = last.id;
        setMessages((old) =>
          old.map((m) =>
            m.senderId !== user?.id && BigInt(m.id) <= BigInt(last.id)
              ? { ...m, readAt: m.readAt ?? new Date().toISOString() }
              : m,
          ),
        );
        void chat.refresh();
      })
      .catch(() => {
        if (alive.current)
          readRetry.current = setTimeout(
            () => setReadAttempt((n) => n + 1),
            4000,
          );
      })
      .finally(() => {
        markBusy.current = false;
        if (alive.current && succeeded) setReadAttempt((n) => n + 1);
      });
  }, [
    messages,
    chat.minimized,
    focused,
    atBottom,
    loading,
    api,
    user?.id,
    readAttempt,
  ]);
  const older = async () => {
    if (loadingOlder || !hasMore || !messages[0]) return;
    setLoadingOlder(true);
    try {
      const page = await api<HistoryPage>(`/messages?before=${messages[0].id}`);
      if (!alive.current) return;
      const el = scroll.current;
      if (el) anchor.current = { height: el.scrollHeight, top: el.scrollTop };
      pinned.current = false;
      setAtBottom(false);
      setMessages((old) => mergeMessages(old, page.messages));
      setHasMore(page.hasMore);
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    } finally {
      if (alive.current) setLoadingOlder(false);
    }
  };
  const emitTyping = (value: boolean) => {
    if (!chat.socket?.connected || c.blocked) return;
    if (value && Date.now() - typingLastSent.current < 1100) return;
    typingLastSent.current = Date.now();
    chat.socket.emit("typing", { conversationId: c.id, typing: value });
  };
  const send = async (e?: FormEvent) => {
    e?.preventDefault();
    const content = draft.trim();
    if (!content || inFlight.current || c.blocked) return;
    inFlight.current = true;
    setSending(true);
    setError("");
    if (retry.current?.content !== content)
      retry.current = { content, nonce: crypto.randomUUID() };
    try {
      const message = await api<ChatMessage>("/messages", {
        content,
        clientNonce: retry.current.nonce,
      });
      if (!alive.current) return;
      pinned.current = true;
      setAtBottom(true);
      setMessages((old) => mergeMessages(old, [message]));
      setDraft("");
      retry.current = null;
      emitTyping(false);
      void chat.refresh();
      input.current?.focus();
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    } finally {
      inFlight.current = false;
      if (alive.current) setSending(false);
    }
  };
  const moderate = async (e: FormEvent) => {
    e.preventDefault();
    if (moderating) return;
    setModerating(true);
    setModerationError("");
    try {
      await api(
        `/${moderation}`,
        moderation === "report" ? { reason } : { blocked: !c.blockedByMe },
      );
      if (!alive.current) return;
      setNotice(
        moderation === "report"
          ? "Report saved for review."
          : c.blockedByMe
            ? "User unblocked."
            : "User blocked. They can no longer message you.",
      );
      setModeration(null);
      setReason("");
      await chat.refresh();
    } catch (e) {
      if (alive.current) setModerationError((e as Error).message);
    } finally {
      if (alive.current) setModerating(false);
    }
  };
  return (
    <>
      {chat.minimized && (
        <div className="chat-minimized" ref={publishMinimizedWidth}>
          <button
            className="btn btn--primary"
            onClick={chat.minimize}
            aria-label={`Reopen chat with ${c.otherName}`}
          >
            <MessageCircle size={19} />
            <FadeText text={c.otherName} className="chat-minimized__name" />
            {c.unreadCount > 0 && (
              <span className="chat-unread">{c.unreadCount}</span>
            )}
          </button>
          <button
            className="chat-icon"
            onClick={chat.close}
            aria-label="Close chat"
          >
            <X size={17} />
          </button>
        </div>
      )}
      <section
        className="chat-window"
        aria-label={`Conversation with ${c.otherName}${c.isDirect ? "" : ` about ${c.item?.title}`}`}
        hidden={chat.minimized}
      >
        <div className="chat-heading">
          <Avatar name={c.otherName} imageUrl={c.otherAvatar} size={36} />
          <div className="chat-heading__name">
            <FadeText
              as="strong"
              text={c.otherName}
              className="chat-heading__title"
            />
            <span className="small muted">
              {chat.connected ? "Messages" : "Reconnecting…"}
            </span>
          </div>
          <button
            className="chat-icon"
            aria-label="Minimize chat"
            onClick={() => {
              emitTyping(false);
              chat.minimize();
            }}
          >
            <Minus size={19} />
          </button>
          <button
            className="chat-icon"
            aria-label="Close chat"
            onClick={() => {
              emitTyping(false);
              chat.close();
            }}
          >
            <X size={19} />
          </button>
        </div>
        {c.isDirect ? (
          <div className="chat-item">
            <MessageCircle size={20} aria-hidden="true" />
            <span>
              <strong>Direct conversation</strong>
              <span>Chat with {c.otherName}</span>
            </span>
          </div>
        ) : (
          c.item && (
            <a
              href={c.itemId ? paths.item(c.itemId) : undefined}
              className="chat-item"
              onClick={(e) => {
                if (c.itemId) {
                  e.preventDefault();
                  navigate(paths.item(c.itemId));
                }
              }}
            >
              <span className="chat-item__image">
                {c.item.imageUrl ? (
                  <img src={c.item.imageUrl} alt="" />
                ) : (
                  <ItemIcon size={24} aria-hidden="true" />
                )}
              </span>
              <span>
                <strong>{c.item.title}</strong>
                <span>
                  {c.itemUnavailable
                    ? "Item currently unavailable"
                    : `${c.item.switchiesPerDay} Switchies / day`}
                </span>
              </span>
            </a>
          )
        )}
        <div className="chat-tools">
          <button
            className="link-btn"
            onClick={() => {
              setModerationError("");
              setModeration("block");
            }}
          >
            <ShieldBan size={13} />
            {c.blockedByMe ? "Unblock" : "Block"}
          </button>
          <button
            className="link-btn"
            onClick={() => {
              setModerationError("");
              setModeration("report");
            }}
          >
            <Flag size={13} />
            Report
          </button>
        </div>
        {notice && (
          <p className="chat-notice" role="status">
            {notice}
          </p>
        )}
        <div
          className="chat-history"
          ref={scroll}
          onScroll={() => {
            const el = scroll.current;
            if (!el) return;
            pinned.current =
              el.scrollHeight - el.scrollTop - el.clientHeight < 50;
            setAtBottom(pinned.current);
            if (el.scrollTop < 30 && !loading) void older();
          }}
        >
          {loading ? (
            <p className="chat-empty" role="status">
              Loading messages…
            </p>
          ) : (
            <>
              {hasMore && (
                <button
                  className="link-btn chat-more"
                  disabled={loadingOlder}
                  onClick={() => void older()}
                >
                  {loadingOlder ? "Loading…" : "Load earlier messages"}
                </button>
              )}
              {messages.length === 0 && !error && (
                <div className="chat-empty">
                  <MessageCircle size={28} />
                  <p>
                    Say hello to {c.otherName}.{!c.isDirect}.
                  </p>
                  <span className="small muted">
                    Messaging is free. No Switchies are spent.
                  </span>
                </div>
              )}
              {messages.map((m, index) => {
                const own = m.senderId === user?.id;
                const day = new Date(m.createdAt).toLocaleDateString();
                const newDay =
                  index === 0 ||
                  new Date(
                    messages[index - 1].createdAt,
                  ).toLocaleDateString() !== day;
                return (
                  <div key={m.id}>
                    {newDay && <p className="chat-day">{day}</p>}
                    <div
                      className={`chat-message${own ? " chat-message--own" : ""}`}
                    >
                      <p>{m.content}</p>
                      <span>
                        <time
                          dateTime={m.createdAt}
                          title={dateTime(m.createdAt)}
                        >
                          {time(m.createdAt)}
                        </time>
                        {own && ` · ${m.readAt ? "Seen" : "Sent"}`}
                      </span>
                    </div>
                  </div>
                );
              })}
            </>
          )}
          {typing && !c.blocked && (
            <p className="chat-typing" role="status">
              {c.otherName} is typing…
            </p>
          )}
        </div>
        {!atBottom && (
          <button
            className="chat-new link-btn"
            onClick={() => {
              pinned.current = true;
              setAtBottom(true);
              if (scroll.current)
                scroll.current.scrollTop = scroll.current.scrollHeight;
            }}
          >
            Jump to latest messages ↓
          </button>
        )}
        {error && (
          <p className="chat-notice form-error" role="alert">
            {error}{" "}
            {loading === false && messages.length === 0 && (
              <button
                className="link-btn"
                onClick={() => setReload((n) => n + 1)}
              >
                Retry
              </button>
            )}
          </p>
        )}
        {c.blocked ? (
          <p className="chat-notice">
            Messaging is blocked between these accounts.
          </p>
        ) : (
          <form className="chat-composer" onSubmit={(e) => void send(e)}>
            <label className="sr-only" htmlFor="chat-draft">
              Message {c.otherName}
            </label>
            <textarea
              id="chat-draft"
              ref={input}
              rows={2}
              value={draft}
              maxLength={4000}
              placeholder="Write a message…"
              disabled={sending}
              onChange={(e) => {
                setDraft(e.target.value);
                emitTyping(!!e.target.value.trim());
              }}
              onBlur={() => emitTyping(false)}
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  !e.shiftKey &&
                  !e.nativeEvent.isComposing
                ) {
                  e.preventDefault();
                  void send();
                }
              }}
            />
            <button
              type="submit"
              className="btn btn--primary"
              disabled={!draft.trim() || sending}
              aria-label={sending ? "Sending message" : "Send message"}
            >
              <Send size={18} />
            </button>
            <span className="chat-composer__hint">
              {sending
                ? "Sending…"
                : "Enter to send · Shift + Enter for a new line"}
              <span>{draft.length}/4000</span>
            </span>
          </form>
        )}
      </section>
      {moderation && (
        <Dialog
          title={
            moderation === "report"
              ? "Report conversation"
              : c.blockedByMe
                ? "Unblock this user?"
                : "Block this user?"
          }
          onClose={() => {
            if (!moderating) setModeration(null);
          }}
        >
          <form onSubmit={(e) => void moderate(e)}>
            {moderation === "report" ? (
              <>
                <label htmlFor="chat-report">Tell us what happened</label>
                <textarea
                  id="chat-report"
                  className="chat-report"
                  required
                  maxLength={1000}
                  rows={4}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
                <p className="small muted">
                  Your report is stored privately for the Borrowers team to
                  review.
                </p>
              </>
            ) : (
              <p>
                {c.blockedByMe
                  ? "You will be able to message each other again unless they have also blocked you."
                  : "This prevents messages in both directions across all listings. Your history stays available."}
              </p>
            )}
            {moderationError && (
              <p className="form-error" role="alert">
                {moderationError}
              </p>
            )}
            <button
              className="btn btn--primary"
              disabled={
                moderating || (moderation === "report" && !reason.trim())
              }
            >
              {moderating
                ? "Saving…"
                : moderation === "report"
                  ? "Submit report"
                  : c.blockedByMe
                    ? "Unblock user"
                    : "Block user"}
            </button>
          </form>
        </Dialog>
      )}
    </>
  );
}
