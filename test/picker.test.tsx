import { afterEach, expect, test } from "bun:test";
import { testRender } from "@opentui/react/test-utils";
import { act } from "react";
import type { Project } from "../src/projects.ts";
import { ProjectPicker } from "../src/tui/ProjectPicker.tsx";

let setup: Awaited<ReturnType<typeof testRender>> | undefined;

afterEach(() => {
  if (setup) act(() => setup!.renderer.destroy());
  setup = undefined;
});

const projects: Project[] = [
  { slug: "oss", path: "/config/tracking/oss.yaml" },
  { slug: "work", path: "/config/tracking/work.yaml" },
];

const render = async () => {
  const picks: (Project | undefined)[] = [];
  await act(async () => {
    setup = await testRender(
      <ProjectPicker projects={projects} onPick={(project) => picks.push(project)} onCancel={() => picks.push(undefined)} />,
      { width: 100, height: 20 },
    );
  });
  await act(async () => {
    await setup!.renderOnce();
  });
  return picks;
};

const press = async (input: (keys: Awaited<ReturnType<typeof testRender>>["mockInput"]) => void) => {
  await act(async () => {
    input(setup!.mockInput);
    await setup!.renderOnce();
  });
};

test("lists each project with its file", async () => {
  await render();
  const text = setup!.captureCharFrame();
  expect(text).toContain("Projects");
  expect(text).toContain("oss");
  expect(text).toContain("/config/tracking/work.yaml");
});

test("enter opens the project under the cursor", async () => {
  const picks = await render();
  await press((keys) => keys.pressKey("j"));
  await press((keys) => keys.pressEnter());
  expect(picks).toEqual([projects[1]]);
});

test("escape cancels", async () => {
  const picks = await render();
  await press((keys) => keys.pressEscape());
  expect(picks).toEqual([undefined]);
});
