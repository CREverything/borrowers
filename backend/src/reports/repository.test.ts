import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RequestError } from "../requests/repository.ts";
import { parseReport } from "./repository.ts";

const nonce = "3f2b6a4e-8c1d-4e5f-9a7b-1c2d3e4f5a6b";
const valid = { bookingId: "42", category: "damaged", description: "  The screen was cracked.  ", clientNonce: nonce };
const status = (body: unknown) => {
  try {
    parseReport(body);
  } catch (e) {
    assert.ok(e instanceof RequestError);
    return e.status;
  }
  return null;
};

describe("parseReport", () => {
  it("accepts a valid report and trims the description", () => {
    assert.deepEqual(parseReport(valid), { ...valid, description: "The screen was cracked." });
    assert.equal(parseReport({ ...valid, bookingId: 42 }).bookingId, "42");
  });

  it("ignores any user id sent by the browser", () => {
    const parsed = parseReport({ ...valid, reporterId: "user_someone_else" }) as unknown as Record<string, unknown>;
    assert.equal(parsed.reporterId, undefined);
  });

  it("rejects bad bookings, categories, lengths and nonces", () => {
    assert.equal(status({ ...valid, bookingId: "abc" }), 400);
    assert.equal(status({ ...valid, category: "scam" }), 400);
    assert.equal(status({ ...valid, description: "short" }), 400);
    assert.equal(status({ ...valid, description: "x".repeat(1001) }), 400);
    assert.equal(status({ ...valid, description: "has a \0 null byte here" }), 400);
    assert.equal(status({ ...valid, clientNonce: "not-a-uuid" }), 400);
    assert.equal(status(null), 400);
  });
});
