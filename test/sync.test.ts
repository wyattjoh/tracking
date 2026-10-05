import { describe, expect, test } from "bun:test";
import { mkdtemp, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseDocument } from "yaml";
import { serializeTracking, syncTracking, syncTrackingFile, toDescription } from "../src/sync.ts";
import { loadTracking, modelTracking } from "../src/tracking.ts";
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

describe("syncTrackingFile", () => {
  test("syncs the latest file, preserving local edits and skipping missing live state", async () => {
    const tracking = await fixture();
    const state = currentLive(tracking);
    state.set("acme/api#2", { ...state.get("acme/api#2")!, status: "open", title: "refreshed" });
    state.delete("acme/web#7");
    const path = join(await mkdtemp(join(tmpdir(), "tracking-")), "TRACKING.yaml");
    await writeFile(path, `${await fixtureText()}\n# Added while fetching.\nacme/new:\n  - number: 9\n    notes: local edit\n`);

    expect(await syncTrackingFile(path, state)).toEqual([
      { id: "acme/api#2", fields: ["status", "title"] },
    ]);
    const saved = await loadTracking(path);
    expect(saved.prs.find((pr) => pr.id === "acme/api#2")?.status).toBe("open");
    expect(saved.prs.find((pr) => pr.id === "acme/api#2")?.title).toBe("refreshed");
    expect(saved.prs.find((pr) => pr.id === "acme/web#7")?.status).toBe("draft");
    expect(saved.prs.map((pr) => pr.id)).toContain("acme/new#9");
    const text = await Bun.file(path).text();
    expect(text).toContain("# Keep this comment through sync.");
    expect(text).toContain("# Added while fetching.");
    expect(text).toContain("notes: local edit");

    const before = await stat(path);
    expect(await syncTrackingFile(path, state)).toEqual([]);
    expect(await Bun.file(path).text()).toBe(text);
    expect((await stat(path)).mtimeMs).toBe(before.mtimeMs);
  });
});

test("toDescription strips CRLF and trailing whitespace", () => {
  expect(toDescription("  a  \r\nb\t\r\n\r\n")).toBe("a\nb");
});
