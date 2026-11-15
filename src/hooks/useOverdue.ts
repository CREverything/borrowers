import { urgencyOf } from "../lib/deadline";
import type { BorrowRequest } from "../types";
import { useNow } from "./useNow";
import { useRequests } from "./useRequests";

/**
 * Things you've borrowed that are past their deadline and the lender hasn't
 * confirmed are back (marking it returned yourself doesn't count), most
 * overdue first. While any exist, you can't borrow anything new; the server
 * enforces this too.
 */
export function useOverdueLoans(): BorrowRequest[] {
  const { borrowRequests } = useRequests();
  const now = useNow();
  return borrowRequests
    .filter(
      (r) =>
        (r.stage === "active" || r.stage === "return_pending") && urgencyOf(r.returnDueAt, now) === "overdue",
    )
    .sort((a, b) => Date.parse(a.returnDueAt ?? "") - Date.parse(b.returnDueAt ?? ""));
}
