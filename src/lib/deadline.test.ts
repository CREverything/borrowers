import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { describeDeadline, formatDuration, lateFee, loanProgress, urgencyOf, urgentFirst } from "./deadline.ts";

const MIN = 60_000;
const HOUR = 60 * MIN;
const NOW = Date.parse("2026-11-15T12:00:00Z");
const at = (ms: number) => new Date(NOW + ms).toISOString();

describe("urgencyOf", () => {
  it("steps through normal, upcoming, soon and overdue", () => {
    assert.equal(urgencyOf(at(73 * HOUR), NOW), "normal");
    assert.equal(urgencyOf(at(72 * HOUR), NOW), "upcoming");
    assert.equal(urgencyOf(at(25 * HOUR), NOW), "upcoming");
    assert.equal(urgencyOf(at(24 * HOUR), NOW), "soon");
    assert.equal(urgencyOf(at(1 * MIN), NOW), "soon");
    assert.equal(urgencyOf(at(0), NOW), "overdue");
    assert.equal(urgencyOf(at(-3 * HOUR), NOW), "overdue");
  });

  it("returns null for a missing or invalid deadline", () => {
    assert.equal(urgencyOf(null, NOW), null);
    assert.equal(urgencyOf(undefined, NOW), null);
    assert.equal(urgencyOf("nope", NOW), null);
  });
});

describe("formatDuration", () => {
  it("uses hours and minutes under a day, days and hours above", () => {
    assert.equal(formatDuration(3 * HOUR + 42 * MIN), "3h 42m");
    assert.equal(formatDuration(2 * HOUR), "2h");
    assert.equal(formatDuration(45 * MIN + 59_000), "45m");
    assert.equal(formatDuration(30_000), "under a minute");
    assert.equal(formatDuration(2 * 24 * HOUR + 5 * HOUR + 10 * MIN), "2d 5h");
    assert.equal(formatDuration(3 * 24 * HOUR), "3d");
    assert.equal(formatDuration(-5), "under a minute");
  });
});

describe("describeDeadline", () => {
  it("says due in or overdue by", () => {
    assert.equal(describeDeadline(at(3 * HOUR + 42 * MIN), NOW), "Due in 3h 42m");
    assert.equal(describeDeadline(at(-2 * HOUR), NOW), "Overdue by 2h");
    assert.equal(describeDeadline(null, NOW), null);
  });
});

describe("loanProgress", () => {
  it("is the share of the loan used, clamped to 0-1", () => {
    assert.equal(loanProgress(at(-10 * HOUR), at(10 * HOUR), NOW), 0.5);
    assert.equal(loanProgress(at(-10 * HOUR), at(-1 * HOUR), NOW), 1);
    assert.equal(loanProgress(at(1 * HOUR), at(10 * HOUR), NOW), 0);
    assert.equal(loanProgress(null, at(10 * HOUR), NOW), null);
    assert.equal(loanProgress(at(10 * HOUR), at(1 * HOUR), NOW), null);
  });
});

describe("urgentFirst", () => {
  it("keeps only overdue and within-24h loans, most overdue first", () => {
    const loans = [
      { id: "later", returnDueAt: at(20 * HOUR) },
      { id: "fine", returnDueAt: at(80 * HOUR) },
      { id: "late", returnDueAt: at(-2 * HOUR) },
      { id: "very-late", returnDueAt: at(-30 * HOUR) },
      { id: "soon", returnDueAt: at(1 * HOUR) },
      { id: "none", returnDueAt: null },
    ];
    assert.deepEqual(
      urgentFirst(loans, NOW).map((l) => l.id),
      ["very-late", "late", "soon", "later"],
    );
  });
});

describe("lateFee", () => {
  it("charges 5 per full hour past the deadline", () => {
    const due = at(0);
    assert.equal(lateFee(due, NOW - HOUR), 0);
    assert.equal(lateFee(due, NOW + 59 * MIN), 0);
    assert.equal(lateFee(due, NOW + HOUR), 5);
    assert.equal(lateFee(due, NOW + 2 * HOUR + 59 * MIN), 10);
    assert.equal(lateFee(null, NOW + 5 * HOUR), 0);
  });
});
