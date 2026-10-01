// Start the interactive view and resolve once the user quits.

import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { App, type AppProps } from "./App.tsx";

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
