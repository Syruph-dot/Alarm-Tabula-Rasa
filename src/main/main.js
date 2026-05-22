import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  archiveReminderItem,
  addFixedEvent,
  addReminderItem,
  ensureAppStore,
  getDefaultStorePath,
  saveAppStore,
  updateSettings,
} from '../lib/app-store.js';
import {
  addBreakToStore,
  addTemporaryEventToStore,
  buildRuntimeView,
  completeAlarm,
  endCurrentBlockEarly,
  extendCurrentBlock,
  resolvePreferenceInStore,
  shouldTriggerAlarm,
} from '../lib/app-runtime.js';
import {
  createAlarmState,
  renderAlarmHtml,
  tickAlarm,
} from '../lib/alarm-presenter.js';
import { createTrayShellState, getTrayMenuTemplate, updateTrayShellState } from '../lib/tray-shell.js';
import { renderMainHtml, renderTrayWidgetHtml } from './renderers.js';

const require = createRequire(import.meta.url);
const electron = require('electron');
const { app, BrowserWindow, Menu, Tray, ipcMain, nativeImage, screen } = electron;
const __dirname = dirname(fileURLToPath(import.meta.url));
const samplePath = resolve(__dirname, '..', '..', 'docs', 'sample-data', 'free-time-sample-2026-05-22.json');
const trayIconDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAKklEQVR42mNgGAWjYBSMglEwCkbBKBhFowAMDAz8T4oBqQYDqBqADwAAAP//AwA6GQIiH4qvTAAAAABJRU5ErkJggg==';

if (process.env.TABULA_RASA_USER_DATA_DIR) {
  app.setPath('userData', process.env.TABULA_RASA_USER_DATA_DIR);
}

let store = null;
let storePath = null;
let mainWindow = null;
let trayWindow = null;
let alarmWindow = null;
let tray = null;
let shellState = createTrayShellState();
let alarmState = null;
let alarmTimer = null;
let schedulerTimer = null;
let lastMessage = '';

function htmlUrl(html) {
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

function currentView() {
  return buildRuntimeView(store);
}

async function persist(nextStore = store) {
  store = nextStore;
  await saveAppStore(storePath, store);
}

function safeSendReload() {
  renderMain();
  renderTrayWidget();
  refreshTrayMenu();
}

function renderMain(message = lastMessage) {
  lastMessage = message ?? '';
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.loadURL(htmlUrl(renderMainHtml(currentView(), { message: lastMessage, storePath })));
}

function renderTrayWidget(message = lastMessage) {
  lastMessage = message ?? '';
  if (!trayWindow || trayWindow.isDestroyed()) return;
  trayWindow.loadURL(htmlUrl(renderTrayWidgetHtml(currentView(), { message: lastMessage })));
}

function showMainWindow(message) {
  if (!mainWindow || mainWindow.isDestroyed()) createMainWindow();
  shellState = updateTrayShellState(shellState, 'show-window');
  mainWindow.show();
  mainWindow.focus();
  renderMain(message);
  refreshTrayMenu();
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 980,
    height: 920,
    minWidth: 820,
    minHeight: 640,
    resizable: true,
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  mainWindow.on('close', event => {
    if (shellState.shouldQuit) return;
    event.preventDefault();
    shellState = updateTrayShellState(shellState, 'window-close');
    mainWindow.hide();
    refreshTrayMenu();
  });

  renderMain();
}

function createTrayWidgetWindow() {
  trayWindow = new BrowserWindow({
    width: 420,
    height: 720,
    frame: false,
    resizable: false,
    show: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });
  trayWindow.on('blur', () => {
    if (trayWindow && !trayWindow.isDestroyed()) trayWindow.hide();
  });
  trayWindow.on('closed', () => {
    trayWindow = null;
  });
  renderTrayWidget();
}

function positionTrayWidget() {
  if (!trayWindow) return;
  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor).workArea;
  const bounds = trayWindow.getBounds();
  const x = Math.min(Math.max(cursor.x - Math.round(bounds.width / 2), display.x), display.x + display.width - bounds.width);
  const y = Math.min(Math.max(cursor.y - bounds.height - 8, display.y), display.y + display.height - bounds.height);
  trayWindow.setPosition(x, y, false);
}

function toggleTrayWidget(message) {
  if (!trayWindow || trayWindow.isDestroyed()) createTrayWidgetWindow();
  if (trayWindow.isVisible()) {
    trayWindow.hide();
    return;
  }
  renderTrayWidget(message);
  positionTrayWidget();
  trayWindow.show();
  trayWindow.focus();
}

function createTray() {
  tray = new Tray(nativeImage.createFromDataURL(trayIconDataUrl));
  tray.on('click', () => toggleTrayWidget());
  refreshTrayMenu();
}

