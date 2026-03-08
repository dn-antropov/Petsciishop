import { execFile } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const ascBinary = resolve(repoRoot, 'node_modules', '.bin', 'asc');
const builds = [
  {
    entryFile: resolve(repoRoot, 'wasm', 'truskiiStandardKernel.ts'),
    outFile: resolve(repoRoot, 'src', 'utils', 'importers', 'truskiiStandardKernel.wasm'),
  },
  {
    entryFile: resolve(repoRoot, 'wasm', 'truskiiMcmKernel.ts'),
    outFile: resolve(repoRoot, 'src', 'utils', 'importers', 'truskiiMcmKernel.wasm'),
  },
];

for (const { entryFile, outFile } of builds) {
  await mkdir(dirname(outFile), { recursive: true });
  await execFileAsync(ascBinary, [
    entryFile,
    '-O3',
    '--noAssert',
    '--runtime', 'stub',
    '--enable', 'simd',
    '--outFile', outFile,
  ]);
}
