# TRUSKI3000 Implementation Roadmap

Goal: 100% coverage of `docs/TRUSKI3000_Engine.md`.

CODEX: Legal per-cell hires-versus-multicolor behavior within an MCM screen remains in scope throughout this roadmap. It is standard C64 behavior inside MCM, not forbidden cross-mode Standard/ECM/MCM mixing.

Effort: **XS** < 4h | **S** 1-2d | **M** 3-5d | **L** 1-2w | **XL** 2-4w

Each phase is ordered so dependencies are satisfied before the features that need them. Within a phase, items are ordered by impact.

---

## Phase 1 — Quick Wins

High quality gain per hour of work. No dependencies, no architectural changes. Pure scoring and post-processing additions to the existing pipeline.

| # | Feature | Spec | Effort | Impact | Why |
|---|---------|------|--------|--------|-----|
| 1.1 | **Brightness debt accumulation** | §5.5 | S | HIGH | Reduces banding and tonal stepping across cell boundaries. Scanline buffer tracking how much brighter/darker the best match was vs source mean, nudging the threshold for the next cell. Horizontal + vertical debt tracked separately. Cheap, visible on every image |
| 1.2 | **Color coherence post-pass** | §6.1 | S | HIGH | Scan for cells whose fg or bg color doesn't appear in any of the 4 neighbors. Re-match those cells constrained to neighbor colors. Accept if error increase < threshold. Eliminates the "speckle noise" that jumps out on smooth gradients |
| 1.3 | **Chroma preservation bonus** | §5.4 | XS | HIGH | Add a scoring term: if the chosen color pair preserves the dominant hue of the source patch (measure via `atan2(b,a)` in OKLAB), apply a bonus. Humans tolerate luminance error more than hue shifts. One line in the scoring function |
| 1.4 | **Typographic character exclusion** | §4 | XS | MEDIUM | Flag letters/digits/punctuation in the atlas (chars 0x01-0x1A, 0x30-0x39, etc.) and skip them during image matching by default. Add a `settings.includeTypographic` toggle. Prevents wrong matches in smooth regions where a letter happens to have the right fill density |
| 1.5 | **Candidate pruning via distance LUT** | §5.2 | XS | PERF | Before testing a (fg, bg) pair, check `pairDiff[fg*16+bg]` against a minimum-contrast threshold. Skip pairs that are perceptually too close — they can't produce useful detail. Reduces Standard mode candidates from 240 to ~40-60. No quality change, pure speed |

**Phase 1 total: ~1 week. Expected outcome: noticeably cleaner output on photos and gradients.**

---

## Phase 2 — Atlas & Cell Statistics Foundation

Builds the data structures that Phase 3's perceptual scoring needs. No user-visible quality change on its own, but unblocks the biggest wins.

| # | Feature | Spec | Effort | Impact | Why |
|---|---------|------|--------|--------|-----|
| 2.1 | **Detail score (Laplacian)** | §1 | S | FOUNDATION | Per-cell scalar from a 3x3 Laplacian convolution on the L channel. High value = edges/texture, low = smooth. Stored in a `Float32Array[1000]` alongside existing `variances`. Required by CSF scoring (3.1) |
| 2.2 | **Dominant gradient direction** | §1 | S | FOUNDATION | Per-cell angle from Sobel Gx/Gy on the L channel, quantized to 4 bins (horizontal, vertical, diagonal-right, diagonal-left) + isotropic. Stored per cell. Required by edge continuity pass (3.2) |
| 2.3 | **Glyph atlas tagging** | §4 | M | FOUNDATION | For each of the 256 glyphs, precompute: (a) **coverage** — `setCount/64` normalized, (b) **spatial frequency** — count transitions in rows+cols, normalize to [0,1], (c) **directionality** — horizontal vs vertical vs diagonal bias from row/col projection profiles, (d) **symmetry** — horizontal/vertical/rotational flags. Store as a `GlyphMetadata[]` array. Required by CSF (3.1) and edge continuity (3.2) |
| 2.4 | **Glyph luminance profiles** | §4 | XS | FOUNDATION | Per-glyph mean and variance of pixel coverage pattern. Enables fast pre-filtering: skip glyphs whose coverage is far from the source patch's luminance ratio. Reduces inner loop iterations before Hamming/error search |