function refreshTrayMenu() {
  if (!tray) return;
  const template = getTrayMenuTemplate(shellState).map(item => {
    if (item.type === 'separator') return item;
    if (item.id === 'open-main') return { ...item, click: () => showMainWindow() };
    if (item.id === 'preference') return { ...item, click: () => toggleTrayWidget('Pick by first impression.') };
    if (item.id === 'temporary-event') return { ...item, click: () => toggleTrayWidget('Add temporary event.') };
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
  tray.setToolTip(store?.runtime?.paused ? 'Tabula Rasa - paused' : 'Tabula Rasa');
}

async function setPaused(paused) {
  shellState = updateTrayShellState(shellState, paused ? 'pause' : 'resume');
  await persist(updateSettings(store, { paused }));
  safeSendReload();
}

function closeAlarm(action = 'dismiss') {
  if (alarmTimer) {
    clearInterval(alarmTimer);
    alarmTimer = null;
  }
  if (alarmWindow && !alarmWindow.isDestroyed()) alarmWindow.close();
  if (alarmState?.alarm) {
    const updated = completeAlarm(store, alarmState.alarm, { action });
    persist(updated).then(safeSendReload).catch(console.error);
  }
  alarmWindow = null;
  alarmState = null;
}

function showAlarm(alarm) {
  if (!alarm) return;
  if (alarmWindow && !alarmWindow.isDestroyed()) return;
  const view = currentView();
  alarmState = createAlarmState({
    alarm,
    seconds: view.settings.alarmSeconds ?? 30,
    now: view.now,
    clickToDismiss: view.settings.clickToDismiss !== false,
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
  alarmWindow.loadURL(htmlUrl(renderAlarmHtml(alarmState)));
  alarmWindow.webContents.on('did-finish-load', () => {
    alarmWindow.webContents.executeJavaScript(`
      window.dismissAlarm = () => require('electron').ipcRenderer.send('dismiss-alarm', { action: 'dismiss' });
    `);
  });
  alarmWindow.on('closed', () => {
    alarmWindow = null;
  });

  alarmTimer = setInterval(() => {
    if (!alarmState) return;
    alarmState = tickAlarm(alarmState);
    if (alarmState.status === 'dismissed') {
      closeAlarm(alarmState.dismissedBy ?? 'auto');
      return;
    }
    if (alarmWindow && !alarmWindow.isDestroyed()) {
      alarmWindow.loadURL(htmlUrl(renderAlarmHtml(alarmState)));
    }
  }, 1000);
}

function startScheduler() {
  if (schedulerTimer) clearInterval(schedulerTimer);
  schedulerTimer = setInterval(() => {
    if (!store || alarmWindow) return;
    const view = currentView();
    const due = shouldTriggerAlarm(store, view, { now: view.now });
    if (due.shouldTrigger) showAlarm(due.alarm);
  }, 5000);
}

async function applyRuntimeResult(result, message) {
  await persist(result.store);
  safeSendReload();
  if (message) {
    renderMain(message);
    renderTrayWidget(message);
  }
}

function registerIpc() {
  ipcMain.on('open-tray-widget', () => toggleTrayWidget());

  ipcMain.on('set-time-mode', async (_event, input) => {
    const mockNow = input.mockNow ? new Date(input.mockNow).toISOString() : store.runtime.mockNow;
    await persist(updateSettings(store, { timeMode: input.timeMode, mockNow }));
    safeSendReload();
  });

  ipcMain.on('update-settings', async (_event, input) => {
    await persist(updateSettings(store, input));
    safeSendReload();
  });

  ipcMain.on('add-reminder', async (_event, input) => {
    await persist(addReminderItem(store, input));
    safeSendReload();
  });

  ipcMain.on('archive-reminder', async (_event, input) => {
    await persist(archiveReminderItem(store, input.itemId));
    safeSendReload();
  });

  ipcMain.on('add-fixed-event', async (_event, input) => {
    await persist(addFixedEvent(store, input));
    safeSendReload();
  });

  ipcMain.on('add-temporary-event', async (_event, input) => {
    const result = addTemporaryEventToStore(store, { ...input, now: currentView().now });
    await applyRuntimeResult(result, 'Temporary event added.');
  });

  ipcMain.on('resolve-preference', async (_event, input) => {
    const result = resolvePreferenceInStore(store, { ...input, now: currentView().now });
    await applyRuntimeResult(result, 'Preference saved.');
  });

  ipcMain.on('extend-current', async (_event, input) => {
    const result = extendCurrentBlock(store, { ...input, now: currentView().now });
    await applyRuntimeResult(result, result.changed ? 'Current block extended.' : 'No block to extend.');
  });

  ipcMain.on('end-current', async (_event, input) => {
    const result = endCurrentBlockEarly(store, {
      ...input,
      now: currentView().now,
      cooldownMinutes: store.settings.defaultEarlyEndCooldownMinutes,
    });
    await applyRuntimeResult(result, result.changed ? 'Current block ended.' : 'No block to end.');
  });

  ipcMain.on('add-break', async (_event, input) => {
    const result = addBreakToStore(store, { ...input, now: currentView().now });
    await applyRuntimeResult(result, result.changed ? 'Break added.' : 'No room for break.');
  });

  ipcMain.on('toggle-pause', async () => {
    await setPaused(!store.runtime.paused);
  });

  ipcMain.on('dismiss-alarm', (_event, input = {}) => {
    closeAlarm(input.action ?? 'dismiss');
  });
}

async function bootstrap() {
  const userDataPath = app.getPath('userData');
  storePath = getDefaultStorePath(userDataPath);
  store = await ensureAppStore({ userDataPath, samplePath });
  shellState = createTrayShellState({ paused: store.runtime.paused });
  createMainWindow();
  createTrayWidgetWindow();
  createTray();
  registerIpc();
  startScheduler();
  showMainWindow('Ready.');
}

app.whenReady().then(bootstrap);

app.on('before-quit', () => {
  shellState = updateTrayShellState(shellState, 'quit');
  if (schedulerTimer) clearInterval(schedulerTimer);
});

app.on('window-all-closed', event => {
  event?.preventDefault?.();
});
