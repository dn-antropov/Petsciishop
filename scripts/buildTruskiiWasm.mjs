import { execFile } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');

const builds = [
  {
    entryFile: resolve(repoRoot, 'wasm', 'truskiiBinaryKernel.ts'),
    outFile: resolve(repoRoot, 'src', 'utils', 'importers', 'truskiiBinaryKernel.wasm'),
  },
  {
    entryFile: resolve(repoRoot, 'wasm', 'truskiiMcmKernel.ts'),
    outFile: resolve(repoRoot, 'src', 'utils', 'importers', 'truskiiMcmKernel.wasm'),
  },
];

for (const { entryFile, outFile } of builds) {
  await mkdir(dirname(outFile), { recursive: true });

  const args = [
    entryFile,
    '-O3',
    '--noAssert',
    '--runtime', 'stub',
    '--enable', 'simd',
    '--outFile', outFile,
  ];

  if (process.platform === 'win32') {
    const ascBinary = resolve(repoRoot, 'node_modules', '.bin', 'asc.cmd');
    await execFileAsync('cmd.exe', ['/c', ascBinary, ...args]);
  } else {
    const ascBinary = resolve(repoRoot, 'node_modules', '.bin', 'asc');
    await execFileAsync(ascBinary, args);
  }
}
