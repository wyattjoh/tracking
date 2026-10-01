// Compare file entries with live GitHub state and write live fields back into
// the yaml Document, so comments, ordering and nesting survive.

import { Scalar, type YAMLMap } from "yaml";
import type { Live, LiveMap } from "./github.ts";
import type { PrNode, Tracking } from "./tracking.ts";

/**
 * A field `sync` keeps in step with GitHub.
 */
export type SyncedField = "status" | "review" | "title" | "description";

/**
 * The fields of one pull request that sync changed, or would change.
 */
export type Change = {
  id: string;
  fields: SyncedField[];
};

/**
 * Normalize a pull request body for storage. Block literals cannot carry
 * trailing whitespace or CRLF, so both are removed.
 *
 * @param body - The raw body from GitHub
 * @returns The normalized description
 */
export const toDescription = (body: string): string =>
  body
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();

const wanted = (live: Live): Record<SyncedField, string> => ({
  status: live.status,
  review: live.review ?? "",
  title: live.title,
  description: toDescription(live.body),
});

/**
 * List the synced fields where the file disagrees with GitHub.
 *
 * @param pr - The file entry
 * @param live - Its live state
 * @returns Fields that differ, in a stable order
 */
export const driftFields = (pr: PrNode, live: Live): SyncedField[] => {
  const next = wanted(live);
  const current: Record<SyncedField, string> = {
    status: pr.status ?? "",
    review: pr.review ?? "",
    title: pr.title ?? "",
    description: pr.description ?? "",
  };
  return (["status", "review", "title", "description"] as const).filter((field) => current[field] !== next[field]);
};

// Set a scalar field, inserting new keys before `stacked` so children stay last.
const setField = (tracking: Tracking, node: YAMLMap, key: string, value: string, block: boolean): void => {
  if (value === "") {
    node.delete(key);
    return;
  }

  const scalar = new Scalar(value);
  if (block) scalar.type = Scalar.BLOCK_LITERAL;

  if (node.has(key)) {
    node.set(key, scalar);
    return;
  }

  const pair = tracking.doc.createPair(key, scalar);
  const index = node.items.findIndex((item) => String((item.key as Scalar | undefined)?.value ?? item.key) === "stacked");
  node.items.splice(index === -1 ? node.items.length : index, 0, pair);
};

/**
 * Apply live status, review, title and description to every entry in the document.
 * The model's plain fields are not refreshed; reload the file after writing.
 *
 * @param tracking - The loaded file
 * @param live - Live state keyed by pull request id
 * @returns One change per pull request that differed
 */
export const syncTracking = (tracking: Tracking, live: LiveMap): Change[] =>
  tracking.prs.flatMap((pr) => {
    const state = live.get(pr.id);
    if (!state) return [];

    const fields = driftFields(pr, state);
    if (fields.length === 0) return [];

    const next = wanted(state);
    for (const field of fields) setField(tracking, pr.yaml, field, next[field], field === "description");
    return [{ id: pr.id, fields }];
  });

/**
 * Serialize the document without line wrapping, so titles stay on one line.
 *
 * @param tracking - The loaded file
 * @returns The file contents
 */
export const serializeTracking = (tracking: Tracking): string => tracking.doc.toString({ lineWidth: 0 });

/**
 * Write the document back to its path.
 *
 * @param tracking - The loaded file
 */
export const writeTracking = async (tracking: Tracking): Promise<void> => {
  await Bun.write(tracking.path, serializeTracking(tracking));
};
