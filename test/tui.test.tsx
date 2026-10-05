import { afterEach, expect, test } from "bun:test";
import { testRender } from "@opentui/react/test-utils";
import { act } from "react";
import type { LiveMap } from "../src/github.ts";
import type { Tracking } from "../src/tracking.ts";
import { App } from "../src/tui/App.tsx";
import type { ViewSettings } from "../src/view.ts";
import { currentLive, fixture, live } from "./helpers.ts";

let setup: Awaited<ReturnType<typeof testRender>> | undefined;
let saves: ViewSettings[] = [];

afterEach(() => {
  if (setup) act(() => setup!.renderer.destroy());
  setup = undefined;
  saves = [];
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
        saveView={async (settings) => {
          saves.push(settings);
          return tracking;
        }}
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
  state.set("acme/api#2", { ...state.get("acme/api#2")!, status: "open" });
  state.set("acme/api#3", live({ review: "changes_requested", title: "fix: standalone" }));
  state.set("acme/web#7", { ...state.get("acme/web#7")!, status: "merged" });
  await render(tracking, state);

  const text = await frame();
  expect(text).toContain("group: repo › author");
  expect(text).toContain("acme/api 3");
  expect(text).toContain("#1 feat: add the schema");
  expect(text).toContain("draft→open");
  expect(text).toContain("filter: status open, draft");
  expect(text).not.toContain("feat: the UI");
  expect(text).toContain("● open approved #1");
  expect(text).toContain("● open changes requested #3");
  expect(text).toContain("live ");
});

test("shows labels in the details pane only", async () => {
  const tracking = await fixture();
  const ui = await render(tracking, currentLive(tracking));

  const before = await frame();
  expect(before).toContain("#1 feat: add the schema @alice");
  expect(before).not.toContain("needs-qa");

  await act(async () => {
    await ui.mockMouse.click(20, lineOf(before, "#1 feat: add the schema"));
  });
  expect(await frame()).toContain(" backend   needs-qa ");
});

test("the view modal filters by label, cycling with and without", async () => {
  const tracking = await fixture();
  const ui = await render(tracking, currentLive(tracking));

  // needs-qa is the last item, so moving down past the end lands on it.
  await act(async () => {
    ui.mockInput.pressKey("v");
  });
  await act(async () => {
    for (let i = 0; i < 30; i++) ui.mockInput.pressKey("j");
    ui.mockInput.pressKey(" ");
  });
  // The modal scrolls the cursor into view on the frame after it moves.
  await frame();
  const wanted = await frame();
  expect(wanted).toContain("[+] needs-qa");
  expect(wanted).toContain("label needs-qa");
  expect(wanted).not.toContain("#3 fix: standalone");

  await act(async () => {
    ui.mockInput.pressKey(" ");
  });
  const unwanted = await frame();
  expect(unwanted).toContain("[-] needs-qa");
  expect(unwanted).toContain("label not needs-qa");
  expect(unwanted).toContain("#3 fix: standalone");
  expect(unwanted).not.toContain("#1 feat: add the schema");
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

test("v opens the view modal to change the grouping and filters", async () => {
  const tracking = await fixture();
  const state = currentLive(tracking);
  state.set("acme/web#7", { ...state.get("acme/web#7")!, status: "merged" });
  const ui = await render(tracking, state);
  expect(await frame()).not.toContain("feat: the UI");

  await act(async () => {
    ui.mockInput.pressKey("v");
  });
  const modal = await frame();
  expect(modal).toContain("Sub-group  ‹ author ›");
  expect(modal).toContain("[x] open");
  expect(modal).toContain("[ ] merged");

  // The cursor starts on Group; then down past the Status heading to merged.
  await act(async () => {
    ui.mockInput.pressArrow("right");
    for (let i = 0; i < 4; i++) ui.mockInput.pressKey("j");
    ui.mockInput.pressKey(" ");
  });
  const changed = await frame();
  expect(changed).toContain("group: author  filter: status open, draft, merged");
  expect(changed).toContain("[x] merged");

  await act(async () => {
    ui.mockInput.pressEscape();
    // A lone ESC is held for the stdin parser's 20ms sequence timeout.
    await Bun.sleep(50);
  });
  const closed = await frame();
  expect(closed).not.toContain("[x] merged");
  expect(closed).toContain("▾ @bob");
  expect(closed).toContain("web#7 feat: the UI @bob");

  expect(saves).toHaveLength(1);
  expect(saves[0]!.view).toEqual({ group: "author", sub: undefined });
  expect([...saves[0]!.filters.status]).toEqual(["open", "draft", "merged"]);
});

test("clicking the view in the header opens the modal, and closing it unchanged saves nothing", async () => {
  const tracking = await fixture();
  const ui = await render(tracking, currentLive(tracking));

  const header = (await frame()).split("\n")[0]!;
  await act(async () => {
    await ui.mockMouse.click(header.indexOf("group:") + 2, 0);
  });
  expect(await frame()).toContain("Sub-group  ‹ author ›");

  await act(async () => {
    ui.mockInput.pressKey("v");
  });
  expect(await frame()).not.toContain("Sub-group");
  expect(saves).toEqual([]);
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
