import { describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findTrackingFile, prUrl, stackParents } from "../src/tracking.ts";
import { currentLive, fixture, live } from "./helpers.ts";

describe("modelTracking", () => {
  test("models repos and their pull requests in file order", async () => {
    const tracking = await fixture();

    expect(tracking.repos.map((group) => group.repo)).toEqual(["acme/api", "acme/web"]);
    expect(tracking.prs.map((pr) => pr.id)).toEqual(["acme/api#1", "acme/api#2", "acme/api#3", "acme/web#7"]);
    expect(tracking.prs[1]!.dependsOn).toEqual(["acme/infra#9"]);
    expect(tracking.prs[2]!.notes).toBe("A note.");
  });
});

describe("stackParents", () => {
  test("stacks a pull request on the one whose head is its base", async () => {
    const tracking = await fixture();
    expect(stackParents(tracking.prs, undefined)).toEqual(new Map([["acme/api#2", "acme/api#1"]]));
  });

  test("prefers live branches over the file", async () => {
    const tracking = await fixture();
    const state = currentLive(tracking);
    state.set("acme/api#2", live({ headRefName: "alice/endpoints", baseRefName: "main" }));
    state.set("acme/api#3", live({ headRefName: "alice/fix", baseRefName: "alice/schema" }));
    expect(stackParents(tracking.prs, state)).toEqual(new Map([["acme/api#3", "acme/api#1"]]));
  });

  test("ignores matching branches in other repositories", async () => {
    const tracking = await fixture();
    const state = currentLive(tracking);
    state.set("acme/web#7", live({ headRefName: "bob/ui", baseRefName: "alice/schema" }));
    expect(stackParents(tracking.prs, state).has("acme/web#7")).toBe(false);
  });

  test("breaks cycles so every chain ends at a root", async () => {
    const tracking = await fixture();
    const state = currentLive(tracking);
    state.set("acme/api#1", live({ headRefName: "alice/schema", baseRefName: "alice/endpoints" }));
    state.set("acme/api#3", live({ headRefName: "alice/fix", baseRefName: "alice/endpoints" }));

    const parents = stackParents(tracking.prs, state);
    expect(parents.has("acme/api#1")).toBe(false);
    expect(parents.get("acme/api#2")).toBe("acme/api#1");
    expect(parents.get("acme/api#3")).toBe("acme/api#2");
  });
});

describe("findTrackingFile", () => {
  test("walks up to the nearest TRACKING.yaml", async () => {
    const root = await mkdtemp(join(tmpdir(), "tracking-"));
    const nested = join(root, "a", "b");
    await mkdir(nested, { recursive: true });
    await writeFile(join(root, "TRACKING.yaml"), "acme/api: []\n");

    expect(await findTrackingFile(nested)).toBe(join(root, "TRACKING.yaml"));
  });
});

test("prUrl builds the GitHub URL", () => {
  expect(prUrl("acme/api", 1)).toBe("https://github.com/acme/api/pull/1");
});
