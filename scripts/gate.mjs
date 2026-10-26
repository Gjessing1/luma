#!/usr/bin/env node
// The pre-push quality gate: format → lint → build → typecheck → test, plus a
// local `docker build` only when the change can break the *image* itself.
//
// Why the docker step is conditional: CI builds the image (gate inside) on every
// push, so running it locally too doubles the wait. The fast stages cannot prove
// one thing — that the image is assemblable (a package.json/lockfile mismatch, a
// workspace missing from the runtime stage) — and only packaging changes can
// break that. So: packaging diff → docker build, anything else → skip it.
//
// Usage: npm run gate [--docker] [--no-docker] [--dry] [--since <ref>]
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const sinceIndex = argv.indexOf('--since');
const since = sinceIndex === -1 ? null : argv[sinceIndex + 1];

function has(flag) {
  return argv.includes(flag);
}

function git(args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) {
    return '';
  }
  return result.stdout.trim();
}

const base = since ?? git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}']);

// Everything this tree would push: unpushed commits, staged, unstaged, untracked.
// With no upstream nothing has been pushed yet, so every file is new to CI. (The
// old `HEAD~1` fallback saw 0 changes on a fresh repo's single commit and skipped
// the docker build on exactly the first push.)
function changedFiles() {
  const untracked = git(['ls-files', '--others', '--exclude-standard']);
  let lists = [git(['ls-files']), untracked];
  if (base !== '') {
    lists = [
      git(['diff', '--name-only', `${base}...HEAD`]),
      git(['diff', '--name-only', 'HEAD']),
      untracked,
    ];
  }
  const files = new Set();
  for (const list of lists) {
    for (const file of list.split('\n')) {
      if (file !== '') {
        files.add(file);
      }
    }
  }
  return [...files];
}

function touchesPackaging(files) {
  for (const file of files) {
    // The Android shell has its own lockfile and never enters the image (.dockerignore).
    if (file.startsWith('apps/android/')) {
      continue;
    }
    if (
      file === 'package-lock.json' ||
      file.endsWith('package.json') ||
      file.endsWith('Dockerfile') ||
      file === '.dockerignore' ||
      file.startsWith('.forgejo/')
    ) {
      return true;
    }
  }
  return false;
}

const files = changedFiles();
let docker = touchesPackaging(files);
let dockerReason = docker ? 'packaging files changed' : 'no packaging change';
if (base === '') {
  dockerReason += '; no upstream, so the whole tree counts as changed';
}
if (has('--docker')) {
  docker = true;
  dockerReason = '--docker';
}
if (has('--no-docker')) {
  docker = false;
  dockerReason = '--no-docker (SKIPPED — the image itself is unverified)';
}

const stages = [
  ['format:check', ['npm', 'run', 'format:check']],
  ['lint', ['npm', 'run', 'lint']],
  ['build', ['npm', 'run', 'build']],
  ['typecheck', ['npm', 'run', 'typecheck']],
  ['test', ['npm', 'test']],
];
if (docker) {
  stages.push(['docker build', ['docker', 'build', '-f', 'backend/Dockerfile', '.']]);
}

console.log(
  `gate: ${files.length} changed file(s); docker build: ${docker ? 'yes' : 'no'} (${dockerReason})`,
);
console.log(`gate: stages → ${stages.map((stage) => stage[0]).join(' → ')}`);
if (has('--dry')) {
  process.exit(0);
}

for (const [name, [cmd, ...args]] of stages) {
  const started = Date.now();
  console.log(`\n── gate: ${name} ──`);
  const result = spawnSync(cmd, args, { cwd: root, stdio: 'inherit' });
  const seconds = Math.round((Date.now() - started) / 1000);
  if (result.status !== 0) {
    console.error(`\ngate: FAILED at ${name} after ${seconds}s`);
    process.exit(result.status ?? 1);
  }
  console.log(`gate: ${name} ok (${seconds}s)`);
}
console.log('\ngate: all stages passed');
