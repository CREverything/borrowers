import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Item } from "../types";
import {
  complementsFor,
  coverageOf,
  matchRequirement,
  normalizeWord,
  relatedItems,
  requirementKey,
  type PlanLink,
  type PlanRequirement,
} from "./planning.ts";

const item = (id: number, title: string, extra: Partial<Item> = {}): Item => ({
  id,
  title,
  description: "",
  category: "tech",
  condition: "Good",
  lenderId: `u-${id}`,
  location: "Library",
  switchiesPerDay: 2,
  iconKey: "box",
  keywords: [],
  availability: { bookedRanges: [], maxBorrowDays: 7 },
  ...extra,
});

const req = (over: Partial<PlanRequirement> = {}): PlanRequirement => ({
  key: "speakers",
  name: "Speakers",
  quantity: 2,
  importance: "essential",
  reason: "",
  keywords: ["speaker"],
  selected: [],
  ...over,
});

describe("normalizeWord", () => {
  it("makes words roughly singular", () => {
    assert.equal(normalizeWord("Chairs"), "chair");
    assert.equal(normalizeWord("batteries"), "battery");
    assert.equal(normalizeWord("benches"), "bench");
    assert.equal(normalizeWord("glass"), "glass");
  });
});

describe("matchRequirement", () => {
  const items = [
    item(1, "Bluetooth party speaker", { switchiesPerDay: 3 }),
    item(2, "Desk lamp", { description: "Pairs well with a speaker" }),
    item(3, "Portable speaker", { switchiesPerDay: 1 }),
    item(4, "Sound system", { keywords: ["speaker", "audio"] }),
    item(5, "My own speaker", { lenderId: "me" }),
    item(6, "Hidden speaker", { status: "hidden" }),
  ];

  it("ranks title matches above keyword matches, cheaper first on ties", () => {
    assert.deepEqual(
      matchRequirement(req(), items, "me").map((i) => i.id),
      [3, 1, 4],
    );
  });

  it("ignores a mention only in the description", () => {
    assert.ok(!matchRequirement(req(), items, "me").some((i) => i.id === 2));
  });

  it("leaves out your own and inactive listings", () => {
    const ids = matchRequirement(req(), items, "me").map((i) => i.id);
    assert.ok(!ids.includes(5) && !ids.includes(6));
  });

  it("returns nothing when nothing fits", () => {
    assert.deepEqual(matchRequirement(req({ name: "Tent", keywords: ["tent"] }), items, "me"), []);
  });
});

describe("coverageOf", () => {
  const free = () => true;
  const link = (itemId: number, status: PlanLink["status"]): PlanLink => ({
    requirementKey: "speakers",
    itemId,
    requestId: String(itemId),
    status,
  });

  it("never counts a pick or pending request as confirmed", () => {
    const c = coverageOf(req({ selected: [1, 2] }), [link(1, "pending")], free);
    assert.deepEqual([c.confirmed, c.pending, c.selected, c.state], [0, 1, 1, "selected"]);
  });

  it("needs one listing per unit", () => {
    const c = coverageOf(req({ quantity: 3 }), [link(1, "approved")], free);
    assert.deepEqual([c.confirmed, c.state], [1, "partial"]);
    assert.equal(coverageOf(req({ quantity: 1 }), [link(1, "approved")], free).state, "confirmed");
  });

  it("tells partly selected apart from nothing selected", () => {
    assert.equal(coverageOf(req({ quantity: 2, selected: [1] }), [], free).state, "partial");
    assert.equal(coverageOf(req({ quantity: 2 }), [], free).state, "missing");
  });

  it("flags declined requests and unavailable picks", () => {
    const declined = coverageOf(req({ quantity: 1 }), [link(1, "declined")], free);
    assert.equal(declined.state, "attention");
    const unavailable = coverageOf(req({ quantity: 1, selected: [9] }), [], () => false);
    assert.deepEqual([unavailable.problems, unavailable.state], [1, "attention"]);
  });

  it("uses a listing's latest request", () => {
    const c = coverageOf(req({ quantity: 1 }), [link(1, "declined"), link(1, "approved")], free);
    assert.equal(c.state, "confirmed");
  });

  it("only counts links for this requirement", () => {
    const other = { ...link(1, "approved"), requirementKey: "chairs" };
    assert.equal(coverageOf(req({ quantity: 1 }), [other], free).confirmed, 0);
  });
});

describe("complementsFor", () => {
  it("suggests related items that aren't listed yet", () => {
    const names = complementsFor([{ name: "Projector", keywords: ["projector"] }], "movie night").map((s) => s.name);
    assert.deepEqual(names, ["Projector screen", "Extension cable"]);
  });

  it("skips suggestions already covered and uses the event context", () => {
    const names = complementsFor([{ name: "Chairs", keywords: ["chair"] }], "outdoor picnic").map((s) => s.name);
    assert.deepEqual(names, ["Lights"]);
  });
});

describe("requirementKey", () => {
  it("is URL-safe and unique", () => {
    assert.equal(requirementKey("Extension Cable!", new Set()), "extension-cable");
    assert.equal(requirementKey("Chairs", new Set(["chairs"])), "chairs-2");
    assert.equal(requirementKey("!!!", new Set()), "item");
  });
});

describe("relatedItems", () => {
  const base = item(1, "Graphing calculator", { category: "study", keywords: ["calculator", "math"] });
  const items = [
    base,
    item(2, "Scientific calculator", { category: "study", keywords: ["calculator"] }),
    item(3, "Desk lamp", { category: "dorm" }),
    item(4, "Chem textbook", { category: "study", keywords: ["chemistry"], rating: { average: 5, count: 3 } }),
    item(5, "Math flashcards", { category: "study", keywords: ["math"] }),
    item(6, "Hidden calculator", { category: "study", keywords: ["calculator"], status: "hidden" }),
  ];

  it("ranks shared keywords and titles above category alone, and never includes itself", () => {
    assert.deepEqual(relatedItems(base, items).map((i) => i.id), [2, 5, 4]);
  });

  it("never includes itself or inactive listings, and fills up with unrelated ones last", () => {
    const ids = relatedItems(base, items, 10).map((i) => i.id);
    assert.deepEqual(ids, [2, 5, 4, 3]);
  });
});
