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

  test("writes status, review, branches, title and description, keeping comments", async () => {
    const tracking = await fixture();
    const state = currentLive(tracking);
    state.set(
      "acme/api#1",
      live({
        status: "merged",
        headRefName: "alice/schema",
        baseRefName: "release",
        title: "feat: renamed",
        body: "## What\r\n\r\nBody  \n",
      }),
    );

    expect(syncTracking(tracking, state)).toEqual([
      { id: "acme/api#1", fields: ["status", "review", "base", "title", "labels", "description"] },
    ]);

    const text = serializeTracking(tracking);
    expect(text).toContain("# Keep this comment through sync.");
    expect(text).toContain("status: merged");
    expect(text).toContain("base: release");
    expect(text).toMatch(/description: \|-\n {6}## What\n\n {6}Body\n/);

    const reloaded = modelTracking(FIXTURE, parseDocument(text));
    expect(syncTracking(reloaded, state)).toEqual([]);
  });

  test("adds a review to open pull requests and removes it once they merge", async () => {
    const tracking = await fixture();
    const state = currentLive(tracking);
    const merged = state.get("acme/api#1")!;
    const fix = state.get("acme/api#3")!;
    state.set("acme/api#1", { ...merged, status: "merged", review: undefined });
    state.set("acme/api#3", { ...fix, review: "changes_requested" });

    expect(syncTracking(tracking, state)).toEqual([
      { id: "acme/api#1", fields: ["status", "review"] },
      { id: "acme/api#3", fields: ["review"] },
    ]);

    const reloaded = modelTracking(FIXTURE, parseDocument(serializeTracking(tracking)));
    expect(reloaded.prs.find((pr) => pr.id === "acme/api#1")?.review).toBeUndefined();
    expect(reloaded.prs.find((pr) => pr.id === "acme/api#3")?.review).toBe("changes_requested");
  });

  test("writes labels as a flow sequence and removes them when none remain", async () => {
    const tracking = await fixture();
    const state = currentLive(tracking);
    state.set("acme/api#1", { ...state.get("acme/api#1")!, labels: [] });
    state.set("acme/api#3", { ...state.get("acme/api#3")!, labels: [{ name: "bug", color: "d73a4a" }, { name: "p: high", color: "000000" }] });

    expect(syncTracking(tracking, state)).toEqual([
      { id: "acme/api#1", fields: ["labels"] },
      { id: "acme/api#3", fields: ["labels"] },
    ]);

    const text = serializeTracking(tracking);
    expect(text).toContain('labels: [ bug, "p: high" ]');

    const reloaded = modelTracking(FIXTURE, parseDocument(text));
    expect(reloaded.prs.find((pr) => pr.id === "acme/api#1")?.labels).toEqual([]);
    expect(reloaded.prs.find((pr) => pr.id === "acme/api#3")?.labels).toEqual(["bug", "p: high"]);
    expect(syncTracking(reloaded, state)).toEqual([]);
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
