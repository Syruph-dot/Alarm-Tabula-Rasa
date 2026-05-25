export const BASE_BLACK_SWEEP = 'base.black-sweep';
export const BLUE_ARCHIVE_SWEEP_1 = 'blue-archive.sweep-1';

export const DEFAULT_TRANSITION_SETTINGS = {
  transitionEffectId: BASE_BLACK_SWEEP,
  transitionTriangleSizePx: 400,
  transitionTiltDeg: -12,
};

export const TRANSITION_EFFECTS = [
  {
    id: BASE_BLACK_SWEEP,
    group: '基础',
    label: '黑屏扫屏',
  },
  {
    id: BLUE_ARCHIVE_SWEEP_1,
    group: '蔚蓝档案',
    label: '扫屏1',
  },
];

const EFFECT_IDS = new Set(TRANSITION_EFFECTS.map(effect => effect.id));

function clampNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

export function getTransitionEffect(id) {
  return TRANSITION_EFFECTS.find(effect => effect.id === id) ?? TRANSITION_EFFECTS[0];
}

export function normalizeTransitionSettings(settings = {}) {
  const effectId = EFFECT_IDS.has(settings.transitionEffectId)
    ? settings.transitionEffectId
    : DEFAULT_TRANSITION_SETTINGS.transitionEffectId;
  return {
    transitionEffectId: effectId,
    transitionTriangleSizePx: clampNumber(
      settings.transitionTriangleSizePx,
      DEFAULT_TRANSITION_SETTINGS.transitionTriangleSizePx,
      24,
      400,
    ),
    transitionTiltDeg: clampNumber(
      settings.transitionTiltDeg,
      DEFAULT_TRANSITION_SETTINGS.transitionTiltDeg,
      -45,
      45,
    ),
  };
}

export function buildEquilateralTriangleGridModel(options = {}) {
  const triangleSizePx = clampNumber(options.triangleSizePx, DEFAULT_TRANSITION_SETTINGS.transitionTriangleSizePx, 24, 400);
  const tiltDeg = clampNumber(options.tiltDeg, DEFAULT_TRANSITION_SETTINGS.transitionTiltDeg, -45, 45);
  const viewportWidth = clampNumber(options.viewportWidth, 1920, 1, 10000);
  const viewportHeight = clampNumber(options.viewportHeight, 1080, 1, 10000);
  const overscanPx = clampNumber(options.overscanPx, triangleSizePx * 3, 0, 2000);
  const triangleHeightPx = triangleSizePx * Math.sqrt(3) / 2;
  const colStepPx = triangleSizePx / 2;
  const rotatedViewportBounds = rotatedBoundsForViewport({
    width: viewportWidth,
    height: viewportHeight,
    tiltDeg,
  });
  const paddingX = overscanPx + triangleSizePx;
  const paddingY = overscanPx + triangleHeightPx;
  const originX = Math.floor((rotatedViewportBounds.minX - paddingX) / colStepPx) * colStepPx;
  const originY = Math.floor((rotatedViewportBounds.minY - paddingY) / triangleHeightPx) * triangleHeightPx;
  const targetMaxX = rotatedViewportBounds.maxX + paddingX;
  const targetMaxY = rotatedViewportBounds.maxY + paddingY;
  const cols = Math.ceil((targetMaxX - originX) / colStepPx) + 2;
  const rows = Math.ceil((targetMaxY - originY) / triangleHeightPx) + 2;
  const cells = [];

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const pointsUp = (row + col) % 2 === 0;
      const x = originX + col * colStepPx;
      const y = originY + row * triangleHeightPx;
      const points = pointsUp
        ? '50% 0, 100% 100%, 0 100%'
        : '0 0, 100% 0, 50% 100%';
      cells.push({
        row,
        col,
        x,
        y,
        cx: x + triangleSizePx / 2,
        cy: y + (pointsUp ? triangleHeightPx * 2 / 3 : triangleHeightPx / 3),
        points,
      });
    }
  }
  const bounds = {
    minX: originX,
    minY: originY,
    maxX: originX + (cols - 1) * colStepPx + triangleSizePx,
    maxY: originY + rows * triangleHeightPx,
  };

  return {
    triangleSizePx,
    triangleHeightPx,
    colStepPx,
    tiltDeg,
    viewportWidth,
    viewportHeight,
    overscanPx,
    cols,
    rows,
    rotatedViewportBounds,
    bounds,
    cells,
  };
}

export function calculateSweepScale({ distancePx = 0, softnessPx = 1 } = {}) {
  const distance = Number(distancePx);
  const softness = Number(softnessPx);
  if (!Number.isFinite(distance)) return 0;
  if (!Number.isFinite(softness) || softness <= 0) return distance <= 0 ? 1 : 0;
  const normalized = distance / softness;
  if (normalized <= -20) return 1;
  if (normalized >= 20) return 0;
  return 1 / (1 + Math.exp(normalized));
}

function rotatedBoundsForViewport({ width, height, tiltDeg }) {
  const centerX = width / 2;
  const centerY = height / 2;
  const corners = [
    rotatePoint(0, 0, -tiltDeg, centerX, centerY),
    rotatePoint(width, 0, -tiltDeg, centerX, centerY),
    rotatePoint(width, height, -tiltDeg, centerX, centerY),
    rotatePoint(0, height, -tiltDeg, centerX, centerY),
  ];
  return {
    minX: Math.min(...corners.map(point => point.x)),
    maxX: Math.max(...corners.map(point => point.x)),
    minY: Math.min(...corners.map(point => point.y)),
    maxY: Math.max(...corners.map(point => point.y)),
  };
}

function rotatePoint(x, y, deg, centerX, centerY) {
  const rad = deg * Math.PI / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = x - centerX;
  const dy = y - centerY;
  return {
    x: centerX + dx * cos - dy * sin,
    y: centerY + dx * sin + dy * cos,
  };
}

export function transitionEffectsByGroup() {
  const groups = [];
  for (const effect of TRANSITION_EFFECTS) {
    let group = groups.find(candidate => candidate.label === effect.group);
    if (!group) {
      group = { label: effect.group, effects: [] };
      groups.push(group);
    }
    group.effects.push(effect);
  }
  return groups;
}
