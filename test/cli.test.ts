import { expect, test } from "bun:test";
import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { TEMPLATE } from "../src/init.ts";
import { loadTracking } from "../src/tracking.ts";
import { fixtureText } from "./helpers.ts";

const exec = promisify(execFile);
const cli = new URL("../src/cli.ts", import.meta.url).pathname;

const setup = async () => {
  const dir = await mkdtemp(join(tmpdir(), "tracking-cli-"));
  const path = join(dir, "TRACKING.yaml");
  await writeFile(path, await fixtureText());
  await writeFile(join(dir, "gh"), '#!/bin/sh\nif [ "$TRACKING_TEST_FAIL" = "1" ]; then exit 1; fi\nprintf \'%s\\n\' "$TRACKING_TEST_RESPONSE"\n', { mode: 0o755 });
  const config = join(dir, "config");
  const env = {
    ...process.env,
    XDG_CONFIG_HOME: config,
    PATH: `${dir}:${process.env.PATH}`,
    TRACKING_TEST_FAIL: "0",
    TRACKING_TEST_RESPONSE: JSON.stringify({
      data: {
        p0: {
          pullRequest: {
            state: "MERGED",
            isDraft: false,
            reviewDecision: null,
            title: "refreshed schema",
            body: "Updated description.",
            author: { login: "alice" },
            headRefName: "alice/schema",
            baseRefName: "release",
            labels: { nodes: [{ name: "shipped", color: "00ff00" }] },
          },
        },
      },
    }),
  };
  return { dir, path, env, projects: join(config, "tracking") };
};

const attempt = (args: string[], options: Parameters<typeof exec>[2]) =>
  exec(process.execPath, [cli, ...args], options).then(
    ({ stdout, stderr }) => ({ code: 0, stdout: String(stdout), stderr: String(stderr) }),
    (error: { code: number; stdout: unknown; stderr: unknown }) => ({
      code: error.code,
      stdout: String(error.stdout),
      stderr: String(error.stderr),
    }),
  );

test("non-TTY output syncs live state to YAML before printing JSON", async () => {
  const { path, env } = await setup();
  const { stdout, stderr } = await exec(process.execPath, [cli, path], { env, timeout: 10_000 });
  expect(stderr).toBe("");
  const saved = await loadTracking(path);
  const pr = saved.prs.find((pr) => pr.id === "acme/api#1")!;
  expect(pr.status).toBe("merged");
  expect(pr.review).toBeUndefined();
  expect(pr.title).toBe("refreshed schema");
  expect(pr.base).toBe("release");
  expect(pr.labels).toEqual(["shipped"]);
  expect(pr.description).toBe("Updated description.");
  expect(await Bun.file(path).text()).toContain("# Keep this comment through sync.");
  const output = JSON.parse(stdout);
  expect(output.live).toBe(true);
  expect(output.repos[0].prs[0].status).toBe("merged");
  expect(output.repos[0].prs[0].drift).toEqual([]);
});

test("non-TTY fetch failures leave YAML untouched and still print file state", async () => {
  const { path, env } = await setup();
  const before = await Bun.file(path).text();
  const { stdout, stderr } = await exec(process.execPath, [cli, path], {
    env: { ...env, TRACKING_TEST_FAIL: "1" },
    timeout: 10_000,
  });
  expect(stderr).toContain("live fetch failed:");
  expect(JSON.parse(stdout).live).toBe(false);
  expect(await Bun.file(path).text()).toBe(before);
});

test("non-TTY sync failures report an error but still print live state", async () => {
  const { path, env } = await setup();
  const before = await Bun.file(path).text();
  await chmod(path, 0o444);
  const result = await exec(process.execPath, [cli, path], { env, timeout: 10_000 }).then(
    (result) => ({ ...result, code: 0 }),
    (error) => ({ stdout: String(error.stdout), stderr: String(error.stderr), code: error.code }),
  );
  expect(result.code).toBe(1);
  expect(result.stderr).toContain("sync failed:");
  const output = JSON.parse(result.stdout);
  expect(output.live).toBe(true);
  expect(output.repos[0].prs[0].live.status).toBe("merged");
  expect(await Bun.file(path).text()).toBe(before);
});