**Phase 2 total: ~1.5 weeks. No direct output change — pure infrastructure.**

---

## Phase 3 — Perceptual Scoring Upgrades

The core quality leap. Uses Phase 2's data to make the matcher see like a human eye.

| # | Feature | Spec | Effort | Impact | Why | Depends on |
|---|---------|------|--------|--------|-----|------------|
| 3.1 | **CSF-weighted glyph scoring** | §5.4 | M | HIGH | The key insight: a high-frequency glyph (checkerboard, fine stripes) in a smooth source region looks like noise. Multiply the glyph's spatial frequency tag by `(1 - detailScore)` for the cell — smooth cell + busy glyph = penalty. This single change should dramatically reduce "texture noise" in skies, skin, and flat backgrounds | 2.1 + 2.3 |
| 3.2 | **Edge continuity post-pass** | §6.2 | M | HIGH | Along detected edges (cells with high detail score), check that consecutive glyph selections have compatible directionality. A diagonal edge rendered with random glyph orientations looks broken. Re-score candidates with a directional alignment bonus weighted by detail score. Re-assign if coherence improves without blowing the error budget | 2.2 + 2.3 |
| 3.3 | **Saliency weighting in palette solve** | §3 | S | MEDIUM | Pipe existing per-cell saliency weights into ECM background set ranking and MCM triple ranking. Currently palette solving treats all cells equally — a background register wasted on a low-saliency corner costs the same as one optimized for the focal point. Weight the ranking sum by cell saliency |
| 3.4 | **ECM register re-solve** | §6.3 | M | MEDIUM | After initial solve + screen matching, collect the actually-chosen background colors per cell. Run k-means (k=4) on those assignments weighted by cell error. If registers shift, re-match only affected cells. 1-2 iterations. Tightens ECM quality on images where initial register guess was suboptimal |

**Phase 3 total: ~2.5 weeks. Expected outcome: the "state of the art" quality jump — less texture noise, cleaner edges, better color allocation.**

---

## Phase 4 — Output & Measurement

Closes the feedback loop. Lets you measure quality objectively and export complete data.

| # | Feature | Spec | Effort | Impact | Why |
|---|---------|------|--------|--------|-----|
| 4.1 | **OKLAB ΔE quality metric** | §7 | S | MEDIUM | After conversion, render the output back to OKLAB pixel data and compute per-cell and whole-image mean ΔE vs source. Return as `qualityMetric: { meanDeltaE, perCell: Float32Array }`. Essential for A/B testing changes — "did this actually improve output?" needs a number, not eyeballing |
| 4.2 | **CODEX: Per-cell metadata export** | §7 | S | LOW | Expose `fgColor`, `bgColor`, `errorScore`, `detailScore`, and `saliencyWeight` per cell in `ConversionResult`, plus an MCM cell-behavior flag (for example `mcmCellIsHires`) for MCM exports. Global mode lives at `ConversionResult.mode`. Useful for debugging, heatmap visualization, and letting users see where the engine struggled |
| 4.3 | **CODEX: Aspect-ratio-correct preview** | §7 | XS | LOW | Display the preview at a 4:3 presentation aspect, for example in a 320x240 viewport or equivalent display-layer scaling, instead of showing raw 320x200 square pixels. Small but the spec calls for it and it's trivial |

**Phase 4 total: ~3 days. Expected outcome: measurable quality, debuggable output.**

---

## Phase 5 — WASM Performance

Algorithm is now stable and measurably good. Time to make it fast.

