import { Bell, MessageCircle, Plus } from "lucide-react";
import type { MouseEvent } from "react";
import { useAuthState } from "../auth/AuthContext";
import { scrollToSection, scrollToTop } from "../lib/scroll";
import { navigate, paths, type Route } from "../router";
import { useStartListing } from "./LoginPrompt";
import { useMessaging } from "./MessagingProvider";
import SwitchiesInfo from "./SwitchiesInfo";
import UserMenu from "./UserMenu";
import { useActivity, useNotifications } from "../hooks/useRequests";

export default function Header({ route }: { route: Route }) {
  const messaging = useMessaging();
  const startListing = useStartListing();
  const { status, user } = useAuthState();
  const unread = useNotifications().unreadCount;
  const pending = useActivity().summary?.pendingApprovals ?? 0;
  const onAuthPage = route.name === "login" || route.name === "signup";

  const links = [
    {
      href: paths.browse,
      label: "Browse",
      active: route.name === "home" || route.name === "item",
    },
    { href: paths.plan(), label: "Plan", active: route.name === "plan" },
    {
      href: paths.requests,
      label: "My Requests",
      active: route.name === "requests",
    },
    {
      href: paths.switchies,
      label: "How Switchies Work",
      active: route.name === "switchies",
    },
  ];

  // Clicking a link to the current hash fires no hashchange, so scroll by hand.
  const handleClick = (e: MouseEvent<HTMLAnchorElement>, href: string) => {
    const { pathname, hash } = window.location;
    if (pathname !== "/" || `/${hash}` !== href) return;
    e.preventDefault();
    if (href === paths.browse) scrollToSection("browse");
    else scrollToTop();
  };

  // Use the client-side router for auth links, so the return target is kept.
  const goTo = (e: MouseEvent<HTMLAnchorElement>, to: string) => {
    e.preventDefault();
    navigate(to);
  };

  return (
    <header className="header">
      <div className="container header__inner">
        <a href={paths.home} className="logo" aria-label="borrowers home">
          borrowers
        </a>

        <nav className="nav" aria-label="Main">
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className={link.active ? "nav__link--active" : undefined}
              aria-current={link.active ? "page" : undefined}
              onClick={(e) => handleClick(e, link.href)}
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="header__actions">
          {status === "signed-in" && (
            <a
              className={`bell${route.name === "notifications" ? " bell--active" : ""}`}
              href={paths.notifications}
              aria-label={[
                "Notifications",
                unread ? `${unread} new` : "",
                pending ? `${pending} ${pending === 1 ? "request needs" : "requests need"} your approval` : "",
              ]
                .filter(Boolean)
                .join(", ")}
            >
              <Bell size={20} aria-hidden="true" />
              {unread > 0 && (
                <span className="bell__count" aria-hidden="true">
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
              {/* A quiet reminder that requests are waiting, once they've been read. */}
              {unread === 0 && pending > 0 && (
                <span className="bell__pending" aria-hidden="true" />
              )}
            </a>
          )}

          {status === "signed-in" && (
            <button
              type="button"
              className={`bell${messaging.inboxOpen || (messaging.active && !messaging.minimized) ? " bell--active" : ""}`}
              onClick={messaging.toggleInbox}
              aria-label={`Messages${messaging.unreadCount ? `, ${messaging.unreadCount} unread` : ""}`}
              aria-expanded={messaging.inboxOpen}
              aria-controls="messages-inbox"
            >
              <MessageCircle size={20} aria-hidden="true" />
              {messaging.unreadCount > 0 && (
                <span className="bell__count" aria-hidden="true">
                  {messaging.unreadCount > 9 ? "9+" : messaging.unreadCount}
                </span>
              )}
            </button>
          )}
          <SwitchiesInfo />

          {(status === "signed-out" || status === "unavailable") &&
            !onAuthPage && (
              <>
                <a
                  className="btn btn--ghost"
                  href={paths.login()}
                  onClick={(e) => goTo(e, paths.login())}
                >
                  Log in
                </a>
                <a
                  className="btn btn--secondary"
                  href={paths.signup()}
                  onClick={(e) => goTo(e, paths.signup())}
                >
                  Sign up
                </a>
              </>
            )}
          {status === "loading" && (
            <span className="avatar avatar--placeholder" aria-hidden="true" />
          )}

          <button className="btn btn--primary" onClick={startListing}>
            <Plus size={18} />
            Lend an item
          </button>

          {status === "signed-in" && user && <UserMenu user={user} />}
        </div>
      </div>
    </header>
  );
}
