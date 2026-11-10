// View settings: how the interactive view groups and filters pull requests,
// stored under the top-level `view` key of the tracking file.

import { type Document, isMap, isScalar, isSeq, type YAMLMap } from "yaml";
import { writeTracking } from "./sync.ts";
import { loadTracking, type Tracking } from "./tracking.ts";

/**
 * A property pull requests can be grouped and filtered by.
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
 * Something pull requests can be filtered by: a dimension, or their labels.
 * Labels filter but do not group, since a pull request can carry several.
 */
export type FilterKey = Dimension | "label";

/**
 * Values to keep per filter key. An empty set keeps every value; keys combine
 * with AND and values within one with OR. A label value is a label name the
 * pull request must carry, or `!name` for one it must not; the pull request
 * needs any of the wanted labels and none of the unwanted ones.
 */
export type Filters = Record<FilterKey, Set<string>>;

/**
 * Grouping and filters together, as saved in the file.
 */
export type ViewSettings = {
  view: View;
  filters: Filters;
};

/**
 * Every dimension, in the order the view modal cycles through them.
 */
export const DIMENSIONS: Dimension[] = ["repo", "author", "status", "review"];

/**
 * Every filter key.
 */
export const FILTER_KEYS: FilterKey[] = [...DIMENSIONS, "label"];

/**
 * The settings used when the file has no `view` key: grouped by repo then
 * author, showing open and draft pull requests only.
 */
export const DEFAULT_SETTINGS: ViewSettings = {
  view: { group: "repo", sub: "author" },
  filters: {
    repo: new Set(),
    author: new Set(),
    status: new Set(["open", "draft"]),
    review: new Set(),
    label: new Set(),
  },
};

const VIEW_KEY = "view";

const isDimension = (value: unknown): value is Dimension => DIMENSIONS.includes(value as Dimension);

const scalars = (node: unknown): string[] =>
  isSeq(node) ? node.items.flatMap((item) => (isScalar(item) && typeof item.value === "string" ? [item.value] : [])) : [];

/**
 * Read the view settings from a tracking document. Unknown dimensions are
 * ignored, and a missing `view` key gives the defaults.
 *
 * @param doc - The parsed tracking document
 * @returns The saved settings, or the defaults
 */
export const readViewSettings = (doc: Document): ViewSettings => {
  const root = doc.contents;
  const node = isMap(root) ? root.get(VIEW_KEY, true) : undefined;
  if (!isMap(node)) return DEFAULT_SETTINGS;

  const savedGroup = node.get("group");
  const sub = node.get("sub");
  const group = isDimension(savedGroup) ? savedGroup : DEFAULT_SETTINGS.view.group;
  const view: View = { group, sub: isDimension(sub) && sub !== group ? sub : undefined };

  const saved = node.get("filters", true);
  const filters = Object.fromEntries(
    FILTER_KEYS.map((key) => [key, new Set(isMap(saved) ? scalars(saved.get(key, true)) : [])]),
  ) as Filters;

  return { view, filters };
};

/**
 * Compare two settings by value.
 *
 * @param a - One settings value
 * @param b - The other
 * @returns True when grouping and every filter match
 */
export const sameSettings = (a: ViewSettings, b: ViewSettings): boolean =>
  a.view.group === b.view.group &&
  a.view.sub === b.view.sub &&
  FILTER_KEYS.every(
    (key) => a.filters[key].size === b.filters[key].size && [...a.filters[key]].every((value) => b.filters[key].has(value)),
  );

/**
 * Set the `view` key of a tracking document, placing it first when new.
 *
 * @param doc - The parsed tracking document
 * @param settings - The settings to store
 */
export const writeViewSettings = (doc: Document, settings: ViewSettings): void => {
  // A file with no entries yet, such as a fresh `tracking init`, has no root map.
  if (doc.contents === null) doc.contents = doc.createNode({}) as YAMLMap;
  const root = doc.contents;
  if (!isMap(root)) return;

  const filters = doc.createNode(
    Object.fromEntries(
      FILTER_KEYS.filter((key) => settings.filters[key].size > 0).map((key) => [key, [...settings.filters[key]]]),
    ),
  ) as YAMLMap;
  filters.flow = true;
  for (const pair of filters.items) if (isSeq(pair.value)) pair.value.flow = true;

  const node = doc.createNode({ group: settings.view.group, ...(settings.view.sub ? { sub: settings.view.sub } : {}) }) as YAMLMap;
  node.set("filters", filters);

  if (root.has(VIEW_KEY)) {
    root.set(VIEW_KEY, node);
    return;
  }

  // Keep the blank line between `view` and the first repository.
  const first = root.items[0]?.key;
  if (isScalar(first)) first.spaceBefore = true;
  root.items.unshift(doc.createPair(VIEW_KEY, node));
};

/**
 * Save view settings into the file on disk. The file is read fresh first, so
 * edits made since it was loaded survive.
 *
 * @param path - Path to the tracking file
 * @param settings - The settings to store
 * @returns The file as written
 */
export const saveViewSettings = async (path: string, settings: ViewSettings): Promise<Tracking> => {
  const tracking = await loadTracking(path);
  writeViewSettings(tracking.doc, settings);
  await writeTracking(tracking);
  return tracking;
};
