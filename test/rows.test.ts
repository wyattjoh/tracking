import { describe, expect, test } from "bun:test";
import { cycleGroup, cycleSub, type Row, visibleRows } from "../src/tui/rows.ts";
import { currentLive, fixture } from "./helpers.ts";

// One line per row: groups by key, PRs by guide, id and any outside parent.
const outline = (rows: Row[]): string[] =>
  rows.map((row) =>
    row.kind === "group"
      ? `${row.key} (${row.prs.length})`
      : `${row.guide} ${row.pr.id}${row.onParent === undefined ? "" : ` on #${row.onParent}`}`,
  );

describe("visibleRows", () => {
  test("groups by repo and draws stacks as trees", async () => {
    const tracking = await fixture();
    const rows = visibleRows(tracking, undefined, { group: "repo", sub: undefined }, undefined, new Set());

    expect(outline(rows)).toEqual([
      "repo:acme/api (3)",
      "├ acme/api#1",
      "│└ acme/api#2",
      "└ acme/api#3",
      "repo:acme/web (1)",
      "└ acme/web#7",
    ]);
  });

  test("splits a stack across status groups and marks the orphan", async () => {
    const tracking = await fixture();
    const rows = visibleRows(tracking, currentLive(tracking), { group: "status", sub: undefined }, undefined, new Set());

    expect(outline(rows)).toEqual([
      "status:open (2)",
      "├ acme/api#1",
      "└ acme/api#3",
      "status:draft (2)",
      "├ acme/api#2 on #1",
      "└ acme/web#7",
    ]);
  });

  test("puts the viewer first when grouping by author, then sub-groups", async () => {
    const tracking = await fixture();
    const rows = visibleRows(tracking, undefined, { group: "author", sub: "review" }, "bob", new Set());

    expect(outline(rows)).toEqual([
      "author:bob (1)",
      "author:bob/review:none (1)",
      "└ acme/web#7",
      "author:alice (3)",
      "author:alice/review:approved (1)",
      "└ acme/api#1",
      "author:alice/review:none (2)",
      "├ acme/api#2 on #1",
      "└ acme/api#3",
    ]);
  });

  test("hides the children of collapsed groups and PRs", async () => {
    const tracking = await fixture();
    const rows = visibleRows(
      tracking,
      undefined,
      { group: "repo", sub: undefined },
      undefined,
      new Set(["acme/api#1", "repo:acme/web"]),
    );

    expect(outline(rows)).toEqual(["repo:acme/api (3)", "├ acme/api#1", "└ acme/api#3", "repo:acme/web (1)"]);
  });
});

describe("cycling the view", () => {
  test("cycleGroup advances and clears a sub-group it would repeat", () => {
    expect(cycleGroup({ group: "repo", sub: "status" })).toEqual({ group: "author", sub: "status" });
    expect(cycleGroup({ group: "author", sub: "status" })).toEqual({ group: "status", sub: undefined });
    expect(cycleGroup({ group: "review", sub: undefined })).toEqual({ group: "repo", sub: undefined });
  });

  test("cycleSub runs through none and skips the group", () => {
    expect(cycleSub({ group: "author", sub: undefined })).toEqual({ group: "author", sub: "repo" });
    expect(cycleSub({ group: "author", sub: "repo" })).toEqual({ group: "author", sub: "status" });
    expect(cycleSub({ group: "author", sub: "review" })).toEqual({ group: "author", sub: undefined });
  });
});
