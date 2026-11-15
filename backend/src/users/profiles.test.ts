import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fullName, MAX_NAME_LENGTH, shortName } from "./profiles.ts";

describe("name caps", () => {
  const long = `${"A".repeat(60)} ${"B".repeat(30)}`;

  it("caps full names at 70 characters", () => {
    assert.equal(fullName(long).length, MAX_NAME_LENGTH);
    assert.equal(fullName("  Maya   Reyes "), "Maya Reyes");
  });

  it("keeps short names within the cap, initial included", () => {
    assert.equal(shortName(`${"C".repeat(90)} Dee`), `${"C".repeat(67)} D.`);
    assert.equal(shortName(`${"C".repeat(90)} Dee`).length, MAX_NAME_LENGTH);
    assert.equal(shortName("Maya Reyes"), "Maya R.");
    assert.equal(shortName("Z".repeat(100)).length, MAX_NAME_LENGTH);
  });

  it("never splits an emoji", () => {
    const name = "😀".repeat(80);
    assert.equal(Array.from(fullName(name)).length, MAX_NAME_LENGTH);
    assert.ok(!fullName(name).includes("�"));
  });
});
