// Flatten the tracking file into the rows the tree pane draws: pull requests
// filtered, then grouped by up to two dimensions, with each innermost group
// drawn as stack trees. Children of collapsed rows are skipped. Also models the
// view modal that controls grouping and filters.

import type { LiveMap } from "../github.ts";
import { type PrNode, stackParents, type Tracking } from "../tracking.ts";
import { DIMENSIONS, type Dimension, type FilterKey, type Filters, type View } from "../view.ts";

/**
 * The order filter sections appear in the view modal and header.
 */
export const FILTER_ORDER: FilterKey[] = ["status", "review", "author", "repo", "label"];

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
 * The label names a pull request carries, preferring live state.
 *
 * @param pr - The file entry
 * @param live - Live state, when fetched
 * @returns Label names
 */
export const labelNames = (pr: PrNode, live: LiveMap | undefined): string[] =>
  live?.get(pr.id)?.labels.map((label) => label.name) ?? pr.labels;

/**
 * Human-readable form of a group value.
 *
 * @param value - A value from `dimensionValue`
 * @returns The value with underscores as spaces
 */
export const valueLabel = (value: string): string => value.replaceAll("_", " ");

/**
 * Display form of a group's value: logins get an `@`, review values lose their
 * underscores, and repos are shown as they are.
 *
 * @param dimension - The group's dimension
 * @param value - The group's value
 * @returns The label to draw
 */
export const groupLabel = (dimension: Dimension, value: string): string => {
  if (dimension === "review") return valueLabel(value);
  if (dimension === "author" && value !== "unknown") return `@${value}`;
  return value;
};

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

/**
 * Keep the pull requests every non-empty filter allows.
 *
 * @param prs - Pull requests in file order
 * @param filters - The filters to apply
 * @param live - Live state, when fetched
 * @returns The pull requests that pass, in the same order
 */
export const applyFilters = (prs: PrNode[], filters: Filters, live: LiveMap | undefined): PrNode[] => {
  const wanted = [...filters.label].filter((value) => !value.startsWith("!"));
  const unwanted = [...filters.label].flatMap((value) => (value.startsWith("!") ? [value.slice(1)] : []));
  return prs.filter((pr) => {
    const labels = labelNames(pr, live);
    return (
      DIMENSIONS.every((dimension) => {
        const allowed = filters[dimension];
        return allowed.size === 0 || allowed.has(dimensionValue(dimension, pr, live));
      }) &&
      (wanted.length === 0 || wanted.some((name) => labels.includes(name))) &&
      !unwanted.some((name) => labels.includes(name))
    );
  });
};

/**
 * The values each dimension can be filtered by, in display order. Status and
 * review always offer their known values, then any others found. Labels are
 * listed by name.
 *
 * @param tracking - The loaded file
 * @param live - Live state, when fetched
 * @param viewer - The authenticated login, listed first for authors
 * @returns Values keyed by dimension
 */
export const filterOptions = (
  tracking: Tracking,
  live: LiveMap | undefined,
  viewer: string | undefined,
): Record<FilterKey, string[]> => {
  const values = (dimension: Dimension) => {
    const found = partition(tracking.prs, dimension, live, viewer).map(([value]) => value);
    const known = RANKS[dimension] ?? [];
    return [...known, ...found.filter((value) => !known.includes(value))];
  };
  const labels = [...new Set(tracking.prs.flatMap((pr) => labelNames(pr, live)))].toSorted((a, b) => a.localeCompare(b));
  return {
    repo: values("repo"),
    author: values("author"),
    status: values("status"),
    review: values("review"),
    label: labels,
  };
};

/**
 * Add a value to a filter, or remove it if present. A label instead cycles
 * from unset to wanted (`name`) to unwanted (`!name`) and back.
 *
 * @param filters - The current filters
 * @param key - The filter key
 * @param value - The value to toggle
 * @returns The new filters
 */
