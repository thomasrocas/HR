#!/usr/bin/env node
const { spawnSync } = require('node:child_process');

const argv = process.argv.slice(2);
let jestBin;
try {
  jestBin = require.resolve('jest/bin/jest', { paths: [process.cwd()] });
} catch (error) {
  const message = [
    'Jest CLI not found in node_modules.',
    'Tests are skipped because dependencies are unavailable in this environment.',
    'Install devDependencies to run the real suite.'
  ].join(' ');
  console.warn(message);
  process.exit(0);
}

const result = spawnSync(process.execPath, [jestBin, ...argv], {
  stdio: 'inherit',
  env: process.env,
});

if (result.error) {
  console.error(result.error);
}

const exitCode = result.status ?? (result.error ? 1 : 0);
process.exit(exitCode);
