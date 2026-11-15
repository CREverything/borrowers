import {
  AlarmClock,
  CalendarClock,
  CalendarPlus,
  CircleCheckBig,
  CircleX,
  Handshake,
  Hourglass,
  Inbox,
  MessageCircle,
  PackageCheck,
  Star,
  TriangleAlert,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import { paths } from "../router";
import { shortName } from "../data/users";
import type { AppNotification, NotificationKind } from "../types";
import { formatDateTime, formatRange } from "./dates";

export const notificationIcons: Record<NotificationKind, LucideIcon> = {
  message_received: MessageCircle,
  request_received: Inbox,
  request_cancelled: Undo2,
  request_approved: CircleCheckBig,
  request_declined: CircleX,
  return_time_changed: CalendarClock,
  item_returned: PackageCheck,
  borrower_rated: Star,
  review_received: Star,
  handed_over: Handshake,
  due_in_72h: CalendarClock,
  due_in_24h: Hourglass,
  overdue: TriangleAlert,
  loan_overdue: AlarmClock,
  return_initiated: PackageCheck,
  extension_requested: CalendarPlus,
  extension_approved: CircleCheckBig,
  extension_declined: CircleX,
};

/**
 * Turns a notification's stored facts into a sentence, with times in the
 * reader's own time zone, plus where clicking it should go.
 */
export function describeNotification(n: AppNotification): { text: string; href: string } {
  const d = n.data;
  const item = d.itemTitle || "your item";
  const borrower = shortName(d.borrowerName) || "A student";
  const lender = shortName(d.lenderName) || "The lender";
  const range = d.startDate && d.endDate ? formatRange({ start: d.startDate, end: d.endDate }) : "";
  const due = d.returnDueAt ? formatDateTime(d.returnDueAt) : "";
  const stars = d.rating ? `${d.rating} ${d.rating === 1 ? "star" : "stars"}` : "";
  const lending = paths.lendingRequests;
  const borrowing = paths.requests;
  const thisLoan = n.requestId ? paths.borrowing("active", n.requestId) : paths.borrowing("active");
  const wantedBy = d.requestedDueAt ? formatDateTime(d.requestedDueAt) : "";
  const extra = d.extraSwitchies ? ` (${d.extraSwitchies} more Switchies)` : "";

  switch (n.kind) {
    case "message_received":
      return {
        text: `${shortName(d.senderName) || "A student"} sent you a message${d.itemTitle ? ` about ${d.itemTitle}` : ""}${d.preview ? `: ${d.preview}` : "."}`,
        href: d.conversationId ? paths.conversation(d.conversationId) : paths.notifications,
      };
    case "request_received":
      return {
        text: `${borrower} wants to borrow ${item}${range ? ` for ${range}` : ""}${d.eventTitle ? ` (${d.eventTitle})` : ""}.`,
        href: lending,
      };
    case "request_cancelled":
      return { text: `${borrower} cancelled their request for ${item}.`, href: lending };
    case "request_approved":
      return {
        text: `${lender} approved your request for ${item}.${due ? ` Please return it by ${due}.` : ""}`,
        href: borrowing,
      };
    case "request_declined":
      return { text: `${lender} declined your request for ${item}.`, href: borrowing };
    case "return_time_changed":
      return {
        text: `${lender} changed the return time for ${item}${due ? ` to ${due}` : ""}.`,
        href: borrowing,
      };
    case "item_returned":
      return {
        text: `${lender} marked ${item} as returned.${d.lateFee ? ` It was late, so ${d.lateFee} Switchies went to them as a late fee.` : ""}${stars ? ` They gave you ${stars}.` : ""} Leave a review!`,
        href: borrowing,
      };
    case "borrower_rated":
      return {
        text: `${lender} gave you ${stars || "a score"} for borrowing ${item}.`,
        href: borrowing,
      };
    case "review_received":
      return {
        text: `${borrower} left a ${d.rating ?? ""}-star review on ${item}.`,
        href: n.itemId ? paths.item(n.itemId) : lending,
      };
    case "handed_over":
      return n.role === "lender"
        ? { text: `${borrower} has picked up ${item}.`, href: paths.lendingSection("on-loan") }
        : {
            text: `You've got ${item}.${due ? ` Please return it by ${due}.` : ""}`,
            href: thisLoan,
          };
    case "due_in_72h":
      return { text: `${item} is due back ${due ? `by ${due}` : "within 3 days"}.`, href: thisLoan };
    case "due_in_24h":
      return { text: `${item} is due back within a day${due ? `, by ${due}` : ""}.`, href: thisLoan };
    case "overdue":
      return {
        text: `${item} is overdue${due ? ` (it was due ${due})` : ""}. Please return it or ask for more time.`,
        href: thisLoan,
      };
    case "loan_overdue":
      return { text: `${borrower} hasn't returned ${item} yet${due ? `; it was due ${due}` : ""}.`, href: paths.lendingSection("on-loan") };
    case "return_initiated":
      return {
        text: `${borrower} says they've returned ${item}. Confirm once you have it.`,
        href: paths.lendingSection("waiting"),
      };
    case "extension_requested":
      return {
        text: `${borrower} asked to keep ${item}${wantedBy ? ` until ${wantedBy}` : " longer"}${extra}.`,
        href: paths.lendingSection("waiting"),
      };
    case "extension_approved":
      return {
        text: `${lender} gave you more time with ${item}.${due ? ` It's now due ${due}.` : ""}`,
        href: thisLoan,
      };
    case "extension_declined":
      return {
        text: `${lender} couldn't extend ${item}.${due ? ` It's still due ${due}.` : ""}`,
        href: thisLoan,
      };
    default:
      return { text: "You have an update.", href: borrowing };
  }
}
