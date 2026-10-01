// Flatten the tracking file into the rows the tree pane draws: pull requests
// grouped by up to two dimensions, with each innermost group drawn as stack
// trees. Children of collapsed rows are skipped.

import type { LiveMap } from "../github.ts";
import { type PrNode, stackParents, type Tracking } from "../tracking.ts";

/**
 * A property pull requests can be grouped by.
 */
export type Dimension = "repo" | "author" | "status" | "review";

/**
 * How the tree is grouped: a top-level dimension and an optional sub-group.
 */
export type View = {
  group: Dimension;
  sub: Dimension | undefined;
};

/**
 * Every dimension, in the order `v` and `V` cycle through them.
 */
export const DIMENSIONS: Dimension[] = ["repo", "author", "status", "review"];

/**
 * One drawable line of the tree pane. `depth` counts the group levels above
 * the row.
 */
export type Row =
  | {
      kind: "group";
      key: string;
      depth: number;
      dimension: Dimension;
      value: string;
      prs: PrNode[];
      collapsed: boolean;
      parent: string | undefined;
    }
  | {
      kind: "pr";
      key: string;
      depth: number;
      pr: PrNode;
      guide: string;
      onParent: number | undefined;
      hasChildren: boolean;
      collapsed: boolean;
      parent: string;
    };

// Fixed display order for dimensions with a known set of values; unknown values sort last.
const RANKS: Partial<Record<Dimension, string[]>> = {
  status: ["open", "draft", "merged", "closed"],
  review: ["changes_requested", "review_required", "approved", "none"],
};

/**
 * The value a pull request has for a dimension, preferring live state.
 *
 * @param dimension - The dimension
 * @param pr - The file entry
 * @param live - Live state, when fetched
 * @returns The group value
 */
export const dimensionValue = (dimension: Dimension, pr: PrNode, live: LiveMap | undefined): string => {
  const state = live?.get(pr.id);
  if (dimension === "repo") return pr.repo;
  if (dimension === "author") return state?.author ?? pr.owner ?? "unknown";
  if (dimension === "status") return state?.status ?? pr.status ?? "unknown";
  return (state ? state.review : pr.review) ?? "none";
};

/**
 * Human-readable form of a group value.
 *
 * @param value - A value from `dimensionValue`
 * @returns The value with underscores as spaces
 */
export const valueLabel = (value: string): string => value.replaceAll("_", " ");

// Partition in first-appearance order, then apply the dimension's ordering.
const partition = (
  prs: PrNode[],
  dimension: Dimension,
  live: LiveMap | undefined,
  viewer: string | undefined,
): [string, PrNode[]][] => {
  const groups = [
    ...prs
      .reduce((found, pr) => {
        const value = dimensionValue(dimension, pr, live);
        return found.set(value, [...(found.get(value) ?? []), pr]);
      }, new Map<string, PrNode[]>())
      .entries(),
  ];

  if (dimension === "author") return groups.toSorted(([a], [b]) => Number(b === viewer) - Number(a === viewer));

  const rank = RANKS[dimension];
  if (!rank) return groups;
  const position = (value: string) => (rank.includes(value) ? rank.indexOf(value) : rank.length);
  return groups.toSorted(([a], [b]) => position(a) - position(b));
};

type Stacks = {
  parents: Map<string, string>;
  byId: Map<string, PrNode>;
};

// Draw the PRs of one group as stack trees. A PR whose parent sits in another
// group becomes a root here and records that parent's number.
const stackRows = (prs: PrNode[], stacks: Stacks, parent: string, depth: number, collapsed: Set<string>): Row[] => {
  const ids = new Set(prs.map((pr) => pr.id));
  const parentIn = (pr: PrNode) => {
    const id = stacks.parents.get(pr.id);
    return id !== undefined && ids.has(id) ? id : undefined;
  };
  const childrenOf = (id: string) => prs.filter((pr) => parentIn(pr) === id);

  const walk = (nodes: PrNode[], rowParent: string, prefix: string): Row[] =>
    nodes.flatMap((pr, index) => {
      const last = index === nodes.length - 1;
      const children = childrenOf(pr.id);
      const outside = rowParent === parent ? stacks.parents.get(pr.id) : undefined;
      const row: Row = {
        kind: "pr",
        key: pr.id,
        depth,
        pr,
        guide: `${prefix}${last ? "└" : "├"}`,
        onParent: outside === undefined ? undefined : stacks.byId.get(outside)?.number,
        hasChildren: children.length > 0,
        collapsed: collapsed.has(pr.id),
        parent: rowParent,
      };
      if (row.collapsed) return [row];
      return [row, ...walk(children, pr.id, `${prefix}${last ? " " : "│"}`)];
    });

  return walk(
    prs.filter((pr) => parentIn(pr) === undefined),
    parent,
    "",
  );
};

/**
 * Compute the visible rows of the tree.
 *
 * @param tracking - The loaded file
 * @param live - Live state, when fetched
 * @param view - The grouping to apply
 * @param viewer - The authenticated login, sorted first when grouping by author
 * @param collapsed - Keys of collapsed groups and PRs
 * @returns Rows in display order
 */
export const visibleRows = (
  tracking: Tracking,
  live: LiveMap | undefined,
  view: View,
  viewer: string | undefined,
  collapsed: Set<string>,
): Row[] => {
  const stacks: Stacks = {
    parents: stackParents(tracking.prs, live),
    byId: new Map(tracking.prs.map((pr) => [pr.id, pr])),
  };
  const dimensions = view.sub ? [view.group, view.sub] : [view.group];

  const build = (prs: PrNode[], depth: number, parent: string | undefined): Row[] => {
    const dimension = dimensions[depth];
    if (!dimension) return stackRows(prs, stacks, parent ?? "", depth, collapsed);

    return partition(prs, dimension, live, viewer).flatMap(([value, members]): Row[] => {
      const key = `${parent ? `${parent}/` : ""}${dimension}:${value}`;
      const row: Row = {
        kind: "group",
        key,
        depth,
        dimension,
        value,
        prs: members,
        collapsed: collapsed.has(key),
        parent,
      };
      return row.collapsed ? [row] : [row, ...build(members, depth + 1, key)];
    });
  };

  return build(tracking.prs, 0, undefined);
};

/**
 * Move the top-level grouping to the next dimension, clearing the sub-group
 * when it would repeat it.
 *
 * @param view - The current view
 * @returns The next view
 */
export const cycleGroup = (view: View): View => {
  const group = DIMENSIONS[(DIMENSIONS.indexOf(view.group) + 1) % DIMENSIONS.length]!;
  return { group, sub: view.sub === group ? undefined : view.sub };
};

/**
 * Move the sub-group to the next dimension, through none, skipping the
 * top-level one.
 *
 * @param view - The current view
 * @returns The next view
 */
export const cycleSub = (view: View): View => {
  const options = [undefined, ...DIMENSIONS.filter((dimension) => dimension !== view.group)];
  return { group: view.group, sub: options[(options.indexOf(view.sub) + 1) % options.length] };
};

/**
 * Describe a view for the header.
 *
 * @param view - The view
 * @returns The dimensions joined by `›`
 */
export const viewLabel = (view: View): string => (view.sub ? `${view.group} › ${view.sub}` : view.group);

/**
 * Whether a row has children it can collapse.
 *
 * @param row - The row
 * @returns True for groups and PRs with stacked children in view
 */
export const canCollapse = (row: Row): boolean => row.kind === "group" || row.hasChildren;
