import { expect, test } from "bun:test";
import { toJson } from "../src/json.ts";
import { currentLive, fixture, live } from "./helpers.ts";

test("nests stacked pull requests and reports drift against live state", async () => {
  const tracking = await fixture();
  const state = currentLive(tracking);
  state.set("acme/api#2", live({ status: "merged", title: "feat: add the endpoints" }));

  const json = toJson(tracking, state) as {
    live: boolean;
    sections: { repos: { prs: { url: string; drift: string[]; stacked: { drift: string[]; live: unknown }[] }[] }[] }[];
  };
  const first = json.sections[0]!.repos[0]!.prs[0]!;

  expect(json.live).toBe(true);
  expect(first.url).toBe("https://github.com/acme/api/pull/1");
  expect(first.drift).toEqual([]);
  expect(first.stacked[0]!.drift).toEqual(["status"]);
});

test("reports no live state when the fetch failed", async () => {
  const json = toJson(await fixture(), undefined) as { live: boolean };
  expect(json.live).toBe(false);
});
