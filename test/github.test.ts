import { expect, test } from "bun:test";
import { createLiveFetcher, toStatus } from "../src/github.ts";

test("toStatus maps GitHub state and draft flag", () => {
  expect(toStatus({ state: "MERGED", isDraft: false })).toBe("merged");
  expect(toStatus({ state: "CLOSED", isDraft: true })).toBe("closed");
  expect(toStatus({ state: "OPEN", isDraft: true })).toBe("draft");
  expect(toStatus({ state: "OPEN", isDraft: false })).toBe("open");
});

test("fetches each pull request once and omits ones GitHub did not find", async () => {
  const queries: string[] = [];
  const fetchLive = createLiveFetcher(async (query) => {
    queries.push(query);
    return {
      p0: {
        pullRequest: {
          state: "OPEN",
          isDraft: true,
          title: "t",
          body: "b",
          author: { login: "alice" },
          headRefName: "h",
          baseRefName: "main",
        },
      },
      p1: { pullRequest: null },
    };
  });

  const result = await fetchLive([
    { id: "acme/api#1", repo: "acme/api", number: 1 },
    { id: "acme/api#1", repo: "acme/api", number: 1 },
    { id: "acme/web#2", repo: "acme/web", number: 2 },
  ]);

  expect(queries).toHaveLength(1);
  expect(queries[0]).toContain('p0: repository(owner: "acme", name: "api") { pullRequest(number: 1)');
  expect(queries[0]).toContain('p1: repository(owner: "acme", name: "web") { pullRequest(number: 2)');
  expect([...result.keys()]).toEqual(["acme/api#1"]);
  expect(result.get("acme/api#1")).toEqual({
    status: "draft",
    title: "t",
    body: "b",
    author: "alice",
    headRefName: "h",
    baseRefName: "main",
  });
});
