// Fetch live pull request state from GitHub through `gh api graphql`, batching
// every pull request into as few requests as possible.

import { $ } from "bun";
import type { Review, Status } from "./tracking.ts";

/**
 * A label on a pull request, with GitHub's hex colour (no leading `#`).
 */
export type Label = {
  name: string;
  color: string;
};

/**
 * Live state of one pull request on GitHub.
 */
export type Live = {
  status: Status;
  review: Review | undefined;
  title: string;
  body: string;
  author: string | undefined;
  headRefName: string;
  baseRefName: string;
  labels: Label[];
};

/**
 * Map of pull request id (`owner/name#number`) to its live state. Pull requests
 * GitHub could not find are absent.
 */
export type LiveMap = Map<string, Live>;

/**
 * Runs one GraphQL query and returns its `data` object.
 */
export type GraphqlRunner = (query: string) => Promise<Record<string, unknown>>;

/**
 * Fetches live state for a set of pull requests.
 */
export type LiveFetcher = (prs: { id: string; repo: string; number: number }[]) => Promise<LiveMap>;

type RawPullRequest = {
  state: string;
  isDraft: boolean;
  reviewDecision: string | null;
  title: string;
  body: string;
  author: { login: string } | null;
  headRefName: string;
  baseRefName: string;
  labels: { nodes: Label[] };
};

// Bodies make responses large, so cap each request well under GitHub's limits.
const BATCH_SIZE = 40;

/**
 * Map GitHub's state and draft flag onto a tracking status.
 *
 * @param pr - The state and draft flag GitHub reports
 * @returns The tracking status
 */
export const toStatus = ({ state, isDraft }: { state: string; isDraft: boolean }): Status => {
  if (state === "MERGED") return "merged";
  if (state === "CLOSED") return "closed";
  return isDraft ? "draft" : "open";
};

/**
 * Map GitHub's review decision onto a tracking review. Only open, non-draft
 * pull requests carry one.
 *
 * @param pr - The state, draft flag and review decision GitHub reports
 * @returns The tracking review, or undefined when there is none to show
 */
export const toReview = ({
  state,
  isDraft,
  reviewDecision,
}: {
  state: string;
  isDraft: boolean;
  reviewDecision: string | null;
}): Review | undefined => {
  if (state !== "OPEN" || isDraft) return undefined;
  if (reviewDecision === "APPROVED") return "approved";
  if (reviewDecision === "CHANGES_REQUESTED") return "changes_requested";
  if (reviewDecision === "REVIEW_REQUIRED") return "review_required";
  return undefined;
};

/**
 * Run a GraphQL query through the authenticated `gh` CLI.
 *
 * @param query - The GraphQL query
 * @returns The response's `data` object
 */
export const ghGraphql: GraphqlRunner = async (query) => {
  const response = (await $`gh api graphql -f query=${query}`.quiet().json()) as { data: Record<string, unknown> };
  return response.data;
};

/**
 * Read the login of the user `gh` is authenticated as.
 *
 * @returns The GitHub login
 */
export const ghViewer = async (): Promise<string> => (await $`gh api user --jq .login`.quiet().text()).trim();

/**
 * Create a fetcher that reads pull requests through `run`.
 *
 * @param run - GraphQL runner, `gh` by default
 * @returns A fetcher returning live state keyed by pull request id
 */
export const createLiveFetcher =
  (run: GraphqlRunner = ghGraphql): LiveFetcher =>
  async (prs) => {
    const unique = [...new Map(prs.map((pr) => [pr.id, pr])).values()];
    const batches = Array.from({ length: Math.ceil(unique.length / BATCH_SIZE) }, (_, i) =>
      unique.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE),
    );

    const results = await Promise.all(
      batches.map(async (batch) => {
        const query = `{ ${batch
          .map(({ repo, number }, i) => {
            const [owner, name] = repo.split("/");
            return `p${i}: repository(owner: "${owner}", name: "${name}") { pullRequest(number: ${number}) { state isDraft reviewDecision title body author { login } headRefName baseRefName labels(first: 20, orderBy: { field: NAME, direction: ASC }) { nodes { name color } } } }`;
          })
          .join(" ")} }`;

        const data = await run(query);
        return batch.flatMap(({ id }, i): [string, Live][] => {
          const pr = (data[`p${i}`] as { pullRequest: RawPullRequest | null } | null)?.pullRequest;
          if (!pr) return [];
          return [
            [
              id,
              {
                status: toStatus(pr),
                review: toReview(pr),
                title: pr.title,
                body: pr.body,
                author: pr.author?.login,
                headRefName: pr.headRefName,
                baseRefName: pr.baseRefName,
                labels: pr.labels.nodes,
              },
            ],
          ];
        });
      }),
    );

    return new Map(results.flat());
  };
