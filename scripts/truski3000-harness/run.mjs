import { spawn } from 'node:child_process';
import { mkdir, readdir, readFile, rm, writeFile, cp } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import http from 'node:http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');
const harnessRoot = path.resolve(repoRoot, 'scripts', 'truski3000-harness');
const fixturesDir = path.resolve(harnessRoot, 'fixtures');
const publicFixturesDir = path.resolve(repoRoot, 'public', 'truski3000-harness', 'fixtures');
const outputRoot = path.resolve(harnessRoot, 'output');
const latestOutputDir = path.resolve(outputRoot, 'latest');
const baselineDir = path.resolve(harnessRoot, 'baselines');
const manifestPath = path.resolve(harnessRoot, 'manifest.json');
const benchmarkOutputPath = path.resolve(outputRoot, 'benchmarks', 'latest.json');
const parityOutputPath = path.resolve(outputRoot, 'parity', 'latest.json');
const validationOutputPath = path.resolve(outputRoot, 'validation', 'latest.json');
const preferredHarnessPort = 4173;
const progressLogPrefix = '[TRUSKI_PROGRESS] ';
const backendLogPrefix = '[TRUSKI_BACKEND] ';
const validAccelerationModes = ['auto', 'wasm', 'js'];

const command = process.argv[2] ?? 'compare';
const validCommands = new Set(['record', 'compare', 'benchmark', 'parity', 'validate']);
if (!validCommands.has(command)) {
  console.error(`Unknown command: ${command}`);
  console.error('Usage: node scripts/truski3000-harness/run.mjs [record|compare|benchmark|parity|validate]');
  process.exit(1);
}

const runAllFixtures = process.argv.includes('--all');
const fixtureFilterIndex = process.argv.indexOf('--fixture');
const fixtureFilter = fixtureFilterIndex >= 0 ? process.argv[fixtureFilterIndex + 1] ?? null : null;
const modeFilterIndex = process.argv.indexOf('--mode');
const modeFilter = modeFilterIndex >= 0 ? process.argv[modeFilterIndex + 1] ?? null : null;
const presetFilterIndex = process.argv.indexOf('--preset');
const presetFilter = presetFilterIndex >= 0 ? process.argv[presetFilterIndex + 1] ?? null : null;
const accelerationFilterIndex = process.argv.indexOf('--acceleration');
const accelerationFilter = accelerationFilterIndex >= 0 ? process.argv[accelerationFilterIndex + 1] ?? null : null;
const maxMsFlagIndex = process.argv.indexOf('--max-ms');
const scenarioTimeoutMs = maxMsFlagIndex >= 0
  ? Math.max(0, Number.parseInt(process.argv[maxMsFlagIndex + 1] ?? '180000', 10) || 180000)
  : 180000;
const iterationsFlagIndex = process.argv.indexOf('--iterations');
const benchmarkIterations = iterationsFlagIndex >= 0
  ? Math.max(1, Number.parseInt(process.argv[iterationsFlagIndex + 1] ?? '2', 10) || 2)
  : 2;

const modeMatrix = {
  standard: {
    outputStandard: true,
    outputEcm: false,
    outputMcm: false,
  },
  ecm: {
    outputStandard: false,
    outputEcm: true,
    outputMcm: false,
  },
  mcm: {
    outputStandard: false,
    outputEcm: false,
    outputMcm: true,
  },
};

const benchmarkProfiles = [
  {
    id: 'default',
    settings: {},
  },
  {
    id: 'true-neutral',
    settings: {
      brightnessFactor: 1.0,
      saturationFactor: 1.0,
      saliencyAlpha: 0.0,
      lumMatchWeight: 0,
      csfWeight: 0,
      includeTypographic: false,
      paletteId: 'colodore',
      manualBgColor: null,
    },
  },
];

function modeIds() {
  return Object.keys(modeMatrix);
}

function formatRequestedAcceleration(mode = accelerationFilter ?? 'auto') {
  switch (mode) {
    case 'js':
      return 'JS ONLY';
    case 'wasm':
      return 'WASM ONLY';
    default:
      return 'AUTO';
  }
}

