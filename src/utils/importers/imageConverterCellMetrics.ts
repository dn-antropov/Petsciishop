const CANVAS_WIDTH = 320;
const GRID_WIDTH = 40;
const GRID_HEIGHT = 25;
const CELL_WIDTH = 8;
const CELL_HEIGHT = 8;
const CELL_COUNT = GRID_WIDTH * GRID_HEIGHT;

export const CELL_GRADIENT_ISOTROPIC = 0;
export const CELL_GRADIENT_HORIZONTAL = 1;
export const CELL_GRADIENT_VERTICAL = 2;
export const CELL_GRADIENT_DIAGONAL_RIGHT = 3;
export const CELL_GRADIENT_DIAGONAL_LEFT = 4;

export type CellGradientDirection =
  | typeof CELL_GRADIENT_ISOTROPIC
  | typeof CELL_GRADIENT_HORIZONTAL
  | typeof CELL_GRADIENT_VERTICAL
  | typeof CELL_GRADIENT_DIAGONAL_RIGHT
  | typeof CELL_GRADIENT_DIAGONAL_LEFT;

export interface CellStructureMetrics {
  detailScores: Float32Array;
  gradientDirections: Uint8Array;
}

function quantizeGradientDirection(angle: number): CellGradientDirection {
  const normalized = angle < 0 ? angle + Math.PI : angle;

  if (normalized < Math.PI / 8 || normalized >= (7 * Math.PI) / 8) {
    return CELL_GRADIENT_HORIZONTAL;
  }
  if (normalized < (3 * Math.PI) / 8) {
    return CELL_GRADIENT_DIAGONAL_RIGHT;
  }
  if (normalized < (5 * Math.PI) / 8) {
    return CELL_GRADIENT_VERTICAL;
  }
  return CELL_GRADIENT_DIAGONAL_LEFT;
}

export function computeCellStructureMetrics(srcL: Float32Array): CellStructureMetrics {
  const rawDetailScores = new Float32Array(CELL_COUNT);
  const detailScores = new Float32Array(CELL_COUNT);
  const gradientDirections = new Uint8Array(CELL_COUNT);
  let maxDetailScore = 0;

  for (let cy = 0; cy < GRID_HEIGHT; cy++) {
    for (let cx = 0; cx < GRID_WIDTH; cx++) {
      const cellIndex = cy * GRID_WIDTH + cx;
      let detailAccumulator = 0;
      let totalGradientMagnitude = 0;
      let horizontalWeight = 0;
      let verticalWeight = 0;
      let diagonalRightWeight = 0;
      let diagonalLeftWeight = 0;

      for (let py = 1; py < CELL_HEIGHT - 1; py++) {
        for (let px = 1; px < CELL_WIDTH - 1; px++) {
          const x = cx * CELL_WIDTH + px;
          const y = cy * CELL_HEIGHT + py;
          const center = y * CANVAS_WIDTH + x;

          const northWest = srcL[center - CANVAS_WIDTH - 1];
          const north = srcL[center - CANVAS_WIDTH];
          const northEast = srcL[center - CANVAS_WIDTH + 1];
          const west = srcL[center - 1];
          const current = srcL[center];
          const east = srcL[center + 1];
          const southWest = srcL[center + CANVAS_WIDTH - 1];
          const south = srcL[center + CANVAS_WIDTH];
          const southEast = srcL[center + CANVAS_WIDTH + 1];

          const laplacian = (8 * current) - (
            northWest + north + northEast +
            west + east +
            southWest + south + southEast
          );
          detailAccumulator += Math.abs(laplacian);

          const gx =
            (-northWest + northEast) +
            (-2 * west + 2 * east) +
            (-southWest + southEast);
          const gy =
            (-northWest - 2 * north - northEast) +
            (southWest + 2 * south + southEast);
          const magnitude = Math.hypot(gx, gy);
          if (magnitude <= 1e-6) {
            continue;
          }

          totalGradientMagnitude += magnitude;
          switch (quantizeGradientDirection(Math.atan2(gy, gx))) {
            case CELL_GRADIENT_HORIZONTAL:
              horizontalWeight += magnitude;
              break;
            case CELL_GRADIENT_VERTICAL:
              verticalWeight += magnitude;
              break;
            case CELL_GRADIENT_DIAGONAL_RIGHT:
              diagonalRightWeight += magnitude;
              break;
            case CELL_GRADIENT_DIAGONAL_LEFT:
              diagonalLeftWeight += magnitude;
              break;
            default:
              break;
          }
        }
      }

      const rawDetail = detailAccumulator / 36;
      rawDetailScores[cellIndex] = rawDetail;
      if (rawDetail > maxDetailScore) {
        maxDetailScore = rawDetail;
      }

      const dominantWeight = Math.max(
        horizontalWeight,
        verticalWeight,
        diagonalRightWeight,
        diagonalLeftWeight
      );

      if (totalGradientMagnitude <= 1e-6 || dominantWeight / totalGradientMagnitude < 0.4) {
        gradientDirections[cellIndex] = CELL_GRADIENT_ISOTROPIC;
      } else if (dominantWeight === horizontalWeight) {
        gradientDirections[cellIndex] = CELL_GRADIENT_HORIZONTAL;
      } else if (dominantWeight === verticalWeight) {
        gradientDirections[cellIndex] = CELL_GRADIENT_VERTICAL;
      } else if (dominantWeight === diagonalRightWeight) {
        gradientDirections[cellIndex] = CELL_GRADIENT_DIAGONAL_RIGHT;
      } else {
        gradientDirections[cellIndex] = CELL_GRADIENT_DIAGONAL_LEFT;
      }
    }
  }

  if (maxDetailScore > 0) {
    for (let i = 0; i < CELL_COUNT; i++) {
      detailScores[i] = rawDetailScores[i] / maxDetailScore;
    }
  }

  return { detailScores, gradientDirections };
}
