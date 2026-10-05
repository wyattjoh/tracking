#!/usr/bin/env bun
// Entry point: `tracking [file]` opens the TUI (or prints JSON when stdout is
// not a TTY), and `tracking sync [--dry-run] [file]` writes live state back.

import { isatty } from "node:tty";
import { createLiveFetcher, ghViewer } from "./github.ts";
import { toJson } from "./json.ts";
import { syncTracking, syncTrackingFile, writeTracking } from "./sync.ts";
import { findTrackingFile, loadTracking } from "./tracking.ts";
import { saveViewSettings } from "./view.ts";

const USAGE = `Usage:
  tracking [file]                   Open the interactive view (JSON when stdout is not a TTY)
  tracking sync [--dry-run] [file]  Write live status, review, title, labels and description into the file

Without file, the nearest TRACKING.yaml at or above the working directory is used.`;

const fail = (message: string): never => {
  console.error(message);
  process.exit(1);
};

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  console.log(USAGE);
  process.exit(0);
}

const command = args[0] === "sync" ? "sync" : "view";
const rest = command === "sync" ? args.slice(1) : args;
const dryRun = rest.includes("--dry-run");
const positional = rest.filter((arg) => !arg.startsWith("-"));
const unknown = rest.filter((arg) => arg.startsWith("-") && arg !== "--dry-run");
if (unknown.length > 0 || positional.length > 1 || (dryRun && command !== "sync")) fail(USAGE);

const path = positional[0] ?? (await findTrackingFile(process.cwd())) ?? fail("no TRACKING.yaml found");
const tracking = await loadTracking(path);
const fetchLive = createLiveFetcher();

if (command === "sync") {
  const live = await fetchLive(tracking.prs);
  for (const pr of tracking.prs) if (!live.has(pr.id)) console.warn(`not found: ${pr.id}`);

  const changes = syncTracking(tracking, live);
  for (const { id, fields } of changes) console.log(`${id}: ${fields.join(", ")}`);

  if (changes.length === 0) {
    console.log(`all ${tracking.prs.length} pull requests current`);
  } else if (dryRun) {
    console.log(`${changes.length} of ${tracking.prs.length} pull requests would change; dry run, not written`);
  } else {
    await writeTracking(tracking);
    console.log(`updated ${changes.length} of ${tracking.prs.length} pull requests`);
  }
} else if (!isatty(1)) {
  // Check the descriptor rather than process.stdout.isTTY: touching process.stdout
  // switches the pipe to non-blocking, and Bun then drops output past 64 KiB.
  const live = await fetchLive(tracking.prs).catch((error: unknown) => {
    console.error(`live fetch failed: ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  });
  let current = tracking;
  if (live) {
    try {
      await syncTrackingFile(tracking.path, live);
      current = await loadTracking(tracking.path);
    } catch (error) {
      console.error(`sync failed: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    }
  }
  console.log(JSON.stringify(toJson(current, live), null, 2));
} else {
  const { runTui } = await import("./tui/run.tsx");
  await runTui({
    initial: tracking,
    fetchLive,
    sync: (current, live) => syncTrackingFile(current.path, live),
    reload: () => loadTracking(tracking.path),
    fetchViewer: ghViewer,
    saveView: (settings) => saveViewSettings(tracking.path, settings),
  });
  process.exit(0);
}
