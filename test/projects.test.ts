import { expect, test } from "bun:test";
import { mkdir, mkdtemp, realpath, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { configDir, isPathArg, listProjects, resolveTarget, slugError } from "../src/projects.ts";

const tempDirs = async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "tracking-projects-")));
  const dir = join(root, "config");
  const cwd = join(root, "work", "nested");
  await mkdir(dir, { recursive: true });
  await mkdir(cwd, { recursive: true });
  return { root, dir, cwd };
};

test("configDir honours XDG_CONFIG_HOME and falls back to ~/.config", () => {
  expect(configDir({ XDG_CONFIG_HOME: "/xdg" })).toBe("/xdg/tracking");
  expect(configDir({})).toBe(join(homedir(), ".config", "tracking"));
  expect(configDir({ XDG_CONFIG_HOME: "" })).toBe(join(homedir(), ".config", "tracking"));
});

test("isPathArg tells files from project names by syntax alone", () => {
  for (const arg of ["./work", "../x", "~/notes.yaml", "a/b", "/abs/file", "TRACKING.yaml", "x.yml", ".hidden"]) {
    expect(isPathArg(arg)).toBe(true);
  }
  for (const arg of ["work", "my-project", "oss_2"]) expect(isPathArg(arg)).toBe(false);
});

test("slugError rejects reserved and malformed names", () => {
  expect(slugError("work")).toBeUndefined();
  expect(slugError("sync")).toContain("reserved");
  expect(slugError("projects")).toContain("reserved");
  expect(slugError("-x")).toContain("invalid");
  expect(slugError("a b")).toContain("invalid");
});

test("listProjects lists YAML files by slug and tolerates a missing directory", async () => {
  const { root, dir } = await tempDirs();
  await writeFile(join(dir, "work.yaml"), "");
  await writeFile(join(dir, "oss.yaml"), "");
  await writeFile(join(dir, "notes.txt"), "");
  expect(await listProjects(dir)).toEqual([
    { slug: "oss", path: join(dir, "oss.yaml") },
    { slug: "work", path: join(dir, "work.yaml") },
  ]);
  expect(await listProjects(join(root, "missing"))).toEqual([]);
});

test("resolveTarget maps a slug to its project file", async () => {
  const { dir, cwd } = await tempDirs();
  await writeFile(join(dir, "work.yaml"), "");
  expect(await resolveTarget("work", cwd, dir)).toEqual({ kind: "file", path: join(dir, "work.yaml") });
});

test("resolveTarget reports a missing project with the available ones", async () => {
  const { dir, cwd } = await tempDirs();
  await writeFile(join(dir, "work.yaml"), "");
  const target = await resolveTarget("oss", cwd, dir);
  expect(target.kind).toBe("error");
  expect(target.kind === "error" && target.message).toContain('no project "oss"');
  expect(target.kind === "error" && target.message).toContain("  work");
});

test("resolveTarget uses a path argument as given, relative to the working directory", async () => {
  const { dir, cwd } = await tempDirs();
  expect(await resolveTarget("../other.yaml", cwd, dir)).toEqual({ kind: "file", path: join(cwd, "..", "other.yaml") });
  expect(await resolveTarget("~/t.yaml", cwd, dir)).toEqual({ kind: "file", path: join(homedir(), "t.yaml") });
});

test("resolveTarget without an argument prefers the nearest TRACKING.yaml", async () => {
  const { root, dir, cwd } = await tempDirs();
  await writeFile(join(dir, "work.yaml"), "");
  expect(await resolveTarget(undefined, cwd, dir)).toEqual({
    kind: "none",
    projects: [{ slug: "work", path: join(dir, "work.yaml") }],
  });
  await writeFile(join(root, "work", "TRACKING.yaml"), "");
  expect(await resolveTarget(undefined, cwd, dir)).toEqual({ kind: "file", path: join(root, "work", "TRACKING.yaml") });
});
