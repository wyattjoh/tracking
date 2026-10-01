// Locate, load and model a TRACKING.yaml file: a map of repository to a flat
// list of pull requests, with stacks inferred from head and base branches. The
// parsed yaml Document is kept alongside the model so sync can edit the
// original nodes in place.

import { dirname, join, resolve } from "node:path";
import type { LiveMap } from "./github.ts";
import { type Document, isMap, isScalar, isSeq, parseDocument, type YAMLMap } from "yaml";

/**
 * Lifecycle state of a pull request, as recorded in the file.
 */
export type Status = "draft" | "open" | "closed" | "merged";

/**
 * GitHub's review decision for an open pull request, as recorded in the file.
 */
export type Review = "approved" | "changes_requested" | "review_required";

/**
 * One pull request entry. Stacking is not stored; see `stackParents`.
 */
export type PrNode = {
  id: string;
  repo: string;
  number: number;
  owner: string | undefined;
  title: string | undefined;
  status: string | undefined;
  review: string | undefined;
  head: string | undefined;
  base: string | undefined;
  notes: string | undefined;
  linear: string | undefined;
  dependsOn: string[];
  description: string | undefined;
  yaml: YAMLMap;
};

/**
 * The pull requests the file lists for one repository.
 */
export type RepoGroup = {
  repo: string;
  prs: PrNode[];
};

/**
 * A loaded tracking file.
 */
export type Tracking = {
  path: string;
  doc: Document;
  repos: RepoGroup[];
  prs: PrNode[];
};

const FILE_NAME = "TRACKING.yaml";

/**
 * Find the nearest TRACKING.yaml at or above `cwd`.
 *
 * @param cwd - Directory to start from
 * @returns The absolute path, or undefined when no file exists up to the root
 */
export const findTrackingFile = async (cwd: string): Promise<string | undefined> => {
  let dir = resolve(cwd);
  while (true) {
    const candidate = join(dir, FILE_NAME);
    if (await Bun.file(candidate).exists()) return candidate;

    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
};

/**
 * Build the GitHub URL of a pull request.
 *
 * @param repo - Repository as `owner/name`
 * @param number - Pull request number
 * @returns The pull request URL
 */
export const prUrl = (repo: string, number: number): string => `https://github.com/${repo}/pull/${number}`;

const str = (node: YAMLMap, key: string): string | undefined => {
  const value = node.get(key);
  return typeof value === "string" ? value : typeof value === "number" ? String(value) : undefined;
};

const strings = (node: YAMLMap, key: string): string[] => {
  const value = node.get(key);
  if (!isSeq(value)) return [];
  return value.items.flatMap((item) => (isScalar(item) && typeof item.value === "string" ? [item.value] : []));
};

const keyName = (key: unknown): string => String(isScalar(key) ? key.value : key);

const toNode = (repo: string, node: unknown): PrNode[] => {
  if (!isMap(node)) return [];

  const number = node.get("number");
  if (typeof number !== "number") return [];

  return [
    {
      id: `${repo}#${number}`,
      repo,
      number,
      owner: str(node, "owner"),
      title: str(node, "title"),
      status: str(node, "status"),
      review: str(node, "review"),
      head: str(node, "head"),
      base: str(node, "base"),
      notes: str(node, "notes"),
      linear: str(node, "linear"),
      dependsOn: strings(node, "depends_on"),
      description: str(node, "description"),
      yaml: node,
    },
  ];
};

/**
 * Model an already-parsed tracking document.
 *
 * @param path - Absolute path the document was read from
 * @param doc - The parsed document
 * @returns The tracking model
 */
export const modelTracking = (path: string, doc: Document): Tracking => {
  const root = doc.contents;
  const repos: RepoGroup[] = isMap(root)
    ? root.items.flatMap(({ key, value }) => {
        const repo = keyName(key);
        if (!isSeq(value)) return [];
        return [{ repo, prs: value.items.flatMap((item) => toNode(repo, item)) }];
      })
    : [];

  return { path, doc, repos, prs: repos.flatMap((group) => group.prs) };
};

/**
 * Infer stacks: a pull request is stacked on the first pull request in the
 * same repository whose head branch is its base branch. Live branches win over
 * the file's, and a chain that loops back on itself is broken at the loop.
 *
 * @param prs - Pull requests in file order
 * @param live - Live state, when it has been fetched
 * @returns Parent id keyed by child id; roots are absent
 */
export const stackParents = (prs: PrNode[], live: LiveMap | undefined): Map<string, string> => {
  const head = (pr: PrNode) => live?.get(pr.id)?.headRefName ?? pr.head;
  const base = (pr: PrNode) => live?.get(pr.id)?.baseRefName ?? pr.base;

  const byHead = prs.reduce((found, pr) => {
    const branch = head(pr);
    const key = `${pr.repo}:${branch}`;
    return branch === undefined || found.has(key) ? found : found.set(key, pr.id);
  }, new Map<string, string>());

  const parents = new Map(
    prs.flatMap((pr): [string, string][] => {
      const branch = base(pr);
      const parent = branch === undefined ? undefined : byHead.get(`${pr.repo}:${branch}`);
      return parent === undefined || parent === pr.id ? [] : [[pr.id, parent]];
    }),
  );

  // Drop the link that closes each cycle so every chain ends at a root.
  for (const id of parents.keys()) {
    const seen = new Set([id]);
    let current = parents.get(id);
    while (current !== undefined && !seen.has(current)) {
      seen.add(current);
      current = parents.get(current);
    }
    if (current === id) parents.delete(id);
  }

  return parents;
};

/**
 * Read and model a tracking file.
 *
 * @param path - Path to the file
 * @returns The tracking model
 */
export const loadTracking = async (path: string): Promise<Tracking> => {
  const absolute = resolve(path);
  return modelTracking(absolute, parseDocument(await Bun.file(absolute).text()));
};