test("init creates a commented template in the working directory that loads empty", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tracking-init-"));
  const env = { ...process.env, XDG_CONFIG_HOME: join(dir, "config") };
  const { stdout } = await exec(process.execPath, [cli, "init"], { cwd: dir, env, timeout: 10_000 });
  const path = join(await realpath(dir), "TRACKING.yaml");
  expect(stdout).toBe(`created ${path}\n`);
  expect(await Bun.file(path).text()).toBe(TEMPLATE);
  expect((await loadTracking(path)).prs).toEqual([]);
});

test("init refuses to overwrite an existing file", async () => {
  const { path, env } = await setup();
  const before = await Bun.file(path).text();
  const error = await exec(process.execPath, [cli, "init", path], { env, timeout: 10_000 }).catch((error) => error);
  expect(error.code).toBe(1);
  expect(String(error.stderr)).toContain("already exists:");
  expect(await Bun.file(path).text()).toBe(before);
});

test("sync --dry-run remains read-only", async () => {
  const { path, env } = await setup();
  const before = await Bun.file(path).text();
  const { stdout } = await exec(process.execPath, [cli, "sync", "--dry-run", path], { env, timeout: 10_000 });
  expect(stdout).toContain("dry run, not written");
  expect(await Bun.file(path).text()).toBe(before);
});

test("init <project> creates the config directory and the project file", async () => {
  const { env, projects } = await setup();
  const { stdout } = await exec(process.execPath, [cli, "init", "work"], { env, timeout: 10_000 });
  const path = join(projects, "work.yaml");
  expect(stdout).toBe(`created ${path}\n`);
  expect(await Bun.file(path).text()).toBe(TEMPLATE);
});

test("init rejects a reserved project name", async () => {
  const { env } = await setup();
  const result = await attempt(["init", "projects"], { env, timeout: 10_000 });
  expect(result.code).toBe(1);
  expect(result.stderr).toContain("reserved");
});

test("projects lists each project with its file", async () => {
  const { env, projects } = await setup();
  const empty = await exec(process.execPath, [cli, "projects"], { env, timeout: 10_000 });
  expect(empty.stdout).toContain("tracking init <project>");
  await mkdir(projects, { recursive: true });
  await writeFile(join(projects, "work.yaml"), "");
  await writeFile(join(projects, "oss.yaml"), "");
  const { stdout } = await exec(process.execPath, [cli, "projects"], { env, timeout: 10_000 });
  expect(stdout).toBe(`oss\t${join(projects, "oss.yaml")}\nwork\t${join(projects, "work.yaml")}\n`);
});

test("sync <project> writes the project's file", async () => {
  const { env, projects } = await setup();
  await mkdir(projects, { recursive: true });
  const path = join(projects, "work.yaml");
  await writeFile(path, await fixtureText());
  const { stdout } = await exec(process.execPath, [cli, "sync", "work"], { env, timeout: 10_000 });
  expect(stdout).toContain("updated");
  expect((await loadTracking(path)).prs.find((pr) => pr.id === "acme/api#1")!.status).toBe("merged");
});

test("an unknown project fails and lists the available ones", async () => {
  const { env, projects } = await setup();
  await mkdir(projects, { recursive: true });
  await writeFile(join(projects, "work.yaml"), "");
  const result = await attempt(["oss"], { env, timeout: 10_000 });
  expect(result.code).toBe(1);
  expect(result.stderr).toContain('no project "oss"');
  expect(result.stderr).toContain("  work");
});

test("non-TTY without a file or local TRACKING.yaml fails and lists the projects", async () => {
  const { env, projects } = await setup();
  await mkdir(projects, { recursive: true });
  await writeFile(join(projects, "work.yaml"), "");
  const cwd = await mkdtemp(join(tmpdir(), "tracking-empty-"));
  const result = await attempt([], { cwd, env, timeout: 10_000 });
  expect(result.code).toBe(1);
  expect(result.stderr).toContain("no TRACKING.yaml found");
  expect(result.stderr).toContain("  work");
});
