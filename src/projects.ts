// Resolve which tracking file to use: a named project in the config directory,
// an explicit path, or the nearest TRACKING.yaml at or above the working
// directory.

import { readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { findTrackingFile, resolveLocalPath } from "./tracking.ts";

/**
 * A named project: a YAML file in the config directory.
 */
export type Project = {
  slug: string;
  path: string;
};

/**
 * Command names that cannot be used as project slugs.
 */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set(["sync", "init", "projects"]);

const SLUG = /^[a-z0-9][a-z0-9_-]*$/i;

const EXTENSION = ".yaml";

/**
 * The directory holding project files: `$XDG_CONFIG_HOME/tracking`, or
 * `~/.config/tracking` when it is unset.
 *
 * @param env - Environment to read `XDG_CONFIG_HOME` from
 * @returns The absolute config directory
 */
export const configDir = (env: Record<string, string | undefined> = process.env): string =>
  join(env.XDG_CONFIG_HOME || join(homedir(), ".config"), "tracking");

/**
 * Whether an argument names a file rather than a project. The check is purely
 * syntactic so the answer never depends on the working directory.
 *
 * @param arg - A command-line argument
 * @returns True when the argument is a path
 */
export const isPathArg = (arg: string): boolean =>
  arg.includes("/") || arg.startsWith(".") || arg.startsWith("~") || /\.ya?ml$/i.test(arg);

/**
 * Check a project slug.
 *
 * @param slug - The candidate slug
 * @returns An error message, or undefined when the slug is valid
 */
export const slugError = (slug: string): string | undefined => {
  if (RESERVED_SLUGS.has(slug)) return `"${slug}" is reserved and cannot name a project`;
  if (!SLUG.test(slug)) return `invalid project name "${slug}": use letters, digits, - and _`;
  return undefined;
};

/**
 * The file of a project.
 *
 * @param dir - The config directory
 * @param slug - The project slug
 * @returns The absolute path of the project's YAML file
 */
export const projectPath = (dir: string, slug: string): string => join(dir, `${slug}${EXTENSION}`);

/**
 * List the projects in the config directory, sorted by slug.
 *
 * @param dir - The config directory
 * @returns The projects; none when the directory does not exist
 */
export const listProjects = async (dir: string): Promise<Project[]> => {
  const names = await readdir(dir).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  return names
    .filter((name) => name.endsWith(EXTENSION) && !slugError(name.slice(0, -EXTENSION.length)))
    .map((name) => name.slice(0, -EXTENSION.length))
    .sort()
    .map((slug) => ({ slug, path: projectPath(dir, slug) }));
};

/**
 * Describe the available projects for an error message.
 *
 * @param projects - The projects in the config directory
 * @param dir - The config directory
 * @returns A multi-line hint
 */
export const projectsHint = (projects: Project[], dir: string): string =>
  projects.length === 0
    ? `no projects in ${dir}; create one with \`tracking init <project>\``
    : `available projects:\n${projects.map(({ slug }) => `  ${slug}`).join("\n")}`;

/**
 * The outcome of resolving a command-line target.
 */
export type Target =
  | { kind: "file"; path: string }
  | { kind: "none"; projects: Project[] }
  | { kind: "error"; message: string };

/**
 * Resolve the file a command works on. A path argument is used as given, a
 * slug names a project in the config directory, and without an argument the
 * nearest TRACKING.yaml at or above `cwd` is used.
 *
 * @param arg - The positional argument, when given
 * @param cwd - The working directory
 * @param dir - The config directory
 * @returns The absolute file, the projects to choose from when nothing matched, or an error
 */
export const resolveTarget = async (arg: string | undefined, cwd: string, dir: string): Promise<Target> => {
  if (arg !== undefined && isPathArg(arg)) return { kind: "file", path: resolveLocalPath(cwd, arg) };

  if (arg !== undefined) {
    const invalid = slugError(arg);
    if (invalid) return { kind: "error", message: invalid };
    const path = projectPath(dir, arg);
    if (await Bun.file(path).exists()) return { kind: "file", path };
    return { kind: "error", message: `no project "${arg}"; ${projectsHint(await listProjects(dir), dir)}` };
  }

  const local = await findTrackingFile(cwd);
  if (local) return { kind: "file", path: local };
  return { kind: "none", projects: await listProjects(dir) };
};
