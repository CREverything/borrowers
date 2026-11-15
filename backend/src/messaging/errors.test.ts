import assert from "node:assert/strict";
import test from "node:test";
import { messagingDatabaseFailure } from "./errors.ts";

test("missing messaging tables/columns return an actionable 503 without database details", () => {
  for (const code of ["42P01", "42703"]) {
    const result = messagingDatabaseFailure({ code, message: "private database connection details" });
    assert.equal(result?.status, 503);
    assert.match(result!.error, /migration/);
    assert(!result!.error.includes("private"));
  }
});
test("database connection failures are retryable and do not expose connection details", () => {
  for (const code of ["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "08006", "57P01", "53300"]) {
    const result = messagingDatabaseFailure({ code, message: "private database connection details" });
    assert.equal(result?.status, 503);
    assert.match(result!.error, /try again shortly/);
    assert(!result!.error.includes("private"));
  }
});
test("other failures retain normal error handling", () => {
  assert.equal(messagingDatabaseFailure(null), null);
  assert.equal(messagingDatabaseFailure(new Error("unknown")), null);
  assert.equal(messagingDatabaseFailure({ code: "23505" }), null);
});
