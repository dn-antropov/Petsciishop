import {
  CELL_GRADIENT_DIAGONAL_LEFT,
  CELL_GRADIENT_DIAGONAL_RIGHT,
  CELL_GRADIENT_HORIZONTAL,
  CELL_GRADIENT_ISOTROPIC,
  CELL_GRADIENT_VERTICAL,
  type CellGradientDirection,
} from './imageConverterCellMetrics';

const GLYPH_COUNT = 256;
const GLYPH_SIDE = 8;
const GLYPH_PIXELS = GLYPH_SIDE * GLYPH_SIDE;
const MAX_TRANSITIONS = (GLYPH_SIDE * (GLYPH_SIDE - 1)) * 2;

export interface GlyphAtlasMetadata {
  coverage: Float32Array;
  spatialFrequency: Float32Array;
  dominantDirection: Uint8Array;
  symmetryHorizontal: Uint8Array;
  symmetryVertical: Uint8Array;
  symmetryRotational: Uint8Array;
  luminanceMean: Float32Array;
  luminanceVariance: Float32Array;
}

function computeVariance(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  let variance = 0;
  for (let i = 0; i < values.length; i++) {
    const delta = values[i] - mean;
    variance += delta * delta;
  }
  return variance / values.length;
}

function computeDominantDirection(glyph: Uint8Array): CellGradientDirection {
  const rowCounts = new Array<number>(GLYPH_SIDE).fill(0);
  const colCounts = new Array<number>(GLYPH_SIDE).fill(0);
  const diagRightCounts = new Array<number>((GLYPH_SIDE * 2) - 1).fill(0);
  const diagLeftCounts = new Array<number>((GLYPH_SIDE * 2) - 1).fill(0);
  let setCount = 0;

  for (let y = 0; y < GLYPH_SIDE; y++) {
    for (let x = 0; x < GLYPH_SIDE; x++) {
      if (!glyph[y * GLYPH_SIDE + x]) continue;
      setCount++;
      rowCounts[y]++;
      colCounts[x]++;
      diagRightCounts[x - y + (GLYPH_SIDE - 1)]++;
      diagLeftCounts[x + y]++;
    }
  }

  if (setCount === 0) {
    return CELL_GRADIENT_ISOTROPIC;
  }

  const horizontalBias = computeVariance(rowCounts);
  const verticalBias = computeVariance(colCounts);
  const diagonalRightBias = computeVariance(diagRightCounts);
  const diagonalLeftBias = computeVariance(diagLeftCounts);
  const dominantBias = Math.max(horizontalBias, verticalBias, diagonalRightBias, diagonalLeftBias);

  if (dominantBias <= 1e-6) {
    return CELL_GRADIENT_ISOTROPIC;
  }

  if (dominantBias === horizontalBias) return CELL_GRADIENT_HORIZONTAL;
  if (dominantBias === verticalBias) return CELL_GRADIENT_VERTICAL;
  if (dominantBias === diagonalRightBias) return CELL_GRADIENT_DIAGONAL_RIGHT;
  return CELL_GRADIENT_DIAGONAL_LEFT;
}

function isHorizontallySymmetric(glyph: Uint8Array): boolean {
  for (let y = 0; y < GLYPH_SIDE / 2; y++) {
    for (let x = 0; x < GLYPH_SIDE; x++) {
      if (glyph[y * GLYPH_SIDE + x] !== glyph[(GLYPH_SIDE - 1 - y) * GLYPH_SIDE + x]) {
        return false;
      }
    }
  }
  return true;
}

function isVerticallySymmetric(glyph: Uint8Array): boolean {
  for (let y = 0; y < GLYPH_SIDE; y++) {
    for (let x = 0; x < GLYPH_SIDE / 2; x++) {
      if (glyph[y * GLYPH_SIDE + x] !== glyph[y * GLYPH_SIDE + (GLYPH_SIDE - 1 - x)]) {
        return false;
      }
    }
  }
  return true;
}

function isRotationallySymmetric(glyph: Uint8Array): boolean {
  for (let y = 0; y < GLYPH_SIDE; y++) {
    for (let x = 0; x < GLYPH_SIDE; x++) {
      const mirroredIndex = (GLYPH_SIDE - 1 - y) * GLYPH_SIDE + (GLYPH_SIDE - 1 - x);
      if (glyph[y * GLYPH_SIDE + x] !== glyph[mirroredIndex]) {
        return false;
      }
    }
  }
  return true;
}

export function buildGlyphAtlasMetadata(ref: Uint8Array[]): GlyphAtlasMetadata {
  const coverage = new Float32Array(GLYPH_COUNT);
  const spatialFrequency = new Float32Array(GLYPH_COUNT);
  const dominantDirection = new Uint8Array(GLYPH_COUNT);
  const symmetryHorizontal = new Uint8Array(GLYPH_COUNT);
  const symmetryVertical = new Uint8Array(GLYPH_COUNT);
  const symmetryRotational = new Uint8Array(GLYPH_COUNT);
  const luminanceMean = new Float32Array(GLYPH_COUNT);
  const luminanceVariance = new Float32Array(GLYPH_COUNT);

  for (let ch = 0; ch < GLYPH_COUNT; ch++) {
    const glyph = ref[ch];
    let setCount = 0;
    let transitions = 0;

    for (let y = 0; y < GLYPH_SIDE; y++) {
      for (let x = 0; x < GLYPH_SIDE; x++) {
        const index = y * GLYPH_SIDE + x;
        const value = glyph[index];
        setCount += value;

        if (x < GLYPH_SIDE - 1 && value !== glyph[index + 1]) {
          transitions++;
        }
        if (y < GLYPH_SIDE - 1 && value !== glyph[index + GLYPH_SIDE]) {
          transitions++;
        }
      }
    }

    const mean = setCount / GLYPH_PIXELS;
    coverage[ch] = mean;
    luminanceMean[ch] = mean;
    luminanceVariance[ch] = mean * (1 - mean);
    spatialFrequency[ch] = transitions / MAX_TRANSITIONS;
    dominantDirection[ch] = computeDominantDirection(glyph);
    symmetryHorizontal[ch] = isHorizontallySymmetric(glyph) ? 1 : 0;
    symmetryVertical[ch] = isVerticallySymmetric(glyph) ? 1 : 0;
    symmetryRotational[ch] = isRotationallySymmetric(glyph) ? 1 : 0;
  }

  return {
    coverage,
    spatialFrequency,
    dominantDirection,
    symmetryHorizontal,
    symmetryVertical,
    symmetryRotational,
    luminanceMean,
    luminanceVariance,
  };
}
