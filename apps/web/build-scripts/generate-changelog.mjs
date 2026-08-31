#!/usr/bin/env node
// Generates changelog JSON from git log, newest commit first, for the
// "What's new" modal — replaces the iframe embed of Plane's cloud changelog
// site, which self-hosted instances can't reach.
//
// Run this on the HOST before `docker build` / `docker compose build web`
// (e.g. `pnpm --filter web generate:changelog`), not inside the container:
// the Docker build context has no .git (see .dockerignore) so `git log`
// isn't available there — Dockerfile.web copies the host-generated file in
// instead. Do NOT wire this into the `build` or `dev` npm scripts, since
// those also run inside the container/CI where git is unavailable and would
// silently overwrite a good changelog.json with an empty one.
//
// Writes two copies:
//  - apps/web/app/assets/changelog.json, imported directly by the frontend.
//  - <repoRoot>/changelog.generated.json, a repo-root copy that survives
//    `turbo prune --docker` (which only copies git-tracked files into
//    out/full/, dropping this untracked file if left inside apps/web).
//    Dockerfile.web copies it back into place from the builder stage.

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { writeFileSync } from "node:fs";

const COMMIT_LIMIT = 100;
const SEP = String.fromCharCode(31); // ASCII unit separator, unlikely to appear in commit subjects

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "../../..");
const outFiles = [join(__dirname, "../app/assets/changelog.json"), join(repoRoot, "changelog.generated.json")];

function getCommits() {
  const format = ["%h", "%s", "%an", "%aI"].join(SEP);
  const raw = execFileSync("git", ["log", `--max-count=${COMMIT_LIMIT}`, `--pretty=format:${format}`], {
    cwd: repoRoot,
    encoding: "utf-8",
  });

  return raw
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [hash, subject, author, date] = line.split(SEP);
      return { hash, subject, author, date };
    });
}

let content;
try {
  const commits = getCommits();
  content = `${JSON.stringify(commits, null, 2)}\n`;
  console.log(`Generated changelog with ${commits.length} commits`);
} catch (error) {
  console.warn("Could not generate changelog.json from git log, writing empty list:", error.message);
  content = "[]\n";
}

for (const outFile of outFiles) {
  writeFileSync(outFile, content);
}
