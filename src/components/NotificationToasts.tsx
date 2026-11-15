import { Bell, X } from "lucide-react";
import { useEffect } from "react";
import { useToasts } from "../hooks/useRequests";
import { describeNotification, notificationIcons } from "../lib/notificationText";
import { clearToasts, dismissToast } from "../services/notificationStore";
import type { AppNotification } from "../types";

/** How long a toast stays up. The progress bar drains over the same time. */
const TOAST_MS = 5000;

/**
 * New notifications pop up in the corner for 5 seconds, with a bar showing
 * the time left. Hovering or focusing a toast pauses it. They stay on the
 * notifications page either way.
 */
export default function NotificationToasts({ hidden }: { hidden: boolean }) {
  const toasts = useToasts();
  // On the notifications page the list already shows them, so drop the pop-ups.
  useEffect(() => {
    if (hidden) clearToasts();
  }, [hidden, toasts]);
  return (
    <div className="toasts" role="region" aria-label="New notifications" aria-live="polite">
      {!hidden && toasts.map((n) => <Toast key={n.id} notification={n} />)}
    </div>
  );
}

function Toast({ notification: n }: { notification: AppNotification }) {
  const { text, href } = describeNotification(n);
  const Icon = notificationIcons[n.kind] ?? Bell;
  const dismiss = () => dismissToast(n.id);

  return (
    <div className="toast">
      <a className="toast__body" href={href} onClick={dismiss}>
        <span className={`notification__icon notification__icon--${n.role}`} aria-hidden="true">
          <Icon size={18} />
        </span>
        <span className="toast__text">{text}</span>
      </a>
      <button className="toast__close" aria-label="Dismiss notification" onClick={dismiss}>
        <X size={16} aria-hidden="true" />
      </button>
      {/* The toast closes when this bar finishes draining. */}
      <span
        className="toast__progress"
        aria-hidden="true"
        style={{ animationDuration: `${TOAST_MS}ms` }}
        onAnimationEnd={dismiss}
      />
    </div>
  );
}