| # | Feature | Spec | Effort | Impact | Why |
|---|---------|------|--------|--------|-----|
| 5.1 | **XOR + popcount Hamming path** | §5.3 | L | PERF | The spec's matching algorithm: pack the threshold map as u64 (Standard) or u32 (MCM), XOR against each glyph bitmap, popcount for Hamming distance. This replaces per-pixel error accumulation with a single-instruction comparison per glyph. Profile both paths — the current error-accumulation approach may win in some cases because it naturally handles weighted pixels. Keep both, select per mode |
| 5.2 | **Distance LUT in WASM linear memory** | §3, §5 | S | PERF | Move the 16x16 `pairDiff` Float64Array into WASM linear memory at a fixed offset. Enables SIMD-width lookups in the kernel without JS↔WASM boundary crossings per cell |
| 5.3 | **Full WASM kernel buildout** | §5 | L | PERF | Port remaining hot paths: candidate scoring, CSF weighting, brightness debt, color coherence scan. Target i64x2 SIMD for the Hamming path (2 glyphs per instruction, 128 iterations for full atlas). Resolve current regression where AS kernel is slower than JS — likely memory layout or bounds-check overhead. Benchmark rigorously before shipping |

**Phase 5 total: ~3 weeks. Expected outcome: 3-10x speedup on the inner loop, making global refinement passes feel instant.**

---

## CODEX: Phase 6 — Global Legal Mode Selection

CODEX: The capstone is no longer mixed-mode region solving. The target is standard C64 PETSCII with no raster tricks, so Phase 6 focuses on choosing and explaining the best single legal full-screen mode.
CODEX: This does not remove legal per-cell hires-versus-multicolor behavior within MCM; that remains a valid optimization inside the MCM export path.

| # | Feature | Spec | Effort | Impact | Why |
|---|---------|------|--------|--------|-----|
| 6.1 | **CODEX: Global legal mode selection** | §2 | M | HIGH | Score the full image under Standard, ECM, and MCM, then choose the best single full-screen mode for standard C64 PETSCII export. The editor may still show alternate legal candidates, but the final output is one mode |
| 6.2 | **CODEX: Per-mode ranking + comparison output** | §2, §7 | S | MEDIUM | Expose total error and/or ΔE per legal mode so the editor can explain why one mode won and still let users inspect the other legal candidates. This replaces the old region-solver idea because raster tricks are out of scope |
| 6.3 | **CODEX: Advanced saliency** | §1 | L | MEDIUM | Graduate from deviation-based weighting to a richer saliency map: edge energy (Canny or Sobel magnitude) plus center bias. Feed it into palette solve, CSF weighting, and global mode selection. Biggest return is in deciding which single legal mode best serves the image |

**CODEX: Phase 6 total: ~2-3 weeks. Expected outcome: automatic selection of the best legal full-screen PETSCII mode, with clear comparison data for the alternatives.**

---

## Summary

| Phase | Duration | Cumulative | What Changes |
|-------|----------|------------|--------------|
| 1. Quick Wins | ~1w | 1w | Cleaner gradients, less speckle, better hue fidelity |
| 2. Foundation | ~1.5w | 2.5w | Infrastructure only (detail scores, glyph tags) |
| 3. Perceptual Scoring | ~2.5w | 5w | The big quality jump — CSF, edge continuity, smarter palette |
| 4. Output & Measurement | ~3d | 5.5w | ΔE metric, metadata, proper preview |
| 5. WASM Performance | ~3w | 8.5w | 3-10x speedup, SIMD Hamming path |
| CODEX: 6. Global Mode Selection | ~2-3w | ~11-11.5w | Full spec: best legal full-screen Standard, ECM, or MCM output per image |

**CODEX: Phases 1-3 deliver the biggest quality improvement. Phase 4 lets you prove it. Phase 5 makes it fast. Phase 6 completes the legal-mode selection story without leaving standard C64 PETSCII.**

CODEX: At the end of Phase 4, the engine hits ~85% of the spec with all the perceptually important features. Phases 5-6 close the remaining 15% — performance and global legal mode selection.
