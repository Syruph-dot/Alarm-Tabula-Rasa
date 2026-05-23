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
});
