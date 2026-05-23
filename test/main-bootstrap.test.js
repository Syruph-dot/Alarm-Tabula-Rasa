import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('electron bootstrap', () => {
  it('does not clear persisted user data on startup', async () => {
    const source = await readFile('./src/main/main.js', 'utf-8');
    const bootstrapBody = source.slice(
      source.indexOf('async function bootstrap()'),
      source.indexOf('app.whenReady().then(bootstrap)'),
    );

    assert.doesNotMatch(bootstrapBody, /store\s*=\s*clearAllData\(store\)/);
    assert.doesNotMatch(bootstrapBody, /已清空所有数据/);
  });

  it('passes configured transition settings into alarm state', async () => {
    const source = await readFile('./src/main/main.js', 'utf-8');
    const showAlarmBody = source.slice(
      source.indexOf('function showAlarm(alarm)'),
      source.indexOf('function startScheduler()'),
    );

    assert.match(showAlarmBody, /transitionEffectId:\s*view\.settings\.transitionEffectId/);
    assert.match(showAlarmBody, /transitionTriangleSizePx:\s*view\.settings\.transitionTriangleSizePx/);
    assert.match(showAlarmBody, /transitionTiltDeg:\s*view\.settings\.transitionTiltDeg/);
  });

  it('wires the main clear Locked button to the runtime store action', async () => {
    const source = await readFile('./src/main/main.js', 'utf-8');

    assert.match(source, /clearUserLocksInStore/);
    assert.match(source, /ipcMain\.on\('clear-user-locks'/);
  });
});
