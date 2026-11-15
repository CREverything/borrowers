import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { io, type Socket } from "socket.io-client";
import { useRoute } from "../router";
import { loadNotifications } from "../services/notificationStore";
import { useAuthState } from "../auth/AuthContext";
import { useRequireAuth } from "./LoginPrompt";
import { messagingApi, type Conversation, type InboxPage } from "../services/messagingApi";
import MessagingPanel from "./MessagingPanel";

interface MessagingContextValue {
  conversations: Conversation[];
  unreadCount: number;
  inboxOpen: boolean;
  loading: boolean;
  error: string;
  nextCursor: string | null;
  active: Conversation | null;
  minimized: boolean;
  connected: boolean;
  revision: number;
  socket: Socket | null;
  toggleInbox: () => void;
  select: (c: Conversation) => void;
  start: (itemId: number) => void;
  startDirect: (recipientId: string) => void;
  openConversation: (id: string) => void;
  close: () => void;
  /** Leave the open chat and show the list of all chats. */
  back: () => void;
  minimize: () => void;
  refresh: () => Promise<void>;
  loadMore: () => Promise<void>;
}
const MessagingContext = createContext<MessagingContextValue | null>(null);
export function useMessaging() {
  const context = useContext(MessagingContext);
  if (!context) throw new Error("MessagingProvider is required.");
  return context;
}
// A keyed session prevents old in-flight requests and drafts crossing accounts.
export function MessagingProvider({ children }: { children: ReactNode }) {
  const { user, status } = useAuthState();
  return (
    <MessagingSession key={status === "signed-in" ? user?.id : "signed-out"}>
      {children}
    </MessagingSession>
  );
}
function MessagingSession({ children }: { children: ReactNode }) {
  const { user, status, getToken } = useAuthState();
  const requireAuth = useRequireAuth();
  const route = useRoute();
  const tokenRef = useRef(getToken);
  tokenRef.current = getToken;
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [active, setActive] = useState<Conversation | null>(null);
  const activeRef = useRef(active);
  activeRef.current = active;
  const [minimized, setMinimized] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [revision, setRevision] = useState(0);
  const alive = useRef(true);
  const refreshSequence = useRef(0);
  const refresh = useCallback(async () => {
    if (!user || status !== "signed-in") return;
    const sequence = ++refreshSequence.current;
    setLoading(true);
    try {
      const page = await messagingApi<InboxPage>(() => tokenRef.current(), "/conversations");
      if (!alive.current || sequence !== refreshSequence.current) return;
      // Preserve already loaded older pages; refresh their state when selected.
      setConversations((old) => [
        ...page.conversations,
        ...old.filter((c) => !page.conversations.some((n) => n.id === c.id)),
      ]);
      setUnreadCount(page.unreadCount);
      setNextCursor(page.nextCursor);
      setError("");
      const selected = activeRef.current;
      if (selected) {
        const updated =
          page.conversations.find((c) => c.id === selected.id) ??
          (await messagingApi<Conversation>(
            () => tokenRef.current(),
            `/conversations/${selected.id}`,
          ));
        if (
          alive.current &&
          sequence === refreshSequence.current &&
          activeRef.current?.id === selected.id
        )
          setActive(updated);
      }
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    } finally {
      if (alive.current && sequence === refreshSequence.current) setLoading(false);
    }
  }, [user?.id, status]);
  useEffect(() => {
    alive.current = true;
    if (!user || status !== "signed-in")
      return () => {
        alive.current = false;
      };
    const connection = io({
      path: "/api/messaging/socket.io",
      autoConnect: false,
      auth: (cb) => {
        void tokenRef
          .current()
          .then((token) => cb({ token }))
          .catch(() => cb({ token: null }));
      },
    });
    let reconnectTimer: number | undefined;
    const refreshNotifications = () => {
      void loadNotifications(user.id, () => tokenRef.current());
    };
    connection.on("connect", () => {
      refreshNotifications();
      window.clearTimeout(reconnectTimer);
      setConnected(true);
      setError("");
      setRevision((n) => n + 1);
      void refresh();
    });
    connection.on("disconnect", () => setConnected(false));
    connection.on("connect_error", () => {
      setConnected(false);
      setError("Live connection unavailable. Messages are saved; reconnecting…");
      // Socket.IO retries transport failures itself; an authentication rejection needs a fresh attempt.
      if (!connection.active) {
        window.clearTimeout(reconnectTimer);
        reconnectTimer = window.setTimeout(() => {
          if (alive.current) connection.connect();
        }, 3000);
      }
    });
    connection.on("session:refresh", () => {
      reconnectTimer = window.setTimeout(() => {
        if (alive.current) connection.connect();
      }, 100);
    });
    const changed = () => {
      void refresh();
    };
    connection.on("message", (message: { senderId: string }) => {
      changed();
      if (message.senderId !== user.id) refreshNotifications();
    });
    connection.on("messages:read", () => {
      changed();
      refreshNotifications();
    });
    connection.on("conversation:changed", changed);
    const focus = () => {
      void refresh();
      setRevision((n) => n + 1);
      if (!connection.connected) connection.connect();
    };
    window.addEventListener("focus", focus);
    window.addEventListener("online", focus);
    setSocket(connection);
    connection.connect();
    void refresh();
    return () => {
      alive.current = false;
      window.clearTimeout(reconnectTimer);
      window.removeEventListener("focus", focus);
      window.removeEventListener("online", focus);
      connection.removeAllListeners();
      connection.disconnect();
    };
  }, [user?.id, status, refresh]);
  const select = (c: Conversation) => {
    activeRef.current = c;
    setActive(c);
    setMinimized(false);
    setInboxOpen(false);
    void refresh();
  };
  const openConversation = async (id: string) => {
    if (!requireAuth("message")) return;
    setError("");
    setLoading(true);
    try {
      const conversation = await messagingApi<Conversation>(
        () => tokenRef.current(),
        `/conversations/${encodeURIComponent(id)}`,
      );
      if (alive.current) select(conversation);
    } catch (error) {
      if (alive.current) {
        setError((error as Error).message);
        setInboxOpen(true);
      }
    } finally {
      if (alive.current) setLoading(false);
    }
  };
  // Remember which chat is open (and if it's minimised) for this tab, so a refresh
  // reopens it and reloads its history from TigerData. Only the id is kept here.
  const OPEN_CHAT_KEY = "borrowers.openChat.v1";
  const restoredOnce = useRef(false);
  useEffect(() => {
    if (status !== "signed-in" || !user || !restoredOnce.current) return;
    try {
      if (active) {
        sessionStorage.setItem(OPEN_CHAT_KEY, JSON.stringify({ userId: user.id, id: active.id, minimized }));
      } else {
        sessionStorage.removeItem(OPEN_CHAT_KEY);
      }
    } catch {
      // Storage unavailable (private mode): chats just won't reopen after a refresh.
    }
  }, [active, minimized, status, user]);

  const linkedConversation = route.name === "messages" ? route.conversationId : null;
  useEffect(() => {
    if (restoredOnce.current || status !== "signed-in" || !user) return;
    restoredOnce.current = true;
    if (linkedConversation) return; // A link to a specific chat wins.
    let saved: { userId?: string; id?: string; minimized?: boolean } | null = null;
    try {
      saved = JSON.parse(sessionStorage.getItem(OPEN_CHAT_KEY) ?? "null");
    } catch {
      saved = null;
    }
    if (!saved?.id || saved.userId !== user.id) return;
    const wasMinimized = !!saved.minimized;
    void openConversation(saved.id).then(() => {
      if (wasMinimized && alive.current) setMinimized(true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, user]);
  useEffect(() => {
    if (linkedConversation && status === "signed-in") void openConversation(linkedConversation);
  }, [linkedConversation, status]);
  const start = async (target: { itemId: number } | { recipientId: string }) => {
    if (!requireAuth("message")) return;
    setError("");
    setLoading(true);
    try {
      const c = await messagingApi<Conversation>(
        () => tokenRef.current(),
        "/conversations",
        target,
      );
      if (alive.current) {
        select(c);
        await refresh();
      }
    } catch (e) {
      if (alive.current) {
        setError((e as Error).message);
        setInboxOpen(true);
      }
    } finally {
      if (alive.current) setLoading(false);
    }
  };
  const loadMore = async () => {
    if (!nextCursor || loading) return;
    setLoading(true);
    try {
      const page = await messagingApi<InboxPage>(
        () => tokenRef.current(),
        `/conversations?before=${encodeURIComponent(nextCursor)}`,
      );
      if (!alive.current) return;
      setConversations((old) => [
        ...old,
        ...page.conversations.filter((c) => !old.some((o) => o.id === c.id)),
      ]);
      setNextCursor(page.nextCursor);
      setUnreadCount(page.unreadCount);
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    } finally {
      if (alive.current) setLoading(false);
    }
  };
  return (
    <MessagingContext.Provider
      value={{
        conversations,
        unreadCount,
        inboxOpen,
        loading,
        error,
        nextCursor,
        active,
        minimized,
        connected,
        revision,
        socket,
        refresh,
        loadMore,
        select,
        toggleInbox: () => {
          if (!requireAuth("message")) return;
          if (active) {
            // A conversation is open: the header button brings it back up
            // (un-minimising it) rather than showing the inbox popup over it.
            setMinimized(false);
            setInboxOpen(false);
            requestAnimationFrame(() =>
              document.querySelector<HTMLTextAreaElement>(".chat-composer textarea")?.focus(),
            );
            return;
          }
          setInboxOpen((v) => !v);
          void refresh();
        },
        start: (itemId) => {
          void start({ itemId });
        },
        startDirect: (recipientId) => {
          void start({ recipientId });
        },
        openConversation: (id) => {
          void openConversation(id);
        },
        close: () => setActive(null),
        back: () => {
          setActive(null);
          setMinimized(false);
          setInboxOpen(true);
          void refresh();
        },
        minimize: () => setMinimized((v) => !v),
      }}
    >
      {children}
      {status === "signed-in" && <MessagingPanel />}
    </MessagingContext.Provider>
  );
}
