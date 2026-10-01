import { describe, expect, test } from "bun:test";
import { parseDocument } from "yaml";
import { serializeTracking, syncTracking, toDescription } from "../src/sync.ts";
import { modelTracking } from "../src/tracking.ts";
import { currentLive, FIXTURE, fixture, fixtureText, live } from "./helpers.ts";

describe("syncTracking", () => {
  test("reports nothing and leaves the file byte-identical when current", async () => {
    const tracking = await fixture();
    expect(syncTracking(tracking, currentLive(tracking))).toEqual([]);
    expect(serializeTracking(tracking)).toBe(await fixtureText());
  });

  test("writes status, review, title and description, keeping comments and children last", async () => {
    const tracking = await fixture();
    const state = currentLive(tracking);
    state.set("acme/api#1", live({ status: "merged", title: "feat: renamed", body: "## What\r\n\r\nBody  \n" }));

    expect(syncTracking(tracking, state)).toEqual([{ id: "acme/api#1", fields: ["status", "review", "title", "description"] }]);

    const text = serializeTracking(tracking);
    expect(text).toContain("# Keep this comment through sync.");
    expect(text).toContain("status: merged");
    expect(text).toMatch(/description: \|-\n {8}## What\n\n {8}Body\n(.*\n)* {6}stacked:/);

    const reloaded = modelTracking(FIXTURE, parseDocument(text));
    expect(syncTracking(reloaded, state)).toEqual([]);
  });

  test("adds a review to open pull requests and removes it once they merge", async () => {
    const tracking = await fixture();
    const state = currentLive(tracking);
    state.set("acme/api#1", live({ status: "merged", title: "feat: add the schema" }));
    state.set("acme/api#3", live({ review: "changes_requested", title: "fix: standalone" }));

    expect(syncTracking(tracking, state)).toEqual([
      { id: "acme/api#1", fields: ["status", "review"] },
      { id: "acme/api#3", fields: ["review"] },
    ]);

    const reloaded = modelTracking(FIXTURE, parseDocument(serializeTracking(tracking)));
    expect(reloaded.prs.find((pr) => pr.id === "acme/api#1")?.review).toBeUndefined();
    expect(reloaded.prs.find((pr) => pr.id === "acme/api#3")?.review).toBe("changes_requested");
  });

  test("skips pull requests GitHub did not return", async () => {
    const tracking = await fixture();
    const state = currentLive(tracking);
    state.delete("acme/web#7");
    expect(syncTracking(tracking, state)).toEqual([]);
  });
});

test("toDescription strips CRLF and trailing whitespace", () => {
  expect(toDescription("  a  \r\nb\t\r\n\r\n")).toBe("a\nb");
});
