// Flatten the tracking tree into the rows the tree pane draws, skipping the
// children of collapsed nodes and computing tree guides for stacked PRs.

import type { PrNode, RepoGroup, Section, Tracking } from "../tracking.ts";

/**
 * One drawable line of the tree pane.
 */
export type Row =
  | { kind: "section"; key: string; section: Section; collapsed: boolean; parent: undefined }
  | { kind: "repo"; key: string; group: RepoGroup; collapsed: boolean; parent: string }
  | { kind: "pr"; key: string; pr: PrNode; guide: string; collapsed: boolean; parent: string };

const prRows = (prs: PrNode[], parent: string, prefix: string, collapsed: Set<string>): Row[] =>
  prs.flatMap((pr, index) => {
    const last = index === prs.length - 1;
    const isCollapsed = collapsed.has(pr.key);
    const row: Row = { kind: "pr", key: pr.key, pr, guide: `${prefix}${last ? "└" : "├"}`, collapsed: isCollapsed, parent };
    if (isCollapsed) return [row];
    return [row, ...prRows(pr.children, pr.key, `${prefix}${last ? " " : "│"}`, collapsed)];
  });

/**
 * Compute the visible rows of the tree.
 *
 * @param tracking - The loaded file
 * @param collapsed - Keys of collapsed sections, repos and PRs
 * @returns Rows in display order
 */
export const visibleRows = (tracking: Tracking, collapsed: Set<string>): Row[] =>
  tracking.sections.flatMap((section): Row[] => {
    const sectionRow: Row = { kind: "section", key: section.key, section, collapsed: collapsed.has(section.key), parent: undefined };
    if (sectionRow.collapsed) return [sectionRow];

    return [
      sectionRow,
      ...section.repos.flatMap((group): Row[] => {
        const repoRow: Row = { kind: "repo", key: group.key, group, collapsed: collapsed.has(group.key), parent: section.key };
        if (repoRow.collapsed) return [repoRow];
        return [repoRow, ...prRows(group.prs, group.key, "", collapsed)];
      }),
    ];
  });

/**
 * Whether a row has children it can collapse.
 *
 * @param row - The row
 * @returns True for sections, repos and PRs with stacked children
 */
export const canCollapse = (row: Row): boolean => row.kind !== "pr" || row.pr.children.length > 0;

/**
 * Count PRs under a section or repo, including stacked ones.
 *
 * @param prs - Top-level PRs
 * @returns Every PR in the subtree
 */
export const allPrs = (prs: PrNode[]): PrNode[] => prs.flatMap((pr) => [pr, ...allPrs(pr.children)]);