function runCommand(cmd, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: repoRoot,
      stdio: 'inherit',
      shell: false,
      ...options,
    });

    child.on('error', reject);
    child.on('exit', code => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${cmd} ${args.join(' ')} exited with code ${code}`));
    });
  });
}

async function syncFixturesToPublic() {
  await rm(publicFixturesDir, { recursive: true, force: true });
  await mkdir(path.dirname(publicFixturesDir), { recursive: true });
  await cp(fixturesDir, publicFixturesDir, { recursive: true });
}

function waitForUrl(url, timeoutMs = 90000) {
  const deadline = Date.now() + timeoutMs;

  return new Promise((resolve, reject) => {
    const attempt = () => {
      const request = http.get(url, response => {
        response.resume();
        if ((response.statusCode ?? 500) < 400) {
          resolve();
          return;
        }
        if (Date.now() > deadline) {
          reject(new Error(`Timed out waiting for ${url}`));
          return;
        }
        setTimeout(attempt, 250);
      });

      request.on('error', () => {
        if (Date.now() > deadline) {
          reject(new Error(`Timed out waiting for ${url}`));
          return;
        }
        setTimeout(attempt, 250);
      });
    };

    attempt();
  });
}

function startHarnessServer() {
  const child = spawn(
    process.platform === 'win32' ? 'npm.cmd' : 'npm',
    ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(preferredHarnessPort)],
    {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );
  let resolved = false;
  let bufferedStdout = '';
  let bufferedStderr = '';

  const readyUrl = new Promise((resolve, reject) => {
    const inspect = chunk => {
      const match = chunk.match(/Local:\s+http:\/\/127\.0\.0\.1:(\d+)\//);
      if (!match || resolved) {
        return;
      }
      resolved = true;
      resolve(`http://127.0.0.1:${match[1]}/truski3000-harness.html`);
    };

    child.stdout?.on('data', chunk => {
      const text = chunk.toString();
      process.stdout.write(text);
      bufferedStdout += text;
      inspect(bufferedStdout);
      if (bufferedStdout.length > 4096) {
        bufferedStdout = bufferedStdout.slice(-4096);
      }
    });

    child.stderr?.on('data', chunk => {
      const text = chunk.toString();
      process.stderr.write(text);
      bufferedStderr += text;
      inspect(bufferedStderr);
      if (bufferedStderr.length > 4096) {
        bufferedStderr = bufferedStderr.slice(-4096);
      }
    });

    child.on('exit', code => {
      if (!resolved) {
        reject(new Error(`Harness dev server exited before becoming ready (code ${code ?? 'unknown'})`));
      }
    });
    child.on('error', reject);
  });

  return { child, readyUrl };
}

async function listScenarios() {
  const entries = await readdir(fixturesDir, { withFileTypes: true });
  const available = entries
    .filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith('.png'))
    .map(entry => entry.name)
    .sort();

  let scenarios;

  if (runAllFixtures) {
    scenarios = available.flatMap(fixture => modeIds().map(mode => ({ fixture, mode })));
  } else {
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    const manifestScenarios = Array.isArray(manifest.scenarios) ? manifest.scenarios : [];
    const availableSet = new Set(available);
    const expanded = [];

    for (const scenario of manifestScenarios) {
      if (!scenario || typeof scenario.fixture !== 'string' || !Array.isArray(scenario.modes)) {
        continue;
      }
      if (!availableSet.has(scenario.fixture)) {
        throw new Error(`Harness manifest fixture not found: ${scenario.fixture}`);
      }
      for (const mode of scenario.modes) {
        if (!modeIds().includes(mode)) {
          throw new Error(`Harness manifest mode is invalid: ${mode}`);
        }
        expanded.push({ fixture: scenario.fixture, mode });
      }
    }
    scenarios = expanded;
  }

  if (scenarios.length === 0) {
    throw new Error('Harness manifest did not define any runnable scenarios');
  }

  if (modeFilter && !modeIds().includes(modeFilter)) {
    throw new Error(`Harness mode filter is invalid: ${modeFilter}`);
  }
  if (accelerationFilter && !validAccelerationModes.includes(accelerationFilter)) {
    throw new Error(`Unknown acceleration mode: ${accelerationFilter}`);
  }

  const filtered = scenarios.filter(scenario => {
    if (fixtureFilter && scenario.fixture !== fixtureFilter) {
      return false;
    }
    if (modeFilter && scenario.mode !== modeFilter) {
      return false;
    }
    return true;
  });

  if (filtered.length === 0) {
    throw new Error(
      `Harness filters matched no scenarios${fixtureFilter ? ` for fixture ${fixtureFilter}` : ''}${modeFilter ? ` and mode ${modeFilter}` : ''}`
    );
  }

  return filtered;
}

