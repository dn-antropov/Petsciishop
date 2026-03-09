export type PackedMcmGlyphMasks = [Uint32Array, Uint32Array, Uint32Array, Uint32Array];

export function packBinaryGlyphBitplanes(ref: Uint8Array[]): {
  packedBinaryGlyphLo: Uint32Array;
  packedBinaryGlyphHi: Uint32Array;
} {
  const packedBinaryGlyphLo = new Uint32Array(ref.length);
  const packedBinaryGlyphHi = new Uint32Array(ref.length);

  for (let ch = 0; ch < ref.length; ch++) {
    let lo = 0;
    let hi = 0;
    const glyph = ref[ch];
    for (let pixel = 0; pixel < glyph.length; pixel++) {
      if (!glyph[pixel]) continue;
      if (pixel < 32) {
        lo |= 1 << pixel;
      } else {
        hi |= 1 << (pixel - 32);
      }
    }
    packedBinaryGlyphLo[ch] = lo >>> 0;
    packedBinaryGlyphHi[ch] = hi >>> 0;
  }

  return {
    packedBinaryGlyphLo,
    packedBinaryGlyphHi,
  };
}

export function packBinaryThresholdMap(
  weightedPixelErrors: Float32Array,
  fg: number,
  bg: number
): [number, number] {
  let lo = 0;
  let hi = 0;

  for (let pixel = 0; pixel < 64; pixel++) {
    const base = pixel * 16;
    const useFg = weightedPixelErrors[base + fg] <= weightedPixelErrors[base + bg];
    if (!useFg) continue;
    if (pixel < 32) {
      lo |= 1 << pixel;
    } else {
      hi |= 1 << (pixel - 32);
    }
  }

  return [lo >>> 0, hi >>> 0];
}

export function packMcmGlyphSymbolMasks(refMcm: Uint8Array[]): PackedMcmGlyphMasks {
  const masks: PackedMcmGlyphMasks = [
    new Uint32Array(refMcm.length),
    new Uint32Array(refMcm.length),
    new Uint32Array(refMcm.length),
    new Uint32Array(refMcm.length),
  ];

  for (let ch = 0; ch < refMcm.length; ch++) {
    const glyph = refMcm[ch];
    for (let pairIndex = 0; pairIndex < glyph.length; pairIndex++) {
      const symbol = glyph[pairIndex];
      masks[symbol][ch] |= (1 << pairIndex) >>> 0;
    }
  }

  return masks;
}

export function packMcmThresholdMasks(
  weightedPairErrors: Float32Array,
  bg: number,
  mc1: number,
  mc2: number,
  fg: number
): Uint32Array {
  const masks = new Uint32Array(4);
  const palette = [bg, mc1, mc2, fg];

  for (let pairIndex = 0; pairIndex < 32; pairIndex++) {
    const base = pairIndex * 16;
    let bestSymbol = 0;
    let bestError = weightedPairErrors[base + palette[0]];
    for (let symbol = 1; symbol < 4; symbol++) {
      const error = weightedPairErrors[base + palette[symbol]];
      if (error < bestError) {
        bestError = error;
        bestSymbol = symbol;
      }
    }
    masks[bestSymbol] |= (1 << pairIndex) >>> 0;
  }

  return masks;
}

export function popcount32(value: number): number {
  let x = value >>> 0;
  x -= (x >>> 1) & 0x55555555;
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

export function computeBinaryHammingDistancesJs(
  thresholdLo: number,
  thresholdHi: number,
  packedBinaryGlyphLo: Uint32Array,
  packedBinaryGlyphHi: Uint32Array,
  output = new Uint8Array(packedBinaryGlyphLo.length)
): Uint8Array {
  for (let ch = 0; ch < packedBinaryGlyphLo.length; ch++) {
    output[ch] =
      popcount32((packedBinaryGlyphLo[ch] ^ thresholdLo) >>> 0) +
      popcount32((packedBinaryGlyphHi[ch] ^ thresholdHi) >>> 0);
  }
  return output;
}

export function computeMcmHammingDistancesJs(
  thresholdMasks: Uint32Array,
  packedMcmGlyphMasks: PackedMcmGlyphMasks,
  output = new Uint8Array(packedMcmGlyphMasks[0].length)
): Uint8Array {
  for (let ch = 0; ch < packedMcmGlyphMasks[0].length; ch++) {
    let matched = 0;
    for (let symbol = 0; symbol < 4; symbol++) {
      matched += popcount32((thresholdMasks[symbol] & packedMcmGlyphMasks[symbol][ch]) >>> 0);
    }
    output[ch] = 32 - matched;
  }
  return output;
}
