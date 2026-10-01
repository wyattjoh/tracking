import { afterEach, expect, test } from "bun:test";
import { testRender } from "@opentui/react/test-utils";
import { act } from "react";
import type { LiveMap } from "../src/github.ts";
import type { Tracking } from "../src/tracking.ts";
import { App } from "../src/tui/App.tsx";
import { currentLive, fixture, live } from "./helpers.ts";

let setup: Awaited<ReturnType<typeof testRender>> | undefined;

afterEach(() => {
  if (setup) act(() => setup!.renderer.destroy());
  setup = undefined;
});

const render = async (tracking: Tracking, state: LiveMap) => {
  await act(async () => {
    setup = await testRender(
      <App
        initial={tracking}
        fetchLive={async () => state}
        sync={async () => []}
        reload={async () => tracking}
        fetchViewer={async () => "alice"}
      />,
      { width: 140, height: 30 },
    );
  });
  await act(async () => {
    await setup!.renderOnce();
  });
  return setup!;
};

const frame = async () => {
  await act(async () => {
    await setup!.renderOnce();
  });
  return setup!.captureCharFrame();
};

const lineOf = (text: string, needle: string): number => text.split("\n").findIndex((line) => line.includes(needle));

test("renders the tree with live status, review and drift", async () => {
  const tracking = await fixture();
  const state = currentLive(tracking);
  state.set("acme/api#2", live({ status: "merged", title: "feat: add the endpoints" }));
  state.set("acme/api#3", live({ review: "changes_requested", title: "fix: standalone" }));
  await render(tracking, state);

  const text = await frame();
  expect(text).toContain("group: repo › author");
  expect(text).toContain("acme/api 3");
  expect(text).toContain("#1 feat: add the schema");
  expect(text).toContain("draft→merged");
  expect(text).toContain("● open approved #1");
  expect(text).toContain("● open changes requested #3");
  expect(text).toContain("live ");
});

test("clicking a row selects it and shows its details", async () => {
  const tracking = await fixture();
  const ui = await render(tracking, currentLive(tracking));

  const y = lineOf(await frame(), "#3 fix: standalone");
  await act(async () => {
    await ui.mockMouse.click(20, y);
  });

  const text = await frame();
  expect(text).toContain("https://github.com/acme/api/pull/3");
  expect(text).toContain("A note.");
});

test("clicking a glyph collapses its stacked children", async () => {
  const tracking = await fixture();
  const ui = await render(tracking, currentLive(tracking));

  const before = await frame();
  expect(before).toContain("#2 feat: add the endpoints");

  const y = lineOf(before, "#1 feat: add the schema");
  const x = before.split("\n")[y]!.indexOf("▾");
  await act(async () => {
    await ui.mockMouse.click(x, y);
  });

  const after = await frame();
  expect(after).not.toContain("#2 feat: add the endpoints");
  expect(after.split("\n")[y]).toContain("▸");
});

test("j moves the selection down", async () => {
  const tracking = await fixture();
  const ui = await render(tracking, currentLive(tracking));
  await frame();

  await act(async () => {
    ui.mockInput.pressKey("j");
    ui.mockInput.pressKey("j");
  });

  expect(await frame()).toContain("https://github.com/acme/api/pull/1");
});

test("top-level groups are separated by a blank line", async () => {
  const tracking = await fixture();
  await render(tracking, currentLive(tracking));

  const lines = (await frame()).split("\n");
  const web = lines.findIndex((line) => line.includes("▾ acme/web"));
  expect(lines[web - 1]).toMatch(/^│\s+│/);
});

test("v regroups by author and V adds a sub-group", async () => {
  const tracking = await fixture();
  const ui = await render(tracking, currentLive(tracking));
  await frame();

  await act(async () => {
    ui.mockInput.pressKey("v");
  });
  const byAuthor = await frame();
  expect(byAuthor).toContain("group: author");
  expect(lineOf(byAuthor, "▾ @alice")).toBeLessThan(lineOf(byAuthor, "▾ @bob"));
  expect(byAuthor).toContain("api#1 feat: add the schema @alice");
  expect(byAuthor).toContain("api#1 feat: add the schema");

  await act(async () => {
    ui.mockInput.pressKey("v", { shift: true });
  });
  const bySub = await frame();
  expect(bySub).toContain("group: author › repo");
  expect(bySub).toContain("▾ acme/api 3");
  expect(bySub).toContain("#1 feat: add the schema");
});

test("dragging the border between the panes resizes them", async () => {
  const tracking = await fixture();
  const ui = await render(tracking, currentLive(tracking));

  const borderX = (text: string) => text.split("\n")[1]!.indexOf("╮");
  const before = borderX(await frame());
  expect(before).toBe(Math.round(140 * 0.6) - 1);

  await act(async () => {
    await ui.mockMouse.drag(before, 10, 50, 10);
  });

  expect(borderX(await frame())).toBe(50);
});
