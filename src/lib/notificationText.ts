import { paths } from "../router";
import { firstNameOnly } from "../data/users";
import type { AppNotification } from "../types";
import { formatDateTime, formatRange } from "./dates";

/**
 * Turns a notification's stored facts into a sentence, with times in the
 * reader's own time zone, plus where clicking it should go.
 */
export function describeNotification(n: AppNotification): { text: string; href: string } {
  const d = n.data;
  const item = d.itemTitle || "your item";
  const borrower = firstNameOnly(d.borrowerName) || "A student";
  const lender = firstNameOnly(d.lenderName) || "The lender";
  const range = d.startDate && d.endDate ? formatRange({ start: d.startDate, end: d.endDate }) : "";
  const due = d.returnDueAt ? formatDateTime(d.returnDueAt) : "";
  const stars = d.rating ? `${d.rating} ${d.rating === 1 ? "star" : "stars"}` : "";
  const lending = paths.lendingRequests;
  const borrowing = paths.requests;

  switch (n.kind) {
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
      return { text: `${lender} changed the return time for ${item}${due ? ` to ${due}` : ""}.`, href: borrowing };
    case "item_returned":
      return {
        text: `${lender} marked ${item} as returned.${stars ? ` They gave you ${stars}.` : ""} Leave a review!`,
        href: borrowing,
      };
    case "borrower_rated":
      return { text: `${lender} gave you ${stars || "a score"} for borrowing ${item}.`, href: borrowing };
    case "review_received":
      return {
        text: `${borrower} left a ${d.rating ?? ""}-star review on ${item}.`,
        href: n.itemId ? paths.item(n.itemId) : lending,
      };
    default:
      return { text: "You have an update.", href: borrowing };
  }
}
