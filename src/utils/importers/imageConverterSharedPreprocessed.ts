import type { PreprocessedFittedImage } from './imageConverter';
import type { StandardPreprocessedImage } from './imageConverterStandardCore';

type SharedSupportedArray =
  | Float32Array
  | Uint8Array;

function cloneIntoSharedBuffer<T extends SharedSupportedArray>(source: T): T {
  if (typeof SharedArrayBuffer === 'undefined') {
    return source;
  }
  const sharedBuffer = new SharedArrayBuffer(source.byteLength);
  const shared = new (source.constructor as {
    new(buffer: ArrayBufferLike, byteOffset?: number, length?: number): T;
  })(sharedBuffer, 0, source.length);
  shared.set(source);
  return shared;
}

export function shareStandardPreprocessedImage(
  preprocessed: StandardPreprocessedImage
): StandardPreprocessedImage {
  return {
    ...preprocessed,
    srcL: cloneIntoSharedBuffer(preprocessed.srcL),
    srcA: cloneIntoSharedBuffer(preprocessed.srcA),
    srcB: cloneIntoSharedBuffer(preprocessed.srcB),
    nearestPalette: cloneIntoSharedBuffer(preprocessed.nearestPalette),
  };
}

export function shareModePreprocessedImage(
  preprocessed: PreprocessedFittedImage
): PreprocessedFittedImage {
  return {
    ...preprocessed,
    srcL: cloneIntoSharedBuffer(preprocessed.srcL),
    srcA: cloneIntoSharedBuffer(preprocessed.srcA),
    srcB: cloneIntoSharedBuffer(preprocessed.srcB),
    nearestPalette: cloneIntoSharedBuffer(preprocessed.nearestPalette),
  };
}
