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
      <App initial={tracking} fetchLive={async () => state} sync={async () => []} reload={async () => tracking} />,
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

test("renders the tree with live status and drift", async () => {
  const tracking = await fixture();
  const state = currentLive(tracking);
  state.set("acme/api#2", live({ status: "merged", title: "feat: add the endpoints" }));
  await render(tracking, state);

  const text = await frame();
  expect(text).toContain("pull_requests");
  expect(text).toContain("acme/api");
  expect(text).toContain("#1 feat: add the schema");
  expect(text).toContain("draft→merged");
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
