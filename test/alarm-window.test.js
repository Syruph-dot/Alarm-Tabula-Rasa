import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createAlarmWindowOptions } from '../src/main/alarm-window.js';

describe('alarm window options', () => {
  it('uses a transparent overlay window instead of an opaque fullscreen window', () => {
    const options = createAlarmWindowOptions({ x: 10, y: 20, width: 1920, height: 1080 });

    assert.equal(options.transparent, true);
    assert.equal(options.backgroundColor, '#00000000');
    assert.equal(options.frame, false);
    assert.equal(options.fullscreen, undefined);
    assert.equal(options.fullscreenable, false);
    assert.equal(options.resizable, false);
    assert.equal(options.x, 10);
    assert.equal(options.y, 20);
    assert.equal(options.width, 1920);
    assert.equal(options.height, 1080);
  });
});
