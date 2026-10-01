// Locate, load and model a TRACKING.yaml file. The parsed yaml Document is kept
// alongside the model so sync can edit the original nodes in place.

import { dirname, join, resolve } from "node:path";
import { type Document, isMap, isScalar, isSeq, parseDocument, type YAMLMap } from "yaml";

/**
 * Lifecycle state of a pull request, as recorded in the file.
 */
export type Status = "draft" | "open" | "closed" | "merged";

/**
 * One pull request entry, with the entries stacked on top of it.
 */
export type PrNode = {
  key: string;
  id: string;
  repo: string;
  number: number;
  owner: string | undefined;
  title: string | undefined;
  status: string | undefined;
  head: string | undefined;
  base: string | undefined;
  notes: string | undefined;
  linear: string | undefined;
  dependsOn: string[];
  description: string | undefined;
  children: PrNode[];
  yaml: YAMLMap;
};

/**
 * The pull requests one section lists for one repository.
 */
export type RepoGroup = {
  key: string;
  repo: string;
  prs: PrNode[];
};

/**
 * A top-level section of the file, such as `pull_requests` or `related`.
 */
export type Section = {
  key: string;
  name: string;
  repos: RepoGroup[];
};

/**
 * A loaded tracking file.
 */
export type Tracking = {
  path: string;
  doc: Document;
  sections: Section[];
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

const toNode = (section: string, repo: string, node: unknown): PrNode[] => {
  if (!isMap(node)) return [];

  const number = node.get("number");
  const stacked = node.get("stacked");
  const children = isSeq(stacked) ? stacked.items.flatMap((child) => toNode(section, repo, child)) : [];
  if (typeof number !== "number") return children;

  const id = `${repo}#${number}`;
  return [
    {
      key: `${section}:${id}`,
      id,
      repo,
      number,
      owner: str(node, "owner"),
      title: str(node, "title"),
      status: str(node, "status"),
      head: str(node, "head"),
      base: str(node, "base"),
      notes: str(node, "notes"),
      linear: str(node, "linear"),
      dependsOn: strings(node, "depends_on"),
      description: str(node, "description"),
      children,
      yaml: node,
    },
  ];
};

const flatten = (prs: PrNode[]): PrNode[] => prs.flatMap((pr) => [pr, ...flatten(pr.children)]);

/**
 * Model an already-parsed tracking document.
 *
 * @param path - Absolute path the document was read from
 * @param doc - The parsed document
 * @returns The tracking model
 */
export const modelTracking = (path: string, doc: Document): Tracking => {
  const root = doc.contents;
  const sections: Section[] = isMap(root)
    ? root.items.flatMap(({ key, value }) => {
        const name = keyName(key);
        if (!isMap(value)) return [];

        const repos = value.items.flatMap(({ key: repoKey, value: list }) => {
          const repo = keyName(repoKey);
          if (!isSeq(list)) return [];
          return [{ key: `${name}:${repo}`, repo, prs: list.items.flatMap((item) => toNode(name, repo, item)) }];
        });
        return repos.length === 0 ? [] : [{ key: name, name, repos }];
      })
    : [];

  return {
    path,
    doc,
    sections,
    prs: sections.flatMap((section) => section.repos.flatMap((group) => flatten(group.prs))),
  };
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
