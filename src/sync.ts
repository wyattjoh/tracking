// Compare file entries with live GitHub state and write live fields back into
// the yaml Document, so comments, ordering and nesting survive.

import { type Document, Scalar, type YAMLMap } from "yaml";
import type { Live, LiveMap } from "./github.ts";
import { loadTracking, type PrNode, type Tracking } from "./tracking.ts";

/**
 * A field `sync` keeps in step with GitHub.
 */
export type SyncedField = "status" | "review" | "head" | "base" | "title" | "labels" | "description";

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

// Labels are compared as newline-joined names, which GitHub label names cannot contain.
const wanted = (live: Live): Record<SyncedField, string> => ({
  status: live.status,
  review: live.review ?? "",
  head: live.headRefName,
  base: live.baseRefName,
  title: live.title,
  labels: live.labels.map((label) => label.name).join("\n"),
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
    head: pr.head ?? "",
    base: pr.base ?? "",
    title: pr.title ?? "",
    labels: pr.labels.join("\n"),
    description: pr.description ?? "",
  };
  return (["status", "review", "head", "base", "title", "labels", "description"] as const).filter((field) => current[field] !== next[field]);
};

// Set a field, removing it when the value is empty. Labels become a flow
// sequence; the description a block literal.
const setField = (doc: Document, node: YAMLMap, key: SyncedField, value: string): void => {
  if (value === "") {
    node.delete(key);
    return;
  }

  if (key === "labels") {
    node.set(key, doc.createNode(value.split("\n"), { flow: true }));
    return;
  }

  const scalar = new Scalar(value);
  if (key === "description") scalar.type = Scalar.BLOCK_LITERAL;
  node.set(key, scalar);
};

/**
 * Apply live status, review, branches, title, labels and description to every entry in the document.
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
    for (const field of fields) setField(tracking.doc, pr.yaml, field, next[field]);
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

/**
 * Sync live state into the latest file, preserving edits made since loading.
 * Leave the file untouched when no fields changed.
 *
 * @param path - The tracking file path
 * @param live - Live state keyed by pull request id
 * @returns One change per pull request that differed
 */
export const syncTrackingFile = async (path: string, live: LiveMap): Promise<Change[]> => {
  const tracking = await loadTracking(path);
  const changes = syncTracking(tracking, live);
  if (changes.length > 0) await writeTracking(tracking);
  return changes;
};
