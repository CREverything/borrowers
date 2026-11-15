import {
  ArrowRight,
  ChevronDown,
  Handshake,
  Hourglass,
  Inbox,
  Package,
  ShoppingBag,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { useAuthState } from "../auth/AuthContext";
import { useNow } from "../hooks/useNow";
import { useActivity, useRequests } from "../hooks/useRequests";
import { formatDuration, parseTime, urgentFirst } from "../lib/deadline";
import { scrollToTop } from "../lib/scroll";
import { paths, type Route } from "../router";
import { refreshActivity } from "../services/activityStore";

/** Condense once the page is scrolled this far... */
const CONDENSE_AT = 200;
/** ...and expand again only above this, so small scrolls near the line don't flicker. */
const EXPAND_GAP = 80;

/**
 * A slim strip of the signed-in user's lending activity, under the header.
 *
 * It lives in the sticky `.site-top` wrapper with the header, positioned just
 * below it as an overlay. Scrolled down, it condenses into a thinner strip
 * rather than disappearing.
 *
 * An in-flow spacer (`.activity-spacer`) reserves the full bar's room at the
 * top of the page. It's only resized while the top of the page is on screen,
 * so condensing and expanding never move the content: no jumps and no scroll
 * feedback loop. `--activity-offset` always tracks the bar's live height, for
 * other sticky elements to sit beneath it.
 *
 * On small screens the stats fold into a "Your activity" toggle that expands
 * in place, and the spacer grows with it so nothing is covered.
 */
export default function ActivityBar({ route }: { route: Route }) {
  const { status } = useAuthState();
  const onAuthPage = route.name === "login" || route.name === "signup";
  if (status !== "signed-in" || onAuthPage) return null;
  return <Bar route={route} />;
}

function Bar({ route }: { route: Route }) {
  const { getToken } = useAuthState();
  const activity = useActivity();
  const [open, setOpen] = useState(false);
  const [condensed, setCondensed] = useState(false);
  const condensedRef = useRef(false);
  condensedRef.current = condensed;
  const panelId = useId();
  const barRef = useRef<HTMLElement>(null);
  const spacerRef = useRef(0);

  // Close the mobile panel whenever the page changes.
  useEffect(() => setOpen(false), [route]);

  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    const root = document.documentElement;

    // The spacer matches the full bar, but only changes while it's on screen
    // (at the top of the page), where growing it simply pushes content down.
    const syncSpacer = () => {
      const height = bar.offsetHeight;
      if (condensedRef.current || height === spacerRef.current) return;
      if (window.scrollY > spacerRef.current) return;
      spacerRef.current = height;
      root.style.setProperty("--activity-height", `${height}px`);
    };

    const observer = new ResizeObserver(() => {
      root.style.setProperty("--activity-offset", `${bar.offsetHeight}px`);
      syncSpacer();
    });
    observer.observe(bar);

    // Condense past the threshold, expand near the top. At most once a frame.
    let frame = 0;
    const check = () => {
      frame = 0;
      const y = window.scrollY;
      // Don't condense while the spacer is still on screen (a tall open mobile panel).
      const condenseAt = Math.max(CONDENSE_AT, spacerRef.current + 40);
      setCondensed((was) =>
        was ? y > condenseAt - EXPAND_GAP : y > condenseAt,
      );
      syncSpacer();
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(check);
    };
    check();
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
      root.style.removeProperty("--activity-height");
      root.style.removeProperty("--activity-offset");
    };
  }, []);

  const summary = activity.summary;
  const loading = !summary && activity.status !== "error";
  const failed = !summary && activity.status === "error";
  const pending = summary?.pendingApprovals ?? 0;

  const count = (n: number | undefined) => (n === undefined ? "–" : n);

  // Things you've borrowed that are due within a day or overdue, worst first.
  const now = useNow();
  const { status: requestsStatus, borrowRequests } = useRequests();
  // Items you have right now, including returns the lender hasn't confirmed yet.
  const borrowed =
    requestsStatus === "ready" || borrowRequests.length > 0
      ? borrowRequests.filter(
          (r) => r.stage === "active" || r.stage === "return_pending",
        ).length
      : undefined;
  const urgent = urgentFirst(
    // A return the lender hasn't confirmed still counts as overdue (but isn't "due soon").
    borrowRequests.filter(
      (r) =>
        r.stage === "active" ||
        (r.stage === "return_pending" &&
          !!r.returnDueAt &&
          Date.parse(r.returnDueAt) < now),
    ),
    now,
  );
  const top = urgent[0];
  const topDue = top ? parseTime(top.returnDueAt) : null;
  const topOverdue = topDue !== null && topDue <= now;
  const topLeft = topDue === null ? "" : formatDuration(Math.abs(topDue - now));

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape" && open) setOpen(false);
  };

  return (
    <div
      className={`activity-slot${condensed ? " activity-slot--condensed" : ""}`}
    >
      <nav
        ref={barRef}
        className="activity"
        aria-label="Your lending activity"
        onKeyDown={onKeyDown}
      >
        <div
          className={`container activity__inner${open ? " activity__inner--open" : ""}`}
        >
          <button
            className="activity__toggle"
            aria-expanded={open && !condensed}
            aria-controls={panelId}
            onClick={() => {
              // Condensed (scrolled down), the panel has no room: go back up and open it.
              if (condensed) {
                setOpen(true);
                scrollToTop();
              } else {
                setOpen((v) => !v);
              }
            }}
          >
            <span>Your activity</span>
            {top ? (
              <span
                className={`activity__pill activity__pill--${topOverdue ? "overdue" : "soon"}`}
              >
                {topOverdue ? `Overdue ${topLeft}` : `Due in ${topLeft}`}
              </span>
            ) : (
              pending > 0 && (
                <span className="activity__pill">{pending} needs approval</span>
              )
            )}
            <ChevronDown
              size={16}
              aria-hidden="true"
              className="activity__chevron"
            />
          </button>

          <div className="activity__panel" id={panelId} aria-busy={loading}>
            {failed ? (
              <p className="activity__error">
                Activity counts aren't available right now.
                <button
                  className="link-btn"
                  onClick={() => void refreshActivity(getToken)}
                >
                  Try again
                </button>
              </p>
            ) : (
              <ul className="activity__stats">
                <li>
                  <a className="activity__stat" href={paths.myListings()}>
                    <Package size={16} aria-hidden="true" />
                    <strong>{count(summary?.myListings)}</strong> listed
                  </a>
                </li>
                <li>
                  <a
                    className="activity__stat"
                    href={paths.lendingSection("on-loan")}
                  >
                    <Handshake size={16} aria-hidden="true" />
                    <strong>{count(summary?.currentlyLent)}</strong> lent out
                  </a>
                </li>
                <li>
                  <a
                    className={`activity__stat${pending > 0 ? " activity__stat--alert" : ""}`}
                    href={paths.lendingSection("waiting")}
                  >
                    <Inbox size={16} aria-hidden="true" />
                    <strong>{count(summary?.pendingApprovals)}</strong>{" "}
                    {pending === 1 || !summary
                      ? "pending approval"
                      : "pending approval"}
                  </a>
                </li>
                <li>
                  <a
                    className="activity__stat"
                    href={paths.borrowing("active")}
                  >
                    <ShoppingBag size={16} aria-hidden="true" />
                    <strong>{count(borrowed)}</strong> borrowed
                  </a>
                </li>
              </ul>
            )}
            {top && (
              <a
                className={`activity__deadline activity__deadline--${topOverdue ? "overdue" : "soon"}`}
                href={paths.borrowing("active", top.id)}
              >
                {topOverdue ? (
                  <TriangleAlert size={16} aria-hidden="true" />
                ) : (
                  <Hourglass size={16} aria-hidden="true" />
                )}
                <span className="activity__deadline-text">
                  <span className="activity__deadline-item">
                    {top.itemTitle || "An item"}
                  </span>{" "}
                  {topOverdue ? `overdue by ${topLeft}` : `due in ${topLeft}`}
                </span>
                {urgent.length > 1 && (
                  <span className="activity__deadline-more">
                    +{urgent.length - 1}
                    <span className="sr-only"> more due soon or overdue</span>
                  </span>
                )}
              </a>
            )}
            {loading && (
              <span className="sr-only">Loading your activity...</span>
            )}
            <a className="activity__more" href={paths.lendingRequests}>
              View activity
              <ArrowRight size={14} aria-hidden="true" />
            </a>
          </div>
        </div>
      </nav>
    </div>
  );
}