function dataUrlToBuffer(dataUrl) {
  const marker = 'base64,';
  const base64Index = dataUrl.indexOf(marker);
  if (base64Index === -1) {
    throw new Error('Unexpected preview data URL format');
  }
  return Buffer.from(dataUrl.slice(base64Index + marker.length), 'base64');
}

async function writeRunArtifacts(result) {
  const fixtureName = path.parse(result.fixture).name;

  for (const [mode, summary] of Object.entries(result.summaries)) {
    if (!summary) continue;
    const previewDataUrl = result.previews[mode];
    if (!previewDataUrl) {
      throw new Error(`Missing preview for ${result.fixture} / ${mode}`);
    }

    const modeDir = path.resolve(latestOutputDir, mode, fixtureName);
    await mkdir(modeDir, { recursive: true });
    await writeFile(path.resolve(modeDir, 'summary.json'), JSON.stringify(summary, null, 2) + '\n', 'utf8');
    await writeFile(path.resolve(modeDir, 'preview.png'), dataUrlToBuffer(previewDataUrl));
  }
}

async function runHarnessFixture(page, fixtureName, settings, accelerationMode = 'auto') {
  const evaluatePromise = page.evaluate(
    async ({ nextFixtureName, modeSettings, nextAccelerationMode }) => {
      if (!window.__TRUSKI_HARNESS__) {
        throw new Error('Harness API is not available on window');
      }
      return await window.__TRUSKI_HARNESS__.runFixture({
        fixture: nextFixtureName,
        settings: modeSettings,
        accelerationMode: nextAccelerationMode,
      });
    },
    {
      nextFixtureName: fixtureName,
      modeSettings: settings,
      nextAccelerationMode: accelerationMode,
    }
  );

  if (scenarioTimeoutMs <= 0) {
    return await evaluatePromise;
  }

  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(
        `Harness scenario timed out after ${scenarioTimeoutMs}ms (${fixtureName}, acceleration=${accelerationMode})`
      ));
    }, scenarioTimeoutMs);
  });

  try {
    return await Promise.race([evaluatePromise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId);
  }
}

async function runKernelValidation(page) {
  return await page.evaluate(async () => {
    if (!window.__TRUSKI_HARNESS__) {
      throw new Error('Harness API is not available on window');
    }
    return await window.__TRUSKI_HARNESS__.validateKernels();
  });
}

function attachHarnessConsole(page) {
  page.on('console', message => {
    const text = message.text();

    if (text.startsWith(progressLogPrefix)) {
      try {
        const payload = JSON.parse(text.slice(progressLogPrefix.length));
        const detailSuffix = payload.detail ? ` - ${payload.detail}` : '';
        console.log(`Progress ${payload.fixture}: ${payload.stage} ${payload.pct}%${detailSuffix}`);
        return;
      } catch {
        console.log(text);
        return;
      }
    }

    if (text.startsWith(backendLogPrefix)) {
      try {
        const payload = JSON.parse(text.slice(backendLogPrefix.length));
        console.log(
          `BACKEND ${payload.fixture} ${payload.mode}: actual=${String(payload.backend).toUpperCase()} ` +
          `requested=${formatRequestedAcceleration(payload.accelerationMode)}`
        );
        return;
      } catch {
        console.log(text);
        return;
      }
    }
  });
}

async function runBenchmarks(page, scenarios) {
  const benchmarkResults = [];
  const profiles = presetFilter
    ? benchmarkProfiles.filter(profile => profile.id === presetFilter)
    : benchmarkProfiles;
  const accelerationModes = accelerationFilter
    ? validAccelerationModes.filter(mode => mode === accelerationFilter)
    : validAccelerationModes;

  if (presetFilter && profiles.length === 0) {
    throw new Error(`Unknown benchmark preset: ${presetFilter}`);
  }

  for (const profile of profiles) {
    for (const scenario of scenarios) {
      const scenarioSettings = {
        ...profile.settings,
        ...modeMatrix[scenario.mode],
      };

      for (const accelerationMode of accelerationModes) {
        console.log(
          `Benchmark ${profile.id} [${formatRequestedAcceleration(accelerationMode)}] -> ` +
          `${scenario.mode} ${scenario.fixture} (${benchmarkIterations} iterations)`
        );

        await runHarnessFixture(page, scenario.fixture, scenarioSettings, accelerationMode);
        const samples = [];
        let backendByMode = {};

        for (let iteration = 0; iteration < benchmarkIterations; iteration++) {
          const result = await runHarnessFixture(page, scenario.fixture, scenarioSettings, accelerationMode);
          samples.push(result.elapsedMs);
          backendByMode = result.backendByMode;
        }

        const meanElapsedMs = samples.reduce((sum, value) => sum + value, 0) / samples.length;
        benchmarkResults.push({
          fixture: scenario.fixture,
          mode: scenario.mode,
          preset: profile.id,
          accelerationMode,
          iterations: benchmarkIterations,
          samplesMs: samples,
          meanElapsedMs: Number(meanElapsedMs.toFixed(2)),
          backendByMode,
        });
      }
    }
  }

  await mkdir(path.dirname(benchmarkOutputPath), { recursive: true });
  await writeFile(benchmarkOutputPath, JSON.stringify({ benchmarkResults }, null, 2) + '\n', 'utf8');

  console.log('TRUSKI3000 harness benchmark results:');
  for (const result of benchmarkResults) {
    console.log(
      `- ${result.preset} ${result.accelerationMode} ${result.mode}/${result.fixture}: ` +
      `${result.meanElapsedMs}ms avg [${result.samplesMs.map(value => value.toFixed(1)).join(', ')}] ` +
      `backend=${JSON.stringify(result.backendByMode)}`
    );
  }
  console.log(`Benchmark JSON written to ${benchmarkOutputPath}`);
}

