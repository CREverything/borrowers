import { Bell } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuthState } from "../auth/AuthContext";
import NotificationLink from "../components/NotificationLink";
import LoginRequired from "../components/LoginRequired";
import { useNotifications } from "../hooks/useRequests";
import { formatDateTime, formatRelative } from "../lib/dates";
import { describeNotification, notificationIcons as icons } from "../lib/notificationText";
import { markAllRead } from "../services/notificationStore";

type Filter = "all" | "borrower" | "lender" | "messages";

export default function NotificationsPage() {
  const { status } = useAuthState();

  return (
    <div className="container page page--narrow">
      <header className="page__head">
        <h1>Notifications</h1>
        <p className="page__lead">Messages and updates on things you're borrowing and lending.</p>
      </header>
      {status === "signed-in" ? (
        <NotificationList />
      ) : (
        <LoginRequired
          title="Log in to see your notifications."
          message="You'll hear when lenders reply and when people ask to borrow your things."
          returnTo="#/notifications"
        />
      )}
    </div>
  );
}

function NotificationList() {
  const { getToken } = useAuthState();
  const { loaded, notifications, unreadCount } = useNotifications();
  const [filter, setFilter] = useState<Filter>("all");
  // Remember which were unread on arrival, so they stay highlighted while you read.
  const [freshIds, setFreshIds] = useState<Set<string> | null>(null);

  useEffect(() => {
    if (!loaded || freshIds) return;
    setFreshIds(new Set(notifications.filter((n) => !n.read).map((n) => n.id)));
    if (unreadCount > 0) void markAllRead(getToken);
  }, [loaded, freshIds, notifications, unreadCount, getToken]);

  if (!loaded) {
    return (
      <p className="muted" role="status">
        Loading notifications...
      </p>
    );
  }

  const shown = notifications.filter(
    (n) =>
      filter === "all" ||
      (filter === "messages"
        ? n.kind === "message_received"
        : n.kind !== "message_received" && n.role === filter),
  );
  const filters: { id: Filter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "messages", label: "Messages" },
    { id: "borrower", label: "Borrowing" },
    { id: "lender", label: "Lending" },
  ];

  return (
    <>
      <div className="tabs" role="tablist" aria-label="Filter notifications">
        {filters.map((f) => (
          <button
            key={f.id}
            role="tab"
            aria-selected={filter === f.id}
            className={`chip${filter === f.id ? " chip--active" : ""}`}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="empty">
          <span className="empty__icon">
            <Bell size={28} aria-hidden="true" />
          </span>
          <h3>Nothing here yet</h3>
          <p>
            {filter === "messages"
              ? "New messages from other students will show up here."
              : filter === "lender"
                ? "When someone asks to borrow your things, you'll see it here."
                : filter === "borrower"
                  ? "When lenders reply to your requests, you'll see it here."
                  : "Messages, requests, approvals, returns and reviews will show up here."}
          </p>
        </div>
      ) : (
        <ul className="notification-list">
          {shown.map((n) => {
            const { text } = describeNotification(n);
            const Icon = icons[n.kind] ?? Bell;
            const fresh = freshIds?.has(n.id) ?? !n.read;
            return (
              <li key={n.id}>
                <NotificationLink
                  notification={n}
                  className={`notification${fresh ? " notification--unread" : ""}`}
                >
                  <span
                    className={`notification__icon notification__icon--${n.role}`}
                    aria-hidden="true"
                  >
                    <Icon size={18} />
                  </span>
                  <span className="notification__body">
                    <span className="notification__text">{text}</span>
                    <span className="notification__meta">
                      <span className="tag notification__role">
                        {n.kind === "message_received"
                          ? "Messages"
                          : n.role === "lender"
                            ? "Lending"
                            : "Borrowing"}
                      </span>
                      <time dateTime={n.createdAt} title={formatDateTime(n.createdAt)}>
                        {formatRelative(n.createdAt)}
                      </time>
                    </span>
                  </span>
                  {fresh && <span className="notification__dot" aria-label="New" />}
                </NotificationLink>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
