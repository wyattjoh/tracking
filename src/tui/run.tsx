// Start the interactive view and resolve once the user quits.

import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import type { Project } from "../projects.ts";
import { App, type AppProps } from "./App.tsx";
import { ProjectPicker } from "./ProjectPicker.tsx";

/**
 * Render the interactive view in the alternate screen with mouse support.
 *
 * @param props - The file, live and viewer fetchers, and sync callbacks
 * @returns A promise that resolves when the renderer is destroyed
 */
export const runTui = async (props: AppProps): Promise<void> => {
  const { promise, resolve } = Promise.withResolvers<void>();
  const renderer = await createCliRenderer({ exitOnCtrlC: true, useMouse: true, onDestroy: resolve });
  createRoot(renderer).render(<App {...props} />);
  await promise;
};

/**
 * Ask the user which project to open.
 *
 * @param projects - The projects to choose from; must not be empty
 * @returns The chosen project, or undefined when the user quit
 */
export const pickProject = async (projects: Project[]): Promise<Project | undefined> => {
  let chosen: Project | undefined;
  const { promise, resolve } = Promise.withResolvers<void>();
  const renderer = await createCliRenderer({ exitOnCtrlC: true, useMouse: true, onDestroy: resolve });
  const finish = (project: Project | undefined) => {
    chosen = project;
    renderer.destroy();
  };
  createRoot(renderer).render(<ProjectPicker projects={projects} onPick={finish} onCancel={() => finish(undefined)} />);
  await promise;
  return chosen;
};
