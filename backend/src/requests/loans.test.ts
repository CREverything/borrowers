import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { borrowerReminder, lateFeeFor, parseExtension, priceExtension } from "./loans.ts";
import { RequestError } from "./repository.ts";

const HOUR = 3_600_000;
const NOW = Date.parse("2026-11-15T12:00:00Z");

// A 3-day loan, 15th-17th, 4 Switchies a day, due back the 17th at 18:00 UTC.
const loan = {
  start_date: "2026-11-15",
  end_date: "2026-11-17",
  return_due_at: new Date("2026-11-17T18:00:00Z"),
  switchies_per_day: 4,
};

const status = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    assert.ok(e instanceof RequestError, `expected RequestError, got ${e}`);
    return e.status;
  }
  return null;
};

describe("priceExtension", () => {
  it("charges per extra calendar day past the current end date", () => {
    const p = priceExtension(loan, { requestedDueAt: "2026-11-19T18:00:00Z", newEndDate: "2026-11-19" }, 14, NOW);
    assert.equal(p.extraDays, 2);
    assert.equal(p.extraSwitchies, 8);
    assert.equal(p.totalDays, 5);
    assert.equal(p.newEndDate, "2026-11-19");
    assert.equal(p.firstExtraDate, "2026-11-18");
  });

  it("is free to push the time later on the same booked day", () => {
    const p = priceExtension(loan, { requestedDueAt: "2026-11-17T21:00:00Z", newEndDate: "2026-11-17" }, 14, NOW);
    assert.equal(p.extraDays, 0);
    assert.equal(p.extraSwitchies, 0);
  });

  it("rejects a time at or before the current deadline", () => {
    assert.equal(
      status(() => priceExtension(loan, { requestedDueAt: "2026-11-17T18:00:00Z", newEndDate: "2026-11-17" }, 14, NOW)),
      400,
    );
  });

  it("rejects going past the item's maximum borrow length", () => {
    assert.equal(
      status(() => priceExtension(loan, { requestedDueAt: "2026-11-25T18:00:00Z", newEndDate: "2026-11-25" }, 5, NOW)),
      400,
    );
  });

  it("rejects a calendar date that doesn't match the requested time", () => {
    assert.equal(
      status(() => priceExtension(loan, { requestedDueAt: "2026-11-19T18:00:00Z", newEndDate: "2026-11-25" }, 30, NOW)),
      400,
    );
  });

  it("refuses a loan with no deadline", () => {
    assert.equal(
      status(() =>
        priceExtension({ ...loan, return_due_at: null }, { requestedDueAt: "2026-11-19T18:00:00Z", newEndDate: "2026-11-19" }, 14, NOW),
      ),
      409,
    );
  });
});

describe("borrowerReminder", () => {
  it("picks only the most urgent reminder that applies", () => {
    assert.equal(borrowerReminder(new Date(NOW + 100 * HOUR).toISOString(), NOW), null);
    assert.equal(borrowerReminder(new Date(NOW + 72 * HOUR).toISOString(), NOW), "due_in_72h");
    assert.equal(borrowerReminder(new Date(NOW + 30 * HOUR).toISOString(), NOW), "due_in_72h");
    assert.equal(borrowerReminder(new Date(NOW + 24 * HOUR).toISOString(), NOW), "due_in_24h");
    assert.equal(borrowerReminder(new Date(NOW + 1 * HOUR).toISOString(), NOW), "due_in_24h");
    assert.equal(borrowerReminder(new Date(NOW).toISOString(), NOW), "overdue");
    assert.equal(borrowerReminder(new Date(NOW - 5 * HOUR).toISOString(), NOW), "overdue");
  });

  it("ignores an invalid deadline", () => {
    assert.equal(borrowerReminder("not a date", NOW), null);
  });
});

describe("parseExtension", () => {
  it("normalises the time and keeps the date", () => {
    assert.deepEqual(parseExtension({ requestedDueAt: "2026-11-19T18:00:00.000+00:00", newEndDate: "2026-11-19" }), {
      requestedDueAt: "2026-11-19T18:00:00.000Z",
      newEndDate: "2026-11-19",
    });
  });

  it("rejects missing or malformed input", () => {
    assert.equal(status(() => parseExtension({})), 400);
    assert.equal(status(() => parseExtension({ requestedDueAt: "soon", newEndDate: "2026-11-19" })), 400);
    assert.equal(status(() => parseExtension({ requestedDueAt: "2026-11-19T18:00:00Z", newEndDate: "19/11" })), 400);
  });
});

describe("lateFeeFor", () => {
  const due = "2026-11-17T18:00:00Z";
  const after = (ms: number) => new Date(Date.parse(due) + ms);

  it("is free on time, early, or under an hour late", () => {
    assert.deepEqual(lateFeeFor(due, after(-HOUR)), { hoursLate: 0, fee: 0 });
    assert.deepEqual(lateFeeFor(due, after(0)), { hoursLate: 0, fee: 0 });
    assert.deepEqual(lateFeeFor(due, after(59 * 60_000)), { hoursLate: 0, fee: 0 });
  });

  it("charges 5 Switchies per full hour late", () => {
    assert.deepEqual(lateFeeFor(due, after(HOUR)), { hoursLate: 1, fee: 5 });
    assert.deepEqual(lateFeeFor(due, after(3.9 * HOUR)), { hoursLate: 3, fee: 15 });
    assert.deepEqual(lateFeeFor(new Date(due), after(26 * HOUR)), { hoursLate: 26, fee: 130 });
  });

  it("charges nothing without a deadline", () => {
    assert.deepEqual(lateFeeFor(null, after(5 * HOUR)), { hoursLate: 0, fee: 0 });
  });
});
