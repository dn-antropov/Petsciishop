import wasmUrl from './truskiiMcmKernel.wasm?url';

type BinaryKernelContext = {
  flatPositions: Uint8Array;
  positionOffsets: Int32Array;
};

type McmKernelContext = BinaryKernelContext & {
  flatMcmPositions?: Uint8Array[];
  mcmPositionOffsets?: Int32Array[];
};

type McmKernelExports = {
  memory: WebAssembly.Memory;
  getWeightedPixelErrorsPtr(): number;
  getWeightedPairErrorsPtr(): number;
  getPositionOffsetsPtr(): number;
  getFlatPositionsPtr(): number;
  getMcmPositionOffsets0Ptr(): number;
  getMcmPositionOffsets1Ptr(): number;
  getMcmPositionOffsets2Ptr(): number;
  getMcmPositionOffsets3Ptr(): number;
  getFlatMcmPositions0Ptr(): number;
  getFlatMcmPositions1Ptr(): number;
  getFlatMcmPositions2Ptr(): number;
  getFlatMcmPositions3Ptr(): number;
  getOutputSetErrsPtr(): number;
  getOutputBitPairErrsPtr(): number;
  computeMatrices(): void;
};

type McmKernelImports = WebAssembly.Imports & {
  env: {
    abort(message?: number, fileName?: number, line?: number, column?: number): never;
  };
};

export interface McmWasmKernelCreateResult {
  kernel: McmWasmKernel | null;
  error?: string;
};

let wasmModulePromise: Promise<WebAssembly.Module> | null = null;

function buildImports(): McmKernelImports {
  return {
    env: {
      abort(_message?: number, _fileName?: number, line?: number, column?: number): never {
        throw new Error(
          `[TruSkii3000] MCM WASM kernel aborted${line !== undefined ? ` at ${line}:${column ?? 0}` : ''}.`
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

export class McmWasmKernel {
  private readonly exports: McmKernelExports;
  private loadedContext: McmKernelContext | null = null;
  private weightedPixelErrorsView: Float32Array;
  private weightedPairErrorsView: Float32Array;
  private positionOffsetsView: Int32Array;
  private flatPositionsView: Uint8Array;
  private mcmPositionOffsetsViews: Int32Array[];
  private flatMcmPositionsViews: Uint8Array[];
  private outputSetErrsView: Float32Array;
  private outputBitPairErrsView: Float32Array;

  private constructor(exports: McmKernelExports) {
    this.exports = exports;
    this.weightedPixelErrorsView = new Float32Array(exports.memory.buffer, exports.getWeightedPixelErrorsPtr(), 64 * 16);
    this.weightedPairErrorsView = new Float32Array(exports.memory.buffer, exports.getWeightedPairErrorsPtr(), 32 * 16);
    this.positionOffsetsView = new Int32Array(exports.memory.buffer, exports.getPositionOffsetsPtr(), 257);
    this.flatPositionsView = new Uint8Array(exports.memory.buffer, exports.getFlatPositionsPtr(), 256 * 64);
    this.mcmPositionOffsetsViews = [
      new Int32Array(exports.memory.buffer, exports.getMcmPositionOffsets0Ptr(), 257),
      new Int32Array(exports.memory.buffer, exports.getMcmPositionOffsets1Ptr(), 257),
      new Int32Array(exports.memory.buffer, exports.getMcmPositionOffsets2Ptr(), 257),
      new Int32Array(exports.memory.buffer, exports.getMcmPositionOffsets3Ptr(), 257),
    ];
    this.flatMcmPositionsViews = [
      new Uint8Array(exports.memory.buffer, exports.getFlatMcmPositions0Ptr(), 256 * 32),
      new Uint8Array(exports.memory.buffer, exports.getFlatMcmPositions1Ptr(), 256 * 32),
      new Uint8Array(exports.memory.buffer, exports.getFlatMcmPositions2Ptr(), 256 * 32),
      new Uint8Array(exports.memory.buffer, exports.getFlatMcmPositions3Ptr(), 256 * 32),
    ];
    this.outputSetErrsView = new Float32Array(exports.memory.buffer, exports.getOutputSetErrsPtr(), 256 * 16);
    this.outputBitPairErrsView = new Float32Array(exports.memory.buffer, exports.getOutputBitPairErrsPtr(), 256 * 4 * 16);
  }

  static async create(): Promise<McmWasmKernelCreateResult> {
    try {
      const module = await compileModule();
      const instance = await WebAssembly.instantiate(module, buildImports());
      return { kernel: new McmWasmKernel(instance.exports as unknown as McmKernelExports) };
    } catch (error) {
      return {
        kernel: null,
        error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
      };
    }
  }

  computeMatrices(weightedPixelErrors: Float32Array, weightedPairErrors: Float32Array, context: McmKernelContext) {
    this.ensureContext(context);
    this.weightedPixelErrorsView.set(weightedPixelErrors);
    this.weightedPairErrorsView.set(weightedPairErrors);
    this.exports.computeMatrices();
    return {
      setErrs: this.outputSetErrsView,
      bitPairErrs: this.outputBitPairErrsView,
    };
  }

  private ensureContext(context: McmKernelContext) {
    if (this.loadedContext === context) {
      return;
    }
    if (!context.flatMcmPositions || !context.mcmPositionOffsets) {
      throw new Error('Missing MCM position data for WASM kernel.');
    }

    this.positionOffsetsView.set(context.positionOffsets);
    this.flatPositionsView.fill(0);
    this.flatPositionsView.set(context.flatPositions);
    for (let bitPair = 0; bitPair < 4; bitPair++) {
      this.mcmPositionOffsetsViews[bitPair].set(context.mcmPositionOffsets[bitPair]);
      this.flatMcmPositionsViews[bitPair].fill(0);
      this.flatMcmPositionsViews[bitPair].set(context.flatMcmPositions[bitPair]);
    }
    this.loadedContext = context;
  }
}
