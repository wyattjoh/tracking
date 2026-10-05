// Merge file entries with live state into plain JSON for pipes and agents.

import type { LiveMap } from "./github.ts";
import { driftFields } from "./sync.ts";
import { type PrNode, prUrl, stackParents, type Tracking } from "./tracking.ts";

const prJson = (pr: PrNode, live: LiveMap | undefined, parents: Map<string, string>): Record<string, unknown> => {
  const state = live?.get(pr.id);
  return {
    repo: pr.repo,
    number: pr.number,
    url: prUrl(pr.repo, pr.number),
    owner: pr.owner,
    title: pr.title,
    status: pr.status,
    review: pr.review,
    head: pr.head,
    base: pr.base,
    notes: pr.notes,
    linear: pr.linear,
    depends_on: pr.dependsOn,
    labels: pr.labels,
    stacked_on: parents.get(pr.id) ?? null,
    live: state && {
      status: state.status,
      review: state.review,
      title: state.title,
      author: state.author,
      head: state.headRefName,
      base: state.baseRefName,
      labels: state.labels.map((label) => label.name),
    },
    drift: state ? driftFields(pr, state) : [],
  };
};

/**
 * Build the JSON view of a tracking file. Pull requests stay flat, with
 * `stacked_on` naming the inferred parent. Descriptions are omitted; read them
 * from the file or GitHub.
 *
 * @param tracking - The loaded file
 * @param live - Live state, when it could be fetched
 * @returns A JSON-serializable object
 */
export const toJson = (tracking: Tracking, live: LiveMap | undefined): Record<string, unknown> => {
  const parents = stackParents(tracking.prs, live);
  return {
    file: tracking.path,
    live: live !== undefined,
    repos: tracking.repos.map((group) => ({
      repo: group.repo,
      prs: group.prs.map((pr) => prJson(pr, live, parents)),
    })),
  };
};
