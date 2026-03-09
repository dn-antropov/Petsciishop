TRUSKI3000 regression harness fixtures live here.

`fixtures/` contains source PNGs copied from `/Users/rob/Desktop/PETSCII_TEST`.

Current fixture set:
- `doggy.png`
- `house-a.png`
- `ironmaiden-a.png`
- `ninja-a.png`
- `padle-a.png`
- `skeletor.png`
- `slayer_320x200.png`
- `slayer_black.png`
- `slayer_multi_color.png`
- `slayer_white.png`

These are intended for repeatable before/after converter checks while tuning heuristics such as:
- brightness debt
- color coherence cleanup
- chroma preservation
- typographic exclusion
- low-contrast pair pruning

`manifest.json` defines the default regression scenarios used by the automated harness, including which modes each fixture should exercise.

Harness commands:
- `npm run truski:harness:record` records baselines for the core subset
- `npm run truski:harness:compare` reruns the core subset and diffs against baselines
- `npm run truski:harness:compare:mcm` reruns only the manifest MCM scenarios and diffs against baselines
- `npm run truski:harness:benchmark -- --iterations 1` measures the current harness scenarios under `auto`, forced-`wasm`, and forced-`js` worker modes, writing JSON to `output/benchmarks/latest.json`
- `npm run truski:harness:benchmark:mcm` benchmarks only the MCM manifest scenarios under the `true-neutral` preset with `auto` backend selection
- `npm run truski:harness:parity` runs each harness scenario twice, once in `JS ONLY` and once in `WASM ONLY`, and fails if summaries or previews differ
- `npm run truski:harness:parity:mcm` runs the end-to-end backend parity check only for manifest MCM scenarios, writing JSON to `output/parity/latest.json`
- `npm run truski:harness:validate` checks the browser-loaded WASM kernels against JS reference implementations across all 256 glyphs and representative Standard/MCM color cases, writing JSON to `output/validation/latest.json`
- add `-- --all` to `record`, `compare`, or `benchmark` to run the full PNG corpus
- add `-- --fixture slayer_multi_color.png --mode mcm` to target one manifest scenario
- add `-- --preset true-neutral` to benchmark only one benchmark profile
- add `-- --acceleration wasm` or `-- --acceleration js` to force a single backend
- add `-- --max-ms 180000` to override the default per-scenario timeout
- the harness now streams converter progress and backend selection lines from the browser page into the terminal
- `record` now updates only the scenarios generated into `output/latest`, so subset recordings no longer wipe unrelated baselines
