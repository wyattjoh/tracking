#!/usr/bin/env bun
// Entry point: `tracking [project|file]` opens the TUI (or prints JSON when
// stdout is not a TTY), `tracking sync [--dry-run] [project|file]` writes live
// state back, `tracking init [project|file]` creates a starter file and
// `tracking projects` lists the projects in the config directory.

import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { isatty } from "node:tty";
import { createLiveFetcher, ghViewer } from "./github.ts";
import { initTracking } from "./init.ts";
import { toJson } from "./json.ts";
import { syncTracking, syncTrackingFile, writeTracking } from "./sync.ts";
import { configDir, isPathArg, listProjects, projectPath, projectsHint, resolveTarget, slugError } from "./projects.ts";
import { FILE_NAME, loadTracking, resolveLocalPath } from "./tracking.ts";
import { saveViewSettings } from "./view.ts";

const USAGE = `Usage:
  tracking [project|file]                   Open the interactive view (JSON when stdout is not a TTY)
  tracking sync [--dry-run] [project|file]  Write live status, review, title, labels and description into the file
  tracking init [project|file]              Create a tracking file with a commented-out example
  tracking projects                         List the projects in the config directory

A project is a name for $XDG_CONFIG_HOME/tracking/<project>.yaml (~/.config/tracking by default).
An argument containing /, starting with . or ~, or ending in .yaml/.yml is a file instead.
Without either, the nearest TRACKING.yaml at or above the working directory is used, and the
interactive view offers a project picker when there is none; init creates ./TRACKING.yaml.`;

const fail = (message: string): never => {
  console.error(message);
  process.exit(1);
};

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  console.log(USAGE);
  process.exit(0);
}

const COMMANDS = ["sync", "init", "projects"] as const;
const command = COMMANDS.find((name) => name === args[0]) ?? "view";
const rest = command === "view" ? args : args.slice(1);
const dryRun = rest.includes("--dry-run");
const positional = rest.filter((arg) => !arg.startsWith("-"));
const unknown = rest.filter((arg) => arg.startsWith("-") && arg !== "--dry-run");
const tooMany = positional.length > (command === "projects" ? 0 : 1);
if (unknown.length > 0 || tooMany || (dryRun && command !== "sync")) fail(USAGE);

const dir = configDir();

if (command === "projects") {
  const projects = await listProjects(dir);
  if (projects.length === 0) console.log(projectsHint(projects, dir));
  for (const { slug, path } of projects) console.log(`${slug}\t${path}`);
  process.exit(0);
}

if (command === "init") {
  const arg = positional[0] ?? FILE_NAME;
  const slug = isPathArg(arg) ? undefined : arg;
  if (slug) {
    const invalid = slugError(slug);
    if (invalid) fail(invalid);
  }
  const target = slug ? projectPath(dir, slug) : resolveLocalPath(process.cwd(), arg);
  await mkdir(dirname(target), { recursive: true });
  if (!(await initTracking(target))) fail(`already exists: ${target}`);
  console.log(`created ${target}`);
  process.exit(0);
}

// Pick a project interactively only when the view will be drawn.
const interactive = command === "view" && isatty(1);
const target = await resolveTarget(positional[0], process.cwd(), dir);
if (target.kind === "error") fail(target.message);
if (target.kind === "none" && !(interactive && target.projects.length > 0)) {
  fail(`no TRACKING.yaml found; pass a project or file\n${projectsHint(target.projects, dir)}`);
}

const pickFile = async (): Promise<string> => {
  if (target.kind === "file") return target.path;
  if (target.kind === "error") return fail(target.message);
  const { pickProject } = await import("./tui/run.tsx");
  const project = await pickProject(target.projects);
  if (!project) process.exit(0);
  return project.path;
};

const tracking = await loadTracking(await pickFile());
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
