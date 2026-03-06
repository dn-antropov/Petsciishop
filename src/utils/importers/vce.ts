import { inflateSync } from 'fflate';
import { framebufFromJson } from '../../redux/workspace';
import { Pixel, Framebuf } from '../../redux/types';

const VCE_MAGIC = 'VCE\0';
const HEADER_SIZE = 12;
const INNER_HEADER_SIZE = 25;
const SCREEN_CELLS = 40 * 25; // 1000

export function loadVCE(content: Uint8Array): Framebuf[] {
  // Verify magic bytes
  const magic = String.fromCharCode(content[0], content[1], content[2], content[3]);
  if (magic !== VCE_MAGIC) {
    throw new Error('Not a valid VCE file');
  }

  // Decompress zlib payload starting after file header
  // The payload starts with 0x78 0xDA (zlib header), but fflate's inflateSync
  // expects raw deflate. Skip the 2-byte zlib header.
  const compressed = content.slice(HEADER_SIZE + 2);
  let data: Uint8Array;
  try {
    data = inflateSync(compressed);
  } catch (e) {
    // Fallback: try including the zlib header bytes
    data = inflateSync(content.slice(HEADER_SIZE));
  }

  const minRequired = INNER_HEADER_SIZE + SCREEN_CELLS + SCREEN_CELLS;
  if (data.length < minRequired) {
    throw new Error(`VCE payload too small: ${data.length} bytes (need ${minRequired})`);
  }

  const backgroundColor = data[0] & 0x0F;
  const borderColor = data[1] & 0x0F;

  // Build pixel grid from screencodes (offset 25) and colors (offset 1025)
  const framebuf: Pixel[][] = [];
  for (let row = 0; row < 25; row++) {
    const rowPixels: Pixel[] = [];
    for (let col = 0; col < 40; col++) {
      const idx = row * 40 + col;
      rowPixels.push({
        code: data[INNER_HEADER_SIZE + idx],
        color: data[INNER_HEADER_SIZE + SCREEN_CELLS + idx] & 0x0F,
      });
    }
    framebuf.push(rowPixels);
  }

  const result = framebufFromJson({
    width: 40,
    height: 25,
    backgroundColor,
    borderColor,
    charset: 'upper',
    framebuf,
  });
  return [result];
}
