import { app, BrowserWindow, Menu, Tray, ipcMain, nativeImage } from 'electron';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createAlarmState,
  getNextAlarm,
  renderAlarmHtml,
  tickAlarm,
} from '../lib/alarm-presenter.js';
import {
  buildDayPlan,
  rebuildPlanAfterPreferenceChoice,
  rebuildPlanAfterTemporaryEvent,
} from '../lib/day-planner.js';
import { choosePreferencePair } from '../lib/preference-sampler.js';
import {
  createTrayShellState,
  getTrayMenuTemplate,
  shouldFireAlarm,
  updateTrayShellState,
} from '../lib/tray-shell.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const samplePath = resolve(__dirname, '..', '..', 'docs', 'sample-data', 'free-time-sample-2026-05-22.json');
const trayIconDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAKklEQVR42mNgGAWjYBSMglEwCkbBKBhFowAMDAz8T4oBqQYDqBqADwAAAP//AwA6GQIiH4qvTAAAAABJRU5ErkJggg==';

function loadDayData() {
  const raw = JSON.parse(readFileSync(samplePath, 'utf-8'));
  const date = raw.metadata.date;
  const fixedEvents = raw.fixedEvents[date];
  const settings = { ...raw.settings, date };
  const now = new Date(`${date}T11:45:00+08:00`);
  const plan = buildDayPlan(fixedEvents, raw.reminderItems, now, settings);
  return {
    ...plan,
    now,
    reminderItems: raw.reminderItems,
    comparisonHistory: raw.comparisonHistory ?? [],
    preferencePair: choosePreferencePair(raw.reminderItems, raw.comparisonHistory ?? [], now),
    settings,
    message: '从模拟数据加载',
  };
}