async function runBackendParity(page, scenarios) {
  const parityResults = [];
  const failures = [];

  for (const scenario of scenarios) {
    const settings = modeMatrix[scenario.mode];
    console.log(`Parity ${scenario.mode} -> ${scenario.fixture} [JS ONLY vs WASM ONLY]`);

    const jsResult = await runHarnessFixture(page, scenario.fixture, settings, 'js');
    const wasmResult = await runHarnessFixture(page, scenario.fixture, settings, 'wasm');
    const jsSummary = jsResult.summaries[scenario.mode];
    const wasmSummary = wasmResult.summaries[scenario.mode];
    const jsPreview = jsResult.previews[scenario.mode];
    const wasmPreview = wasmResult.previews[scenario.mode];

    if (!jsSummary || !wasmSummary || !jsPreview || !wasmPreview) {
      failures.push(`${scenario.mode}/${scenario.fixture}: missing summary or preview`);
      continue;
    }

    const summaryMatches = JSON.stringify(jsSummary) === JSON.stringify(wasmSummary);
    const previewMatches = jsPreview === wasmPreview;

    parityResults.push({
      fixture: scenario.fixture,
      mode: scenario.mode,
      summaryMatches,
      previewMatches,
      jsBackend: jsResult.backendByMode[scenario.mode],
      wasmBackend: wasmResult.backendByMode[scenario.mode],
      jsSummary,
      wasmSummary,
    });

    if (!summaryMatches) {
      failures.push(`${scenario.mode}/${scenario.fixture}: summary mismatch (JS vs WASM)`);
    }
    if (!previewMatches) {
      failures.push(`${scenario.mode}/${scenario.fixture}: preview mismatch (JS vs WASM)`);
    }
  }

  await mkdir(path.dirname(parityOutputPath), { recursive: true });
  await writeFile(parityOutputPath, JSON.stringify({ parityResults }, null, 2) + '\n', 'utf8');

  if (failures.length > 0) {
    console.error('TRUSKI3000 harness parity failed:');
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    console.error(`Parity JSON written to ${parityOutputPath}`);
    process.exit(1);
  }

  console.log(`TRUSKI3000 harness parity passed. JSON written to ${parityOutputPath}`);
}

