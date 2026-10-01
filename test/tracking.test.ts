import { describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findTrackingFile, prUrl } from "../src/tracking.ts";
import { fixture } from "./helpers.ts";

describe("modelTracking", () => {
  test("models sections, repos and stacked pull requests in file order", async () => {
    const tracking = await fixture();

    expect(tracking.sections.map((section) => section.name)).toEqual(["pull_requests", "related"]);
    expect(tracking.prs.map((pr) => pr.id)).toEqual(["acme/api#1", "acme/api#2", "acme/api#3", "acme/web#7"]);

    const [first] = tracking.sections[0]!.repos[0]!.prs;
    expect(first!.children.map((child) => child.id)).toEqual(["acme/api#2"]);
    expect(first!.children[0]!.dependsOn).toEqual(["acme/infra#9"]);
    expect(tracking.prs[2]!.notes).toBe("A note.");
  });

  test("keys entries by section so a PR can appear in two sections", async () => {
    const tracking = await fixture();
    expect(tracking.prs.map((pr) => pr.key)).toContain("related:acme/web#7");
  });
});

describe("findTrackingFile", () => {
  test("walks up to the nearest TRACKING.yaml", async () => {
    const root = await mkdtemp(join(tmpdir(), "tracking-"));
    const nested = join(root, "a", "b");
    await mkdir(nested, { recursive: true });
    await writeFile(join(root, "TRACKING.yaml"), "pull_requests: {}\n");

    expect(await findTrackingFile(nested)).toBe(join(root, "TRACKING.yaml"));
  });
});

test("prUrl builds the GitHub URL", () => {
  expect(prUrl("acme/api", 1)).toBe("https://github.com/acme/api/pull/1");
});