function createWindow() {
  let data = loadDayData();
  let alarmWindow = null;
  let alarmState = null;
  let alarmTimer = null;
  let shellState = createTrayShellState();
  let tray = null;
  const win = new BrowserWindow({
    width: 820,
    height: 920,
    resizable: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  function reload(nextData) {
    data = nextData;
    win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(renderHTML(data))}`);
  }

  function showMainWindow(message) {
    shellState = updateTrayShellState(shellState, 'show-window');
    if (message) data = { ...data, message };
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
    reload(data);
    refreshTrayMenu();
  }

  function refreshTrayMenu() {
    if (!tray) return;
    const template = getTrayMenuTemplate(shellState).map(item => {
      if (item.type === 'separator') return item;
      if (item.id === 'open-main') return { ...item, click: () => showMainWindow('主窗口已打开') };
      if (item.id === 'preference') return { ...item, click: () => showMainWindow('偏好采样在上方，可点左/右/差不多/跳过') };
      if (item.id === 'temporary-event') return { ...item, click: () => showMainWindow('临时事件入口在右上方，可点开会预设') };
      if (item.id === 'pause') return { ...item, click: () => setPaused(true) };
      if (item.id === 'resume') return { ...item, click: () => setPaused(false) };
      if (item.id === 'quit') {
        return {
          ...item,
          click: () => {
            shellState = updateTrayShellState(shellState, 'quit');
            app.quit();
          },
        };
      }
      return item;
    });
    tray.setContextMenu(Menu.buildFromTemplate(template));
    tray.setToolTip(shellState.paused ? 'Tabula Rasa - reminders paused' : 'Tabula Rasa');
  }

  function setPaused(paused) {
    shellState = updateTrayShellState(shellState, paused ? 'pause' : 'resume');
    data = { ...data, message: paused ? '提醒已暂停' : '提醒已恢复' };
    reload(data);
    refreshTrayMenu();
  }

  function createTray() {
    tray = new Tray(nativeImage.createFromDataURL(trayIconDataUrl));
    tray.on('click', () => showMainWindow());
    refreshTrayMenu();
  }

  win.webContents.on('did-finish-load', () => {
    win.webContents.executeJavaScript(`
      window.addTemporaryMeeting = (startTime, durationMinutes) => {
        require('electron').ipcRenderer.send('add-temporary-meeting', { startTime, durationMinutes });
      };
      window.resolvePreference = (choice) => {
        require('electron').ipcRenderer.send('resolve-preference', { choice });
      };
      window.showNextAlarm = () => {
        require('electron').ipcRenderer.send('show-next-alarm');
      };
    `);
  });

  ipcMain.on('add-temporary-meeting', (_event, input) => {
    const nextPlan = rebuildPlanAfterTemporaryEvent(
      data.fixedEvents,
      data.softFillBlocks,
      data.reminderItems,
      data.now,
      data.settings,
      {
        date: data.date,
        label: '开会',
        startTime: input.startTime,
        durationMinutes: input.durationMinutes,
        addedAt: new Date().toISOString(),
      },
    );
    reload({
      ...data,
      ...nextPlan,
      preferencePair: choosePreferencePair(nextPlan.reminderItems ?? data.reminderItems, nextPlan.comparisonHistory ?? data.comparisonHistory, data.now),
      message: `已加入临时事件：开会 ${input.startTime} / ${input.durationMinutes}分钟`,
    });
  });

  ipcMain.on('resolve-preference', (_event, input) => {
    if (!data.preferencePair) return;
    const nextPlan = rebuildPlanAfterPreferenceChoice(
      data.fixedEvents,
      data.softFillBlocks,
      data.reminderItems,
      data.comparisonHistory,
      data.now,
      data.settings,
      {
        leftItemId: data.preferencePair.left.id,
        rightItemId: data.preferencePair.right.id,
        choice: input.choice,
        at: data.now,
      },
    );
    const nextPair = choosePreferencePair(nextPlan.reminderItems, nextPlan.comparisonHistory, data.now);
    reload({
      ...data,
      ...nextPlan,
      preferencePair: nextPair,
      message: `偏好已记录：${preferenceChoiceLabel(input.choice)}`,
    });
  });

  ipcMain.on('show-next-alarm', () => {
    if (!shouldFireAlarm(shellState)) {
      reload({ ...data, message: '提醒已暂停，恢复后才会触发' });
      return;
    }
    const alarm = getNextAlarm(data.softFillBlocks, data.now);
    if (!alarm) {
      reload({ ...data, message: '没有可触发的下一次提醒' });
      return;
    }
    showAlarm(alarm);
  });

  ipcMain.on('dismiss-alarm', () => {
    if (!alarmState) return;
    alarmState = tickAlarm(alarmState, { event: 'click' });
    if (alarmState.status === 'dismissed') closeAlarm();
  });

  function showAlarm(alarm) {
    closeAlarm();
    alarmState = createAlarmState({
      alarm,
      seconds: data.settings.alarmSeconds ?? 30,
      now: data.now,
      clickToDismiss: data.settings.clickToDismiss !== false,
    });

    alarmWindow = new BrowserWindow({
      fullscreen: true,
      frame: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
      },
    });
    alarmWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(renderAlarmHtml(alarmState))}`);
    alarmWindow.webContents.on('did-finish-load', () => {
      alarmWindow.webContents.executeJavaScript(`
        window.dismissAlarm = () => {
          require('electron').ipcRenderer.send('dismiss-alarm');
        };
      `);
    });

    alarmTimer = setInterval(() => {
      const elapsedNow = new Date(alarmState.startedAt.getTime() + (alarmState.totalSeconds - alarmState.remainingSeconds + 1) * 1000);
      alarmState = tickAlarm(alarmState, { now: elapsedNow });
      if (alarmState.status === 'dismissed') {
        closeAlarm();
        return;
      }
      if (alarmWindow && !alarmWindow.isDestroyed()) {
        alarmWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(renderAlarmHtml(alarmState))}`);
      }
    }, 1000);
  }

  function closeAlarm() {
    if (alarmTimer) {
      clearInterval(alarmTimer);
      alarmTimer = null;
    }
    if (alarmWindow && !alarmWindow.isDestroyed()) alarmWindow.close();
    alarmWindow = null;
    alarmState = null;
  }

  win.on('close', event => {
    if (shellState.shouldQuit) return;
    event.preventDefault();
    shellState = updateTrayShellState(shellState, 'window-close');
    win.hide();
    refreshTrayMenu();
  });

  createTray();
  reload(data);
}

function preferenceChoiceLabel(choice) {
  if (choice === 'left') return '左侧更重要';
  if (choice === 'right') return '右侧更重要';
  if (choice === 'tie') return '差不多';
  return '跳过';
}

function fmt(d) {
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

function timeToRow(d) {
  const h = d.getHours();
  const m = d.getMinutes();
  return Math.max(1, Math.round((h - 8) * 2 + m / 30) + 1);
}

function renderHTML(data) {
  const hardHtml = data.merged.map(ev => `
    <div class="event hard" style="grid-row: ${timeToRow(ev.start)} / ${timeToRow(ev.end)}">
      <span class="time">${fmt(ev.start)}-${fmt(ev.end)}</span>
      <span class="label">${ev.labels.join(', ')}</span>
      <span class="source">${ev.sources.join(', ')}</span>
    </div>
  `).join('\n');

  const softHtml = data.softFillBlocks.map(block => `
    <div class="event soft${block.break ? ' rest' : ''}" style="grid-row: ${timeToRow(block.start)} / ${timeToRow(block.end)}">
      <span class="time">${fmt(block.start)}-${fmt(block.end)}</span>
      <span class="label">${block.label}</span>
      <span class="source">${block.break ? '休息' : `score ${block.score}`}</span>
    </div>
  `).join('\n');

  const freeHtml = data.freeIntervals.map(f => `
    <div class="event free" style="grid-row: ${timeToRow(f.start)} / ${timeToRow(f.end)}">
      <span class="time">${fmt(f.start)}-${fmt(f.end)}</span>
      <span class="label">空闲</span>
    </div>
  `).join('\n');

  const pairHtml = data.preferencePair ? `
    <section class="sampler">
      <div class="sampler-title">第一印象：哪个更重要？</div>
      <div class="sampler-row">
        <button class="choice" onclick="window.resolvePreference('left')">
          <span>${data.preferencePair.left.label}</span>
          <small>score ${data.preferencePair.left.importanceScore}</small>
        </button>
        <button class="choice" onclick="window.resolvePreference('right')">
          <span>${data.preferencePair.right.label}</span>
          <small>score ${data.preferencePair.right.importanceScore}</small>
        </button>
        <button onclick="window.resolvePreference('tie')">差不多</button>
        <button onclick="window.resolvePreference('skip')">跳过</button>
      </div>
    </section>
  ` : '<section class="sampler"><div class="sampler-title">至少需要两个活跃事项</div></section>';

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>Tabula Rasa - ${data.date}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #101113; color: #eceff4; padding: 16px; }
    h1 { font-size: 18px; margin-bottom: 8px; color: #f3f4f6; letter-spacing: 0; }
    .topbar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
    .meta { color: #a4adba; font-size: 12px; }
    .actions { display: flex; flex-wrap: wrap; gap: 8px; }
    button { border: 1px solid #3c4654; background: #1d232b; color: #eef2f6; border-radius: 6px; padding: 7px 10px; font-size: 12px; cursor: pointer; }
    button:hover { background: #27313d; border-color: #6c7a89; }
    .sampler { border: 1px solid #303946; border-radius: 6px; padding: 10px; margin: 0 0 12px; background: #161b21; }
    .sampler-title { font-size: 13px; font-weight: 700; margin-bottom: 8px; color: #f3f4f6; }
    .sampler-row { display: grid; grid-template-columns: minmax(120px, 1fr) minmax(120px, 1fr) auto auto; gap: 8px; align-items: stretch; }
    .choice { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; min-width: 0; }
    .choice span { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .choice small { color: #9ca6b2; font-size: 10px; }
    .message { margin-bottom: 12px; color: #9bd67d; font-size: 12px; min-height: 18px; }
    .legend { display: flex; gap: 16px; margin: 8px 0 14px; font-size: 12px; color: #b5bdc9; }
    .legend-item { display: flex; align-items: center; gap: 6px; }
    .legend-dot { width: 10px; height: 10px; border-radius: 2px; display: inline-block; }
    .legend-dot.hard { background: #6d7dfc; }
    .legend-dot.soft { background: #6fcf97; }
    .legend-dot.free { background: #2a4637; }
    .timeline { display: grid; grid-template-rows: repeat(30, 24px); gap: 1px; position: relative; border-left: 1px solid #27313d; padding-left: 8px; }
    .event { border-radius: 6px; padding: 4px 8px; overflow: hidden; display: flex; flex-direction: column; justify-content: center; margin: 1px 0; min-height: 22px; }
    .event.hard { background: #252b48; border-left: 3px solid #6d7dfc; }
    .event.soft { background: #1f352a; border-left: 3px solid #6fcf97; }
    .event.soft.rest { background: #35312a; border-left-color: #e3bb57; }
    .event.free { background: rgba(42, 70, 55, .32); border-left: 3px solid #2a4637; opacity: .55; }
    .event .time { font-size: 11px; color: #a4adba; }
    .event .label { font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .event .source { font-size: 10px; color: #838d9a; }
  </style>
</head>
<body>
  <div class="topbar">
    <div>
      <h1>${data.date} 日视图</h1>
      <div class="meta">mock 当前时间 ${fmt(data.now)}，临时事件插入后只重排未来软块</div>
    </div>
    <div class="actions">
      <button onclick="window.addTemporaryMeeting('08:00', 60)">开会 08:00 / 60m</button>
      <button onclick="window.addTemporaryMeeting('13:00', 60)">开会 13:00 / 60m</button>
      <button onclick="window.addTemporaryMeeting('19:00', 90)">开会 19:00 / 90m</button>
      <button onclick="window.showNextAlarm()">测试下一次提醒</button>
    </div>
  </div>
  <div class="message">${data.message ?? ''}</div>
  ${pairHtml}
  <div class="legend">
    <span class="legend-item"><span class="legend-dot hard"></span>固定 / 临时事件</span>
    <span class="legend-item"><span class="legend-dot soft"></span>软填充</span>
    <span class="legend-item"><span class="legend-dot free"></span>空闲</span>
  </div>
  <div class="timeline">
    ${freeHtml}
    ${softHtml}
    ${hardHtml}
  </div>
</body>
</html>`;
}

app.whenReady().then(createWindow);
app.on('window-all-closed', event => {
  event?.preventDefault?.();
});