export const toggleFilter = (filters: Filters, key: FilterKey, value: string): Filters => {
  const next = new Set(filters[key]);
  if (key === "label") {
    if (next.delete(value)) next.add(`!${value}`);
    else if (!next.delete(`!${value}`)) next.add(value);
    return { ...filters, [key]: next };
  }
  if (!next.delete(value)) next.add(value);
  return { ...filters, [key]: next };
};

/**
 * Remove every value from one filter.
 *
 * @param filters - The current filters
 * @param key - The filter key to clear
 * @returns The new filters
 */
export const clearFilter = (filters: Filters, key: FilterKey): Filters => ({ ...filters, [key]: new Set() });

/**
 * Display form of a filter value: unwanted labels read `not name`, and
 * dimension values are shown as their groups are.
 *
 * @param key - The filter key
 * @param value - The filter value
 * @returns The label to draw
 */
export const filterValueLabel = (key: FilterKey, value: string): string => {
  if (key !== "label") return groupLabel(key, value);
  return value.startsWith("!") ? `not ${value.slice(1)}` : value;
};

/**
 * Describe the active filters for the header.
 *
 * @param filters - The filters
 * @returns Each filter key with its values, or an empty string
 */
export const filterLabel = (filters: Filters): string =>
  FILTER_ORDER.filter((key) => filters[key].size > 0)
    .map((key) => `${key} ${[...filters[key]].map((value) => filterValueLabel(key, value)).join(", ")}`)
    .join("; ");

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
 * @param filters - Which pull requests to show
 * @param viewer - The authenticated login, sorted first when grouping by author
 * @param collapsed - Keys of collapsed groups and PRs
 * @returns Rows in display order
 */
export const visibleRows = (
  tracking: Tracking,
  live: LiveMap | undefined,
  view: View,
  filters: Filters,
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

  // Stacks come from every PR, so a child whose parent is filtered out shows `on #N`.
  return build(applyFilters(tracking.prs, filters, live), 0, undefined);
};

const wrap = (index: number, length: number): number => (index + length) % length;

/**
 * Move the top-level grouping to the next or previous dimension, clearing the
 * sub-group when it would repeat it.
 *
 * @param view - The current view
 * @param step - 1 for the next dimension, -1 for the previous
 * @returns The next view
 */
export const cycleGroup = (view: View, step: 1 | -1 = 1): View => {
  const group = DIMENSIONS[wrap(DIMENSIONS.indexOf(view.group) + step, DIMENSIONS.length)]!;
  return { group, sub: view.sub === group ? undefined : view.sub };
};

/**
 * Move the sub-group to the next or previous dimension, through none, skipping
 * the top-level one.
 *
 * @param view - The current view
 * @param step - 1 for the next dimension, -1 for the previous
 * @returns The next view
 */
export const cycleSub = (view: View, step: 1 | -1 = 1): View => {
  const options = [undefined, ...DIMENSIONS.filter((dimension) => dimension !== view.group)];
  return { group: view.group, sub: options[wrap(options.indexOf(view.sub) + step, options.length)] };
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

/**
 * One line of the view modal. Headings label a filter section and cannot be
 * selected.
 */
export type ModalItem =
  | { kind: "group" }
  | { kind: "sub" }
  | { kind: "heading"; dimension: FilterKey }
  | { kind: "filter"; dimension: FilterKey; value: string };

/**
 * Lay out the view modal: the group and sub-group, then a checklist per
 * filter key.
 *
 * @param options - Filterable values per filter key
 * @returns Modal lines in display order
 */
export const modalItems = (options: Record<FilterKey, string[]>): ModalItem[] => [
  { kind: "group" },
  { kind: "sub" },
  ...FILTER_ORDER.flatMap((dimension): ModalItem[] => [
    { kind: "heading", dimension },
    ...options[dimension].map((value): ModalItem => ({ kind: "filter", dimension, value })),
  ]),
];
