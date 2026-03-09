import wasmUrl from './truskiiBinaryKernel.wasm?url';

type BinaryKernelContext = {
  flatPositions: Uint8Array;
  positionOffsets: Int32Array;
  packedBinaryGlyphLo: Uint32Array;
  packedBinaryGlyphHi: Uint32Array;
};

type BinaryKernelExports = {
  memory: WebAssembly.Memory;
  getWeightedPixelErrorsPtr(): number;
  getPairDiffPtr(): number;
  getThresholdBitsPtr(): number;
  getPositionOffsetsPtr(): number;
  getFlatPositionsPtr(): number;
  getPackedBinaryGlyphLoPtr(): number;
  getPackedBinaryGlyphHiPtr(): number;
  getOutputSetErrsPtr(): number;
  getOutputHammingPtr(): number;
  computeSetErrs(): void;
  computeHammingDistances(): void;
};

type BinaryKernelImports = WebAssembly.Imports & {
  env: {
    abort(message?: number, fileName?: number, line?: number, column?: number): never;
  };
};

export interface StandardCandidateScoringKernel {
  computeSetErrs(weightedPixelErrors: Float32Array, context: BinaryKernelContext): Float32Array;
  computeHammingDistances(
    thresholdLo: number,
    thresholdHi: number,
    pairDiff: Float64Array,
    context: BinaryKernelContext
  ): Uint8Array;
}

export interface BinaryWasmKernelCreateResult {
  kernel: BinaryWasmKernel | null;
  error?: string;
}

let wasmModulePromise: Promise<WebAssembly.Module> | null = null;

function buildImports(): BinaryKernelImports {
  return {
    env: {
      abort(_message?: number, _fileName?: number, line?: number, column?: number): never {
        throw new Error(
          `[TruSkii3000] Standard/ECM WASM kernel aborted${line !== undefined ? ` at ${line}:${column ?? 0}` : ''}.`
        );
      },
    },
  };
}

function compileModule(): Promise<WebAssembly.Module> {
  if (!wasmModulePromise) {
    wasmModulePromise = (async () => {
      if (typeof WebAssembly === 'undefined') {
        throw new Error('WebAssembly is unavailable');
      }
      if (typeof WebAssembly.compileStreaming === 'function') {
        try {
          return await WebAssembly.compileStreaming(fetch(wasmUrl));
        } catch {
          // Fall back to array-buffer compilation below.
        }
      }
      const response = await fetch(wasmUrl);
      const bytes = await response.arrayBuffer();
      return await WebAssembly.compile(bytes);
    })();
  }
  return wasmModulePromise;
}

export class BinaryWasmKernel implements StandardCandidateScoringKernel {
  private readonly exports: BinaryKernelExports;
  private loadedContext: BinaryKernelContext | null = null;
  private loadedPairDiff: Float64Array | null = null;
  private weightedPixelErrorsView: Float32Array;
  private pairDiffView: Float32Array;
  private thresholdBitsView: Uint32Array;
  private positionOffsetsView: Int32Array;
  private flatPositionsView: Uint8Array;
  private packedBinaryGlyphLoView: Uint32Array;
  private packedBinaryGlyphHiView: Uint32Array;
  private outputSetErrsView: Float32Array;
  private outputHammingView: Uint8Array;

  private constructor(exports: BinaryKernelExports) {
    this.exports = exports;
    this.weightedPixelErrorsView = new Float32Array(
      exports.memory.buffer,
      exports.getWeightedPixelErrorsPtr(),
      64 * 16
    );
    this.pairDiffView = new Float32Array(
      exports.memory.buffer,
      exports.getPairDiffPtr(),
      16 * 16
    );
    this.thresholdBitsView = new Uint32Array(
      exports.memory.buffer,
      exports.getThresholdBitsPtr(),
      2
    );
    this.positionOffsetsView = new Int32Array(
      exports.memory.buffer,
      exports.getPositionOffsetsPtr(),
      257
    );
    this.flatPositionsView = new Uint8Array(
      exports.memory.buffer,
      exports.getFlatPositionsPtr(),
      256 * 64
    );
    this.packedBinaryGlyphLoView = new Uint32Array(
      exports.memory.buffer,
      exports.getPackedBinaryGlyphLoPtr(),
      256
    );
    this.packedBinaryGlyphHiView = new Uint32Array(
      exports.memory.buffer,
      exports.getPackedBinaryGlyphHiPtr(),
      256
    );
    this.outputSetErrsView = new Float32Array(
      exports.memory.buffer,
      exports.getOutputSetErrsPtr(),
      256 * 16
    );
    this.outputHammingView = new Uint8Array(
      exports.memory.buffer,
      exports.getOutputHammingPtr(),
      256
    );
  }

  static async create(): Promise<BinaryWasmKernelCreateResult> {
    try {
      const module = await compileModule();
      const instance = await WebAssembly.instantiate(module, buildImports());
      return { kernel: new BinaryWasmKernel(instance.exports as unknown as BinaryKernelExports) };
    } catch (error) {
      return {
        kernel: null,
        error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
      };
    }
  }

  computeSetErrs(weightedPixelErrors: Float32Array, context: BinaryKernelContext): Float32Array {
    this.ensureContext(context);
    this.weightedPixelErrorsView.set(weightedPixelErrors);
    this.exports.computeSetErrs();
    return this.outputSetErrsView;
  }

  computeHammingDistances(
    thresholdLo: number,
    thresholdHi: number,
    pairDiff: Float64Array,
    context: BinaryKernelContext
  ): Uint8Array {
    this.ensureContext(context);
    this.ensurePairDiff(pairDiff);
    this.thresholdBitsView[0] = thresholdLo >>> 0;
    this.thresholdBitsView[1] = thresholdHi >>> 0;
    this.exports.computeHammingDistances();
    return this.outputHammingView;
  }

  private ensureContext(context: BinaryKernelContext) {
    if (this.loadedContext === context) {
      return;
    }

    this.positionOffsetsView.set(context.positionOffsets);
    this.flatPositionsView.set(context.flatPositions);
    this.packedBinaryGlyphLoView.set(context.packedBinaryGlyphLo);
    this.packedBinaryGlyphHiView.set(context.packedBinaryGlyphHi);
    this.loadedContext = context;
  }

  private ensurePairDiff(pairDiff: Float64Array) {
    if (this.loadedPairDiff === pairDiff) {
      return;
    }

    this.pairDiffView.set(pairDiff);
    this.loadedPairDiff = pairDiff;
  }
}
