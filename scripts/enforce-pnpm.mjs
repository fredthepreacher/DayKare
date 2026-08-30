#!/usr/bin/env node
// Guards the workspace against npm/yarn and clears stray lockfiles.
//
// This replaces a `sh -c '...'` preinstall hook inherited from Replit. That
// hook only worked where a POSIX shell was on PATH, so `pnpm install` failed
// on Windows with "'sh' is not recognized as an internal or external command".
// Node is guaranteed to be present during preinstall, so we use it instead.
import { rmSync } from 'node:fs';

for (const stray of ['package-lock.json', 'yarn.lock']) {
  rmSync(stray, { force: true });
}

const agent = process.env.npm_config_user_agent ?? '';
if (!agent.startsWith('pnpm/')) {
  console.error('This workspace uses pnpm. Run `corepack enable`, then `pnpm install`.');
  process.exit(1);
}
