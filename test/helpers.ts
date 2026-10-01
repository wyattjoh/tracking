import { parseDocument } from "yaml";
import type { Live, LiveMap } from "../src/github.ts";
import { modelTracking, type Tracking } from "../src/tracking.ts";

export const FIXTURE = new URL("./fixtures/TRACKING.yaml", import.meta.url).pathname;

export const fixtureText = (): Promise<string> => Bun.file(FIXTURE).text();

export const fixture = async (): Promise<Tracking> => modelTracking(FIXTURE, parseDocument(await fixtureText()));

export const live = (overrides: Partial<Live> = {}): Live => ({
  status: "open",
  review: undefined,
  title: "title",
  body: "",
  author: "alice",
  headRefName: "head",
  baseRefName: "main",
  ...overrides,
});

// Live state that matches the fixture file exactly.
export const currentLive = (tracking: Tracking): LiveMap =>
  new Map(
    tracking.prs.map((pr) => [
      pr.id,
      live({
        status: pr.status as Live["status"],
        review: pr.review as Live["review"],
        title: pr.title ?? "",
        body: pr.description ?? "",
        author: pr.owner,
        headRefName: pr.head ?? "",
        baseRefName: pr.base ?? "",
      }),
    ]),
  );
