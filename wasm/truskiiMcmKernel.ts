const COLOR_COUNT: i32 = 16;
const CHAR_COUNT: i32 = 256;
const PIXEL_COUNT: i32 = 64;
const PAIR_COUNT: i32 = 32;
const MAX_POSITION_COUNT: i32 = CHAR_COUNT * PIXEL_COUNT;
const MAX_PAIR_POSITION_COUNT: i32 = CHAR_COUNT * PAIR_COUNT;
const SET_ERR_COUNT: i32 = CHAR_COUNT * COLOR_COUNT;
const BIT_PAIR_ERR_COUNT: i32 = CHAR_COUNT * 4 * COLOR_COUNT;

const weightedPixelErrors = new Float32Array(PIXEL_COUNT * COLOR_COUNT);
const weightedPairErrors = new Float32Array(PAIR_COUNT * COLOR_COUNT);
const positionOffsets = new Int32Array(CHAR_COUNT + 1);
const flatPositions = new Uint8Array(MAX_POSITION_COUNT);
const mcmPositionOffsets0 = new Int32Array(CHAR_COUNT + 1);
const mcmPositionOffsets1 = new Int32Array(CHAR_COUNT + 1);
const mcmPositionOffsets2 = new Int32Array(CHAR_COUNT + 1);
const mcmPositionOffsets3 = new Int32Array(CHAR_COUNT + 1);
const flatMcmPositions0 = new Uint8Array(MAX_PAIR_POSITION_COUNT);
const flatMcmPositions1 = new Uint8Array(MAX_PAIR_POSITION_COUNT);
const flatMcmPositions2 = new Uint8Array(MAX_PAIR_POSITION_COUNT);
const flatMcmPositions3 = new Uint8Array(MAX_PAIR_POSITION_COUNT);
const outputSetErrs = new Float32Array(SET_ERR_COUNT);
const outputBitPairErrs = new Float32Array(BIT_PAIR_ERR_COUNT);

export function getWeightedPixelErrorsPtr(): usize { return weightedPixelErrors.dataStart; }
export function getWeightedPairErrorsPtr(): usize { return weightedPairErrors.dataStart; }
export function getPositionOffsetsPtr(): usize { return positionOffsets.dataStart; }
export function getFlatPositionsPtr(): usize { return flatPositions.dataStart; }
export function getMcmPositionOffsets0Ptr(): usize { return mcmPositionOffsets0.dataStart; }
export function getMcmPositionOffsets1Ptr(): usize { return mcmPositionOffsets1.dataStart; }
export function getMcmPositionOffsets2Ptr(): usize { return mcmPositionOffsets2.dataStart; }
export function getMcmPositionOffsets3Ptr(): usize { return mcmPositionOffsets3.dataStart; }
export function getFlatMcmPositions0Ptr(): usize { return flatMcmPositions0.dataStart; }
export function getFlatMcmPositions1Ptr(): usize { return flatMcmPositions1.dataStart; }
export function getFlatMcmPositions2Ptr(): usize { return flatMcmPositions2.dataStart; }
export function getFlatMcmPositions3Ptr(): usize { return flatMcmPositions3.dataStart; }
export function getOutputSetErrsPtr(): usize { return outputSetErrs.dataStart; }
export function getOutputBitPairErrsPtr(): usize { return outputBitPairErrs.dataStart; }

function zero16(ptr: usize, zero: v128): void {
  v128.store(ptr, zero);
  v128.store(ptr + 16, zero);
  v128.store(ptr + 32, zero);
  v128.store(ptr + 48, zero);
}

function accumulatePositions(
  outputPtr: usize,
  inputBasePtr: usize,
  positions: Uint8Array,
  offsets: Int32Array,
  ch: i32
): void {
  const start = offsets[ch];
  const end = offsets[ch + 1];
  for (let i: i32 = start; i < end; i++) {
    const inPtr: usize = inputBasePtr + (<usize>((<i32>positions[i]) << 4) << 2);
    v128.store(outputPtr,      f32x4.add(v128.load(outputPtr),      v128.load(inPtr)));
    v128.store(outputPtr + 16, f32x4.add(v128.load(outputPtr + 16), v128.load(inPtr + 16)));
    v128.store(outputPtr + 32, f32x4.add(v128.load(outputPtr + 32), v128.load(inPtr + 32)));
    v128.store(outputPtr + 48, f32x4.add(v128.load(outputPtr + 48), v128.load(inPtr + 48)));
  }
}

export function computeMatrices(): void {
  const zero = f32x4.splat(0);
  const pixelBasePtr = weightedPixelErrors.dataStart;
  const pairBasePtr = weightedPairErrors.dataStart;

  for (let ch: i32 = 0; ch < CHAR_COUNT; ch++) {
    const setOutPtr: usize = outputSetErrs.dataStart + (<usize>(ch << 4) << 2);
    zero16(setOutPtr, zero);
    accumulatePositions(setOutPtr, pixelBasePtr, flatPositions, positionOffsets, ch);

    const bp0Ptr: usize = outputBitPairErrs.dataStart + (<usize>((ch * 64) << 2));
    const bp1Ptr: usize = bp0Ptr + 64;
    const bp2Ptr: usize = bp1Ptr + 64;
    const bp3Ptr: usize = bp2Ptr + 64;

    zero16(bp0Ptr, zero);
    zero16(bp1Ptr, zero);
    zero16(bp2Ptr, zero);
    zero16(bp3Ptr, zero);

    accumulatePositions(bp0Ptr, pairBasePtr, flatMcmPositions0, mcmPositionOffsets0, ch);
    accumulatePositions(bp1Ptr, pairBasePtr, flatMcmPositions1, mcmPositionOffsets1, ch);
    accumulatePositions(bp2Ptr, pairBasePtr, flatMcmPositions2, mcmPositionOffsets2, ch);
    accumulatePositions(bp3Ptr, pairBasePtr, flatMcmPositions3, mcmPositionOffsets3, ch);
  }
}
