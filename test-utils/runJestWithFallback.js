#!/usr/bin/env node
const { spawnSync } = require('node:child_process');
const { join, resolve } = require('node:path');
const fs = require('node:fs');

const argv = process.argv.slice(2);
const projectRoot = process.cwd();
const searchBases = [
  projectRoot,
  join(projectRoot, 'public'),
  join(projectRoot, 'public', 'node_modules'),
];

let jestBin;
for (const base of searchBases) {
  try {
    jestBin = require.resolve('jest/bin/jest', { paths: [base] });
    break;
  } catch (_) {
    // try next base directory
  }
}

if (!jestBin) {
  const message = [
    'Jest CLI could not be located. Install devDependencies or ensure',
    'a vendored installation is present under public/node_modules/.',
  ].join(' ');
  console.error(message);
  process.exit(1);
}

const nodePathCandidates = [
  resolve(projectRoot, 'node_modules'),
  resolve(projectRoot, 'public', 'node_modules'),
];
const existingNodePaths = nodePathCandidates.filter(dir => fs.existsSync(dir));
const delimiter = process.platform === 'win32' ? ';' : ':';
const env = { ...process.env };
if (existingNodePaths.length) {
  const additional = existingNodePaths.join(delimiter);
  env.NODE_PATH = env.NODE_PATH ? `${additional}${delimiter}${env.NODE_PATH}` : additional;
}

const result = spawnSync(process.execPath, [jestBin, ...argv], {
  stdio: 'inherit',
  env,
});

if (result.error) {
  console.error(result.error);
}

const exitCode = result.status ?? (result.error ? 1 : 0);
process.exit(exitCode);
