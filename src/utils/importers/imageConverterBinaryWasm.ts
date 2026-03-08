import wasmUrl from './truskiiBinaryKernel.wasm?url';

type BinaryKernelContext = {
  flatPositions: Uint8Array;
  positionOffsets: Int32Array;
};

type BinaryKernelExports = {
  memory: WebAssembly.Memory;
  getWeightedPixelErrorsPtr(): number;
  getPositionOffsetsPtr(): number;
  getFlatPositionsPtr(): number;
  getOutputSetErrsPtr(): number;
  computeSetErrs(): void;
};

type BinaryKernelImports = WebAssembly.Imports & {
  env: {
    abort(message?: number, fileName?: number, line?: number, column?: number): never;
  };
};

export interface StandardCandidateScoringKernel {
  computeSetErrs(weightedPixelErrors: Float32Array, context: BinaryKernelContext): Float32Array;
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
  private weightedPixelErrorsView: Float32Array;
  private positionOffsetsView: Int32Array;
  private flatPositionsView: Uint8Array;
  private outputSetErrsView: Float32Array;

  private constructor(exports: BinaryKernelExports) {
    this.exports = exports;
    this.weightedPixelErrorsView = new Float32Array(
      exports.memory.buffer,
      exports.getWeightedPixelErrorsPtr(),
      64 * 16
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
    this.outputSetErrsView = new Float32Array(
      exports.memory.buffer,
      exports.getOutputSetErrsPtr(),
      256 * 16
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

  private ensureContext(context: BinaryKernelContext) {
    if (this.loadedContext === context) {
      return;
    }

    this.positionOffsetsView.set(context.positionOffsets);
    this.flatPositionsView.fill(0);
    this.flatPositionsView.set(context.flatPositions);
    this.loadedContext = context;
  }
}
