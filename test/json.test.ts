import { expect, test } from "bun:test";
import { toJson } from "../src/json.ts";
import { currentLive, fixture } from "./helpers.ts";

test("lists pull requests flat with their inferred parent and drift", async () => {
  const tracking = await fixture();
  const state = currentLive(tracking);
  state.set("acme/api#2", { ...state.get("acme/api#2")!, status: "merged" });

  const json = toJson(tracking, state) as {
    live: boolean;
    repos: { repo: string; prs: { url: string; drift: string[]; stacked_on: string | null }[] }[];
  };
  const [first, second] = json.repos[0]!.prs;

  expect(json.live).toBe(true);
  expect(json.repos.map((group) => group.repo)).toEqual(["acme/api", "acme/web"]);
  expect(first!.url).toBe("https://github.com/acme/api/pull/1");
  expect(first!.stacked_on).toBeNull();
  expect(first!.drift).toEqual([]);
  expect(second!.stacked_on).toBe("acme/api#1");
  expect(second!.drift).toEqual(["status"]);
});

test("reports no live state when the fetch failed", async () => {
  const json = toJson(await fixture(), undefined) as { live: boolean };
  expect(json.live).toBe(false);
});
