import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RequestError } from "../requests/repository.ts";
import { parsePlanInput, parseSelections } from "./validation.ts";

const req = (over: Record<string, unknown> = {}) => ({
  key: "projector-0",
  name: "Projector",
  quantity: 1,
  importance: "essential",
  reason: "Shows the film.",
  keywords: ["projector"],
  selected: [3],
  ...over,
});

const fails = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    assert.ok(e instanceof RequestError);
    return e.status;
  }
  return null;
};

describe("parsePlanInput", () => {
  it("accepts a full plan and normalises it", () => {
    const plan = parsePlanInput(
      {
        title: "  Movie night ",
        startAt: "2026-11-20T17:00:00.000Z",
        returnAt: "2026-11-21T12:00:00.000Z",
        startDate: "2026-11-20",
        endDate: "2026-11-21",
        eventDate: "2026-11-20",
        requirements: [req({ keywords: ["Projector", ""], selected: [3, 3, -1, 4] })],
      },
      true,
    );
    assert.equal(plan.title, "Movie night");
    assert.deepEqual(plan.requirements?.[0].keywords, ["projector"]);
    assert.deepEqual(plan.requirements?.[0].selected, [3, 4]);
  });

  it("applies the same text limits as the form", () => {
    assert.equal(fails(() => parsePlanInput({ title: "ab" }, false)), 400);
    assert.equal(fails(() => parsePlanInput({ description: "too short" }, false)), 400);
    assert.deepEqual(parsePlanInput({ description: "" }, false), { description: "" });
  });

  it("requires a title and checklist when creating", () => {
    assert.equal(fails(() => parsePlanInput({ requirements: [] }, true)), 400);
    assert.equal(fails(() => parsePlanInput({ title: "Movie night" }, true)), 400);
  });

  it("only touches the fields sent when updating", () => {
    assert.deepEqual(parsePlanInput({ title: "Renamed" }, false), { title: "Renamed" });
  });

  it("rejects a return before the start", () => {
    assert.equal(
      fails(() => parsePlanInput({ startAt: "2026-11-21T12:00:00Z", returnAt: "2026-11-20T12:00:00Z" }, false)),
      400,
    );
  });

  it("rejects dates that don't match their times", () => {
    assert.equal(fails(() => parsePlanInput({ startAt: "2026-11-21T12:00:00Z", startDate: "2026-11-25" }, false)), 400);
  });

  it("rejects bad quantities, keys and duplicates", () => {
    assert.equal(fails(() => parsePlanInput({ requirements: [req({ quantity: 0 })] }, false)), 400);
    assert.equal(fails(() => parsePlanInput({ requirements: [req({ key: "Bad Key!" })] }, false)), 400);
    assert.equal(fails(() => parsePlanInput({ requirements: [req(), req()] }, false)), 400);
  });

  it("treats anything but optional as essential", () => {
    const plan = parsePlanInput({ requirements: [req({ importance: "urgent" })] }, false);
    assert.equal(plan.requirements?.[0].importance, "essential");
  });
});

describe("parseSelections", () => {
  it("keeps one request per listing", () => {
    assert.deepEqual(
      parseSelections({
        selections: [
          { requirementKey: "speakers-1", itemId: 5 },
          { requirementKey: "music-2", itemId: 5 },
          { requirementKey: "projector-0", itemId: 3 },
        ],
      }),
      [
        { requirementKey: "speakers-1", itemId: 5 },
        { requirementKey: "projector-0", itemId: 3 },
      ],
    );
  });

  it("rejects empty or malformed selections", () => {
    assert.equal(fails(() => parseSelections({ selections: [] })), 400);
    assert.equal(fails(() => parseSelections({ selections: [{ requirementKey: "x", itemId: "3" }] })), 400);
    assert.equal(fails(() => parseSelections({})), 400);
  });
});
