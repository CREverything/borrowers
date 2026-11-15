import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fullName, MAX_NAME_LENGTH, nameSizeClass, shortName } from "./users.ts";

describe("name caps (browser)", () => {
  it("matches the server's 70-character cap", () => {
    assert.equal(fullName("x".repeat(100)).length, MAX_NAME_LENGTH);
    assert.equal(shortName(`${"C".repeat(90)} Dee`).length, MAX_NAME_LENGTH);
    assert.equal(shortName("Maya R."), "Maya R.");
    assert.equal(shortName("Z".repeat(100)).length, MAX_NAME_LENGTH);
  });
});

describe("nameSizeClass", () => {
  it("steps profile headings down for long names and long single words", () => {
    assert.equal(nameSizeClass("Aniket Modani"), "profile__name");
    assert.equal(nameSizeClass("Maximilian Alexander Featherstonehaugh"), "profile__name profile__name--l");
    assert.equal(nameSizeClass("Aniket".repeat(11)), "profile__name profile__name--xl");
    assert.equal(nameSizeClass("Supercalifragilistic"), "profile__name profile__name--l");
  });
});
