import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createTrayShellState,
  getTrayMenuTemplate,
  shouldFireAlarm,
  updateTrayShellState,
} from '../src/lib/tray-shell.js';

describe('tray shell', () => {
  it('builds menu entries for MVP actions', () => {
    const state = createTrayShellState();
    const labels = getTrayMenuTemplate(state).map(item => item.label).filter(Boolean);

    assert.ok(labels.includes('打开主窗口'));
    assert.ok(labels.includes('偏好采样'));
    assert.ok(labels.includes('加入临时事件'));
    assert.ok(labels.includes('暂停提醒'));
    assert.ok(labels.includes('退出'));
  });

  it('pause prevents alarms and resume restores alarms', () => {
    const paused = updateTrayShellState(createTrayShellState(), 'pause');
    const resumed = updateTrayShellState(paused, 'resume');

    assert.equal(paused.paused, true);
    assert.equal(shouldFireAlarm(paused), false);
    assert.equal(resumed.paused, false);
    assert.equal(shouldFireAlarm(resumed), true);
    assert.ok(getTrayMenuTemplate(paused).some(item => item.label === '恢复提醒'));
  });

  it('close hides to tray instead of quitting unless quitting', () => {
    const hidden = updateTrayShellState(createTrayShellState(), 'window-close');
    const quitting = updateTrayShellState(createTrayShellState(), 'quit');
    const closedWhileQuitting = updateTrayShellState(quitting, 'window-close');

    assert.equal(hidden.windowVisible, false);
    assert.equal(hidden.shouldQuit, false);
    assert.equal(closedWhileQuitting.shouldQuit, true);
  });
});
