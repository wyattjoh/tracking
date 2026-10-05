import { describe, expect, test } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseDocument } from "yaml";
import { serializeTracking } from "../src/sync.ts";
import { modelTracking } from "../src/tracking.ts";
import {
  DEFAULT_SETTINGS,
  readViewSettings,
  sameSettings,
  saveViewSettings,
  type ViewSettings,
  writeViewSettings,
} from "../src/view.ts";
import { FIXTURE, fixture, fixtureText } from "./helpers.ts";

const settings: ViewSettings = {
  view: { group: "status", sub: "author" },
  filters: {
    repo: new Set(),
    author: new Set(["alice"]),
    status: new Set(["open", "merged"]),
    review: new Set(),
    label: new Set(["backend", "!needs-qa"]),
  },
};

describe("view settings", () => {
  test("default when the file has no view", async () => {
    expect(readViewSettings((await fixture()).doc)).toBe(DEFAULT_SETTINGS);
  });

  test("write first in the file and read back, leaving the repositories alone", async () => {
    const tracking = await fixture();
    writeViewSettings(tracking.doc, settings);
    const text = serializeTracking(tracking);

    expect(text).toStartWith("# Fixture tracking file.\n\nview:\n  group: status\n  sub: author\n");
    expect(text).toContain('filters: { author: [ alice ], status: [ open, merged ], label: [ backend, "!needs-qa" ] }\n\nacme/api:');

    const reloaded = modelTracking(FIXTURE, parseDocument(text));
    expect(sameSettings(readViewSettings(reloaded.doc), settings)).toBe(true);
    expect(reloaded.prs).toHaveLength(4);
  });

  test("replace an existing view in place", async () => {
    const tracking = await fixture();
    writeViewSettings(tracking.doc, settings);
    writeViewSettings(tracking.doc, DEFAULT_SETTINGS);
    const text = serializeTracking(tracking);

    expect(text.match(/^view:/gm)).toHaveLength(1);
    expect(sameSettings(readViewSettings(parseDocument(text)), DEFAULT_SETTINGS)).toBe(true);
  });

  test("ignore unknown dimensions and a sub-group equal to the group", () => {
    const doc = parseDocument("view:\n  group: colour\n  sub: repo\n  filters: { status: [open], bogus: [x] }\n");
    const read = readViewSettings(doc);

    expect(read.view).toEqual({ group: "repo", sub: undefined });
    expect([...read.filters.status]).toEqual(["open"]);
  });

  test("save re-reads the file so edits made since loading survive", async () => {
    const path = join(await mkdtemp(join(tmpdir(), "tracking-")), "TRACKING.yaml");
    await writeFile(path, await fixtureText());
    await writeFile(path, `${await fixtureText()}\nacme/new:\n  - number: 9\n    head: x\n    base: main\n`);

    const saved = await saveViewSettings(path, settings);
    expect(saved.prs.map((pr) => pr.id)).toContain("acme/new#9");
    expect(sameSettings(readViewSettings(parseDocument(await Bun.file(path).text())), settings)).toBe(true);
  });
});
