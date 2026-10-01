import { describe, expect, test } from "bun:test";
import {
  applyFilters,
  cycleGroup,
  cycleSub,
  filterLabel,
  filterOptions,
  modalItems,
  type Row,
  toggleFilter,
  visibleRows,
} from "../src/tui/rows.ts";
import { DEFAULT_SETTINGS, type Filters } from "../src/view.ts";
import { currentLive, fixture } from "./helpers.ts";

const NONE: Filters = { repo: new Set(), author: new Set(), status: new Set(), review: new Set() };

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
    const rows = visibleRows(tracking, undefined, { group: "repo", sub: undefined }, NONE, undefined, new Set());

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
    const rows = visibleRows(tracking, currentLive(tracking), { group: "status", sub: undefined }, NONE, undefined, new Set());

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
    const rows = visibleRows(tracking, undefined, { group: "author", sub: "review" }, NONE, "bob", new Set());

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
      NONE,
      undefined,
      new Set(["acme/api#1", "repo:acme/web"]),
    );

    expect(outline(rows)).toEqual(["repo:acme/api (3)", "├ acme/api#1", "└ acme/api#3", "repo:acme/web (1)"]);
  });
});

describe("filters", () => {
  test("combine dimensions with AND and values with OR, and empty keeps all", async () => {
    const tracking = await fixture();
    const ids = (filters: Filters) => applyFilters(tracking.prs, filters, undefined).map((pr) => pr.id);

    expect(ids(NONE)).toHaveLength(4);
    expect(ids({ ...NONE, status: new Set(["open", "merged"]) })).toEqual(["acme/api#1", "acme/api#3"]);
    expect(ids({ ...NONE, status: new Set(["draft"]), author: new Set(["alice"]) })).toEqual(["acme/api#2"]);
  });

  test("default to open and draft, which hides merged pull requests", async () => {
    const tracking = await fixture();
    const state = currentLive(tracking);
    state.set("acme/api#3", { ...state.get("acme/api#3")!, status: "merged" });

    const ids = applyFilters(tracking.prs, DEFAULT_SETTINGS.filters, state).map((pr) => pr.id);
    expect(ids).toEqual(["acme/api#1", "acme/api#2", "acme/web#7"]);
    expect(filterLabel(DEFAULT_SETTINGS.filters)).toBe("status open, draft");
  });

  test("a filtered-out parent leaves its child as a root marked on #N", async () => {
    const tracking = await fixture();
    const rows = visibleRows(
      tracking,
      undefined,
      { group: "repo", sub: undefined },
      { ...NONE, status: new Set(["draft"]) },
      undefined,
      new Set(),
    );

    expect(outline(rows)).toEqual(["repo:acme/api (1)", "└ acme/api#2 on #1", "repo:acme/web (1)", "└ acme/web#7"]);
  });

  test("toggleFilter adds and removes a value without touching the original", () => {
    const added = toggleFilter(NONE, "author", "bob");
    expect([...added.author]).toEqual(["bob"]);
    expect(NONE.author.size).toBe(0);
    expect(toggleFilter(added, "author", "bob").author.size).toBe(0);
  });

  test("filterOptions lists known statuses and reviews, then values found", async () => {
    const tracking = await fixture();
    const options = filterOptions(tracking, undefined, "bob");

    expect(options.status).toEqual(["open", "draft", "merged", "closed"]);
    expect(options.review).toEqual(["changes_requested", "review_required", "approved", "none"]);
    expect(options.author).toEqual(["bob", "alice"]);
    expect(options.repo).toEqual(["acme/api", "acme/web"]);
  });

  test("modalItems puts the grouping first, then a section per dimension", async () => {
    const items = modalItems(filterOptions(await fixture(), undefined, undefined));

    expect(items.slice(0, 4)).toEqual([
      { kind: "group" },
      { kind: "sub" },
      { kind: "heading", dimension: "status" },
      { kind: "filter", dimension: "status", value: "open" },
    ]);
    expect(items.filter((item) => item.kind === "heading").map((item) => item.dimension)).toEqual([
      "status",
      "review",
      "author",
      "repo",
    ]);
  });
});

describe("cycling the view", () => {
  test("cycleGroup advances and clears a sub-group it would repeat", () => {
    expect(cycleGroup({ group: "repo", sub: "status" })).toEqual({ group: "author", sub: "status" });
    expect(cycleGroup({ group: "author", sub: "status" })).toEqual({ group: "status", sub: undefined });
    expect(cycleGroup({ group: "review", sub: undefined })).toEqual({ group: "repo", sub: undefined });
    expect(cycleGroup({ group: "repo", sub: undefined }, -1)).toEqual({ group: "review", sub: undefined });
  });

  test("cycleSub runs through none and skips the group", () => {
    expect(cycleSub({ group: "author", sub: undefined })).toEqual({ group: "author", sub: "repo" });
    expect(cycleSub({ group: "author", sub: "repo" })).toEqual({ group: "author", sub: "status" });
    expect(cycleSub({ group: "author", sub: "review" })).toEqual({ group: "author", sub: undefined });
    expect(cycleSub({ group: "author", sub: undefined }, -1)).toEqual({ group: "author", sub: "review" });
  });
});
