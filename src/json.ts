// Merge file entries with live state into plain JSON for pipes and agents.

import type { LiveMap } from "./github.ts";
import { driftFields } from "./sync.ts";
import { type PrNode, prUrl, type Tracking } from "./tracking.ts";

const prJson = (pr: PrNode, live: LiveMap | undefined): Record<string, unknown> => {
  const state = live?.get(pr.id);
  return {
    repo: pr.repo,
    number: pr.number,
    url: prUrl(pr.repo, pr.number),
    owner: pr.owner,
    title: pr.title,
    status: pr.status,
    head: pr.head,
    base: pr.base,
    notes: pr.notes,
    linear: pr.linear,
    depends_on: pr.dependsOn,
    live: state && {
      status: state.status,
      title: state.title,
      author: state.author,
      head: state.headRefName,
      base: state.baseRefName,
    },
    drift: state ? driftFields(pr, state) : [],
    stacked: pr.children.map((child) => prJson(child, live)),
  };
};

/**
 * Build the JSON view of a tracking file. Descriptions are omitted; read them
 * from the file or GitHub.
 *
 * @param tracking - The loaded file
 * @param live - Live state, when it could be fetched
 * @returns A JSON-serializable object
 */
export const toJson = (tracking: Tracking, live: LiveMap | undefined): Record<string, unknown> => ({
  file: tracking.path,
  live: live !== undefined,
  sections: tracking.sections.map((section) => ({
    name: section.name,
    repos: section.repos.map((group) => ({
      repo: group.repo,
      prs: group.prs.map((pr) => prJson(pr, live)),
    })),
  })),
});