async function compareAgainstBaselines() {
  const failures = [];

  for (const mode of Object.keys(modeMatrix)) {
    const latestModeDir = path.resolve(latestOutputDir, mode);
    let fixtures = [];
    try {
      fixtures = await readdir(latestModeDir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const fixtureEntry of fixtures) {
      if (!fixtureEntry.isDirectory()) continue;
      const fixtureName = fixtureEntry.name;
      const latestSummaryPath = path.resolve(latestModeDir, fixtureName, 'summary.json');
      const latestPreviewPath = path.resolve(latestModeDir, fixtureName, 'preview.png');
      const baselineSummaryPath = path.resolve(baselineDir, mode, fixtureName, 'summary.json');
      const baselinePreviewPath = path.resolve(baselineDir, mode, fixtureName, 'preview.png');

      try {
        const [latestSummary, baselineSummary, latestPreview, baselinePreview] = await Promise.all([
          readFile(latestSummaryPath),
          readFile(baselineSummaryPath),
          readFile(latestPreviewPath),
          readFile(baselinePreviewPath),
        ]);

        if (!latestSummary.equals(baselineSummary)) {
          failures.push(`${mode}/${fixtureName}: summary mismatch`);
        }
        if (!latestPreview.equals(baselinePreview)) {
          failures.push(`${mode}/${fixtureName}: preview mismatch`);
        }
      } catch (error) {
        failures.push(`${mode}/${fixtureName}: missing baseline (${error instanceof Error ? error.message : String(error)})`);
      }
    }
  }

  if (failures.length > 0) {
    console.error('TRUSKI3000 harness compare failed:');
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }
}

async function recordBaselines() {
  await mkdir(baselineDir, { recursive: true });

  for (const modeEntry of await readdir(latestOutputDir, { withFileTypes: true })) {
    if (!modeEntry.isDirectory()) continue;
    const latestModeDir = path.resolve(latestOutputDir, modeEntry.name);
    const baselineModeDir = path.resolve(baselineDir, modeEntry.name);
    await mkdir(baselineModeDir, { recursive: true });

    for (const fixtureEntry of await readdir(latestModeDir, { withFileTypes: true })) {
      if (!fixtureEntry.isDirectory()) continue;
      const latestFixtureDir = path.resolve(latestModeDir, fixtureEntry.name);
      const baselineFixtureDir = path.resolve(baselineModeDir, fixtureEntry.name);
      await rm(baselineFixtureDir, { recursive: true, force: true });
      await cp(latestFixtureDir, baselineFixtureDir, { recursive: true });
    }
  }
}

async function main() {
  await syncFixturesToPublic();
  await rm(latestOutputDir, { recursive: true, force: true });
  await mkdir(latestOutputDir, { recursive: true });
  await runCommand(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build']);

  const { child: harnessServer, readyUrl } = startHarnessServer();
  const stopHarnessServer = () => {
    if (!harnessServer.killed) {
      harnessServer.kill('SIGTERM');
    }
  };

  process.on('exit', stopHarnessServer);
  process.on('SIGINT', () => {
    stopHarnessServer();
    process.exit(130);
  });
  const harnessUrl = await readyUrl;
  await waitForUrl(harnessUrl);

  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    throw new Error('Playwright is not installed. Run `npm install` and `npx playwright install chromium` first.');
  }

  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage();
    attachHarnessConsole(page);
    await page.goto(harnessUrl, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => Boolean(window.__TRUSKI_HARNESS__));

    const scenarios = await listScenarios();
    console.log(`Harness acceleration request: ${formatRequestedAcceleration()}`);
    console.log(`Harness scenario timeout: ${scenarioTimeoutMs > 0 ? `${scenarioTimeoutMs}ms` : 'disabled'}`);
    if (command === 'benchmark') {
      await runBenchmarks(page, scenarios);
      return;
    }
    if (command === 'parity') {
      await runBackendParity(page, scenarios);
      return;
    }
    if (command === 'validate') {
      const validation = await runKernelValidation(page);
      await mkdir(path.dirname(validationOutputPath), { recursive: true });
      await writeFile(validationOutputPath, JSON.stringify(validation, null, 2) + '\n', 'utf8');
      if (!validation.passed) {
        console.error('TRUSKI3000 harness validation failed:');
        for (const mismatch of validation.mismatches) {
          console.error(`- ${mismatch}`);
        }
        process.exit(1);
      }
      console.log(
        'TRUSKI3000 harness validation passed: ' +
        `${validation.standardSetErrCases} standard setErr cases, ` +
        `${validation.standardHammingCases} binary Hamming cases, ` +
        `${validation.mcmMatrixCases} MCM matrix cases, ` +
        `${validation.mcmHammingCases} MCM Hamming cases`
      );
      console.log(`Validation JSON written to ${validationOutputPath}`);
      return;
    }

    for (const scenario of scenarios) {
      const settings = modeMatrix[scenario.mode];
      console.log(`Running ${scenario.mode} -> ${scenario.fixture} [${formatRequestedAcceleration()}]`);
      const result = await runHarnessFixture(page, scenario.fixture, settings, accelerationFilter ?? 'auto');
      await writeRunArtifacts(result);
    }
  } finally {
    await browser.close();
    stopHarnessServer();
  }

  if (command === 'record') {
    await recordBaselines();
    console.log(`Recorded baselines in ${baselineDir}`);
    return;
  }

  await compareAgainstBaselines();
  console.log('TRUSKI3000 harness compare passed.');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
