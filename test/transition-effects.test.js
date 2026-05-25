import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateSweepScale,
  buildEquilateralTriangleGridModel,
  DEFAULT_TRANSITION_SETTINGS,
  getTransitionEffect,
  normalizeTransitionSettings,
} from '../src/lib/transition-effects.js';

describe('transition effects', () => {
  it('builds an equilateral triangle grid from size and tilt parameters', () => {
    const grid = buildEquilateralTriangleGridModel({
      viewportWidth: 320,
      viewportHeight: 200,
      triangleSizePx: 40,
      tiltDeg: -18,
      overscanPx: 0,
    });

    assert.equal(grid.triangleSizePx, 40);
    assert.equal(grid.tiltDeg, -18);
    assert.equal(Number(grid.triangleHeightPx.toFixed(3)), 34.641);
    assert.ok(grid.cols >= 18);
    assert.ok(grid.rows >= 7);
    assert.equal(grid.cells[0].points, '50% 0, 100% 100%, 0 100%');
    assert.equal(grid.cells[1].points, '0 0, 100% 0, 50% 100%');
    assert.equal(grid.cells[0].x + 20, grid.cells[1].x);
    assert.equal(grid.cells[grid.cols].x - grid.cells[0].x, 0);
    assert.equal(Number((grid.cells[grid.cols].y - grid.cells[0].y).toFixed(3)), 34.641);
  });

  it('covers the rotated viewport bounds so corners are filled after tilt', () => {
    const grid = buildEquilateralTriangleGridModel({
      viewportWidth: 360,
      viewportHeight: 240,
      triangleSizePx: 64,
      tiltDeg: -28,
    });

    assert.ok(grid.bounds.minX <= grid.rotatedViewportBounds.minX - grid.triangleSizePx);
    assert.ok(grid.bounds.maxX >= grid.rotatedViewportBounds.maxX + grid.triangleSizePx);
    assert.ok(grid.bounds.minY <= grid.rotatedViewportBounds.minY - grid.triangleHeightPx);
    assert.ok(grid.bounds.maxY >= grid.rotatedViewportBounds.maxY + grid.triangleHeightPx);
  });

  it('uses a sweep-domain line with a soft sigmoid scale threshold', () => {
    assert.equal(calculateSweepScale({ distancePx: -200, softnessPx: 1 }), 1);
    assert.equal(calculateSweepScale({ distancePx: 200, softnessPx: 1 }), 0);

    const left = calculateSweepScale({ distancePx: -12, softnessPx: 24 });
    const center = calculateSweepScale({ distancePx: 0, softnessPx: 24 });
    const right = calculateSweepScale({ distancePx: 12, softnessPx: 24 });

    assert.ok(left > center);
    assert.ok(center > right);
    assert.ok(center > 0.49 && center < 0.51);
  });

  it('normalizes transition settings and exposes grouped effects', () => {
    assert.equal(DEFAULT_TRANSITION_SETTINGS.transitionTriangleSizePx, 600);
    assert.equal(getTransitionEffect('base.black-sweep').group, '基础');
    assert.equal(getTransitionEffect('blue-archive.sweep-1').group, '蔚蓝档案');

    const normalized = normalizeTransitionSettings({
      transitionEffectId: 'blue-archive.sweep-1',
      transitionTriangleSizePx: '72',
      transitionTiltDeg: '-14',
    });

    assert.equal(normalized.transitionEffectId, 'blue-archive.sweep-1');
    assert.equal(normalized.transitionTriangleSizePx, 72);
    assert.equal(normalized.transitionTiltDeg, -14);
    assert.equal(normalizeTransitionSettings({ transitionTriangleSizePx: 900 }).transitionTriangleSizePx, 600);
  });
});
