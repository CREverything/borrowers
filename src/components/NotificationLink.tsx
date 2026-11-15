import type { AnchorHTMLAttributes } from "react";
import { describeNotification } from "../lib/notificationText";
import type { AppNotification } from "../types";
import { useMessaging } from "./MessagingProvider";

/** Message updates open the floating chat while preserving the current page. */
export default function NotificationLink({
  notification,
  onClick,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & { notification: AppNotification }) {
  const messaging = useMessaging();
  return (
    <a
      {...props}
      href={describeNotification(notification).href}
      onClick={(event) => {
        onClick?.(event);
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        )
          return;
        if (notification.kind === "message_received" && notification.data.conversationId) {
          event.preventDefault();
          messaging.openConversation(notification.data.conversationId);
        }
      }}
    />
  );
}
