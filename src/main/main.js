import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  addFixedEvent,
  addPersonalProject,
  archivePersonalProject,
  archiveReminder,
  adjustFixedEventEnd,
  cancelFixedEvent,
  clearAllData,
  createReminder,
  editReminder,
  ensureAppStore,
  getDefaultStorePath,
  listReminders,
  saveAppStore,
  snoozeReminder,
  startReminder,
  updateFixedEventEnd,
  updateSettings,
} from '../lib/app-store.js';
import {
  addBreakToStore,
  addTemporaryEventToStore,
  buildRuntimeView,
  clearUserLocksInStore,
  completeAlarm,
  endCurrentBlockEarly,
  extendCurrentBlock,
  lockBlockInStore,
  replaceBlockProjectInStore,
  resolvePreferenceInStore,
  shouldTriggerAlarm,
  startReminderFlow,
  unlockBlockInStore,
} from '../lib/app-runtime.js';
import {
  checkDueReminders,
  computeCloseSnoozeMinutes,
  computeSnoozeDueAt,
  formatLocalDueAt,
} from '../lib/reminder-runtime.js';
import {
  createAlarmState,
  renderAlarmHtml,
  shouldRenderAlarmFrame,
  tickAlarm,
} from '../lib/alarm-presenter.js';
import {
  clearImportedCourseTable,
  importCourseWeeklySchedule,
} from '../lib/course-table-import.js';
import { createAlarmWindowOptions } from './alarm-window.js';
import { createTrayShellState, getTrayMenuTemplate, updateTrayShellState } from '../lib/tray-shell.js';
import { renderMainHtml, renderReminderPopupHtml, renderTrayWidgetHtml } from './renderers.js';

const require = createRequire(import.meta.url);
const electron = require('electron');
const { app, BrowserWindow, Menu, Tray, ipcMain, nativeImage, screen } = electron;
const __dirname = dirname(fileURLToPath(import.meta.url));
const iconPath = resolve(__dirname, '..', '..', 'icon_64.png');
const samplePath = resolve(__dirname, '..', '..', 'docs', 'sample-data', 'free-time-sample-2026-05-22.json');

if (process.env.TABULA_RASA_USER_DATA_DIR) {
  app.setPath('userData', process.env.TABULA_RASA_USER_DATA_DIR);
}

let store = null;
let storePath = null;
let mainWindow = null;
let trayWindow = null;
let alarmWindow = null;
let reminderWindow = null;
let currentReminder = null;
let tray = null;
let shellState = createTrayShellState();
let alarmState = null;
let alarmTimer = null;
let schedulerTimer = null;
let lastMessage = '';
let currentPage = 'day-plan';

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
  const options = { message: lastMessage, storePath, page: currentPage };
  if (currentPage === 'reminders') {
    options.reminders = listReminders(store, { includeArchived: false });
  }
  mainWindow.loadURL(htmlUrl(renderMainHtml(currentView(), options)));
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
  tray = new Tray(nativeImage.createFromPath(iconPath));
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

function requestAlarmDismiss(action = 'dismiss') {
  if (!alarmState) return;
  const previousState = alarmState;
  alarmState = tickAlarm(alarmState, { event: 'click', action });
  if (alarmState.status === 'dismissed') {
    closeAlarm(alarmState.dismissedBy ?? action);
    return;
  }
  if (alarmWindow && !alarmWindow.isDestroyed() && shouldRenderAlarmFrame(previousState, alarmState)) {
    alarmWindow.loadURL(htmlUrl(renderAlarmHtml(alarmState)));
  }
}

function createReminderWindow() {
  reminderWindow = new BrowserWindow({
    width: 420,
    height: 320,
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

  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  reminderWindow.on('ready-to-show', () => {
    const bounds = reminderWindow.getBounds();
    reminderWindow.setPosition(
      display.x + display.width - bounds.width - 12,
      display.y + display.height - bounds.height - 12,
    );
  });

  reminderWindow.on('closed', () => {
    reminderWindow = null;
    currentReminder = null;
  });
}

function showReminderPopup(reminder) {
  currentReminder = reminder;
  const view = currentView();
  const html = renderReminderPopupHtml(reminder, view);
  if (!reminderWindow || reminderWindow.isDestroyed()) createReminderWindow();
  reminderWindow.loadURL(htmlUrl(html));
  reminderWindow.show();
}

function resolveCurrentPopup() {
  if (!store) return;
  const view = currentView();
  const due = checkDueReminders(store, view.now);
  if (due.length > 0) {
    showReminderPopup(due[0]);
  } else {
    currentReminder = null;
    if (reminderWindow && !reminderWindow.isDestroyed()) {
      reminderWindow.hide();
    }
  }
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
    transitionEffectId: view.settings.transitionEffectId,
    transitionTriangleSizePx: view.settings.transitionTriangleSizePx,
    transitionTiltDeg: view.settings.transitionTiltDeg,
  });

  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  alarmWindow = new BrowserWindow(createAlarmWindowOptions(display));
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
    const previousState = alarmState;
    alarmState = tickAlarm(alarmState);
    if (alarmState.status === 'dismissed') {
      closeAlarm(alarmState.dismissedBy ?? 'auto');
      return;
    }
    if (alarmWindow && !alarmWindow.isDestroyed() && shouldRenderAlarmFrame(previousState, alarmState)) {
      alarmWindow.loadURL(htmlUrl(renderAlarmHtml(alarmState)));
    }
  }, 1000);
}

function startScheduler() {
  if (schedulerTimer) clearInterval(schedulerTimer);
  schedulerTimer = setInterval(() => {
    if (!store || store.runtime?.paused) return;
    if (alarmWindow) return;
    const view = currentView();
    // Check soft-fill alarms
    const alarmDue = shouldTriggerAlarm(store, view, { now: view.now });
    if (alarmDue.shouldTrigger) { showAlarm(alarmDue.alarm); return; }
    // Check due reminders (only if no reminder popup is showing)
    if (!currentReminder) {
      const dueReminders = checkDueReminders(store, view.now);
      if (dueReminders.length > 0) showReminderPopup(dueReminders[0]);
    }
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

  ipcMain.on('add-personal-project', async (_event, input) => {
    await persist(addPersonalProject(store, input));
    safeSendReload();
  });

  ipcMain.on('archive-personal-project', async (_event, input) => {
    await persist(archivePersonalProject(store, input.itemId));
    safeSendReload();
  });

  ipcMain.on('add-fixed-event', async (_event, input) => {
    await persist(addFixedEvent(store, input));
    safeSendReload();
  });

  ipcMain.on('import-course-table', async (_event, input = {}) => {
    try {
      const result = importCourseWeeklySchedule(store, input.json ?? '');
      await persist(result.store);
      safeSendReload();
      renderMain(`已导入 ${result.importedCount} 个课程条目。`);
    } catch (error) {
      renderMain(`导入失败: ${error.message}`);
    }
  });

  ipcMain.on('clear-course-table', async () => {
    const result = clearImportedCourseTable(store);
    await persist(result.store);
    safeSendReload();
    renderMain(`已清空 ${result.removedCount} 个课程表块。`);
  });

  ipcMain.on('switch-page', async (_event, input) => {
    currentPage = input.page ?? 'day-plan';
    renderMain();
  });

  ipcMain.on('change-block-project', async (_event, input) => {
    try {
      const result = replaceBlockProjectInStore(store, { ...input, now: currentView().now });
      await applyRuntimeResult(result, `Block changed to ${input.newLabel ?? input.label}.`);
    } catch (error) {
      renderMain(`切换失败: ${error.message}`);
    }
  });

  ipcMain.on('lock-block', async (_event, input) => {
    try {
      const result = lockBlockInStore(store, { ...input, now: currentView().now });
      await applyRuntimeResult(result, 'Block locked.');
    } catch (error) {
      renderMain(`Could not lock block: ${error.message}`);
      renderTrayWidget(`Could not lock block: ${error.message}`);
    }
  });

  ipcMain.on('unlock-block', async (_event, input) => {
    try {
      const result = unlockBlockInStore(store, { ...input, now: currentView().now });
      await applyRuntimeResult(result, result.changed ? 'Block unlocked.' : 'Block was not locked.');
    } catch (error) {
      renderMain(`Could not unlock block: ${error.message}`);
      renderTrayWidget(`Could not unlock block: ${error.message}`);
    }
  });

  ipcMain.on('clear-user-locks', async (_event, input = {}) => {
    try {
      const result = clearUserLocksInStore(store, { ...input, now: currentView().now });
      await applyRuntimeResult(
        result,
        result.changed ? `已清除 ${result.removedCount} 个 Locked 状态。` : '没有可清除的 Locked 状态。',
      );
    } catch (error) {
      renderMain(`Could not clear Locked status: ${error.message}`);
      renderTrayWidget(`Could not clear Locked status: ${error.message}`);
    }
  });

  ipcMain.on('clear-all-data', async () => {
    await persist(clearAllData(store));
    safeSendReload();
    renderMain('所有数据已清空。');
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

  ipcMain.on('end-fixed-event', async (_event, input = {}) => {
    try {
      await persist(updateFixedEventEnd(store, { eventId: input.eventId, endTime: currentView().now }));
      safeSendReload();
      renderMain('Fixed block ended.');
      renderTrayWidget('Fixed block ended.');
    } catch (error) {
      renderMain(`Could not end fixed block: ${error.message}`);
      renderTrayWidget(`Could not end fixed block: ${error.message}`);
    }
  });

  ipcMain.on('adjust-fixed-event-end', async (_event, input = {}) => {
    try {
      await persist(adjustFixedEventEnd(store, {
        eventId: input.eventId,
        deltaMinutes: Number(input.deltaMinutes),
        now: currentView().now,
      }));
      safeSendReload();
      renderMain(input.deltaMinutes < 0 ? 'Fixed block shortened.' : 'Fixed block extended.');
      renderTrayWidget(input.deltaMinutes < 0 ? 'Fixed block shortened.' : 'Fixed block extended.');
    } catch (error) {
      renderMain(`Could not adjust fixed block: ${error.message}`);
      renderTrayWidget(`Could not adjust fixed block: ${error.message}`);
    }
  });

  ipcMain.on('cancel-fixed-event', async (_event, input = {}) => {
    try {
      await persist(cancelFixedEvent(store, input.eventId));
      safeSendReload();
      renderMain('Fixed block cancelled.');
      renderTrayWidget('Fixed block cancelled.');
    } catch (error) {
      renderMain(`Could not cancel fixed block: ${error.message}`);
      renderTrayWidget(`Could not cancel fixed block: ${error.message}`);
    }
  });

  ipcMain.on('add-break', async (_event, input) => {
    const result = addBreakToStore(store, { ...input, now: currentView().now });
    await applyRuntimeResult(result, result.changed ? 'Break added.' : 'No room for break.');
  });

  ipcMain.on('toggle-pause', async () => {
    await setPaused(!store.runtime.paused);
  });

  ipcMain.on('dismiss-alarm', (_event, input = {}) => {
    requestAlarmDismiss(input.action ?? 'dismiss');
  });

  // Reminder IPC handlers
  ipcMain.on('reminder:snooze', async (_event, input) => {
    const reminderId = String(input.id ?? '').trim();
    if (!reminderId) return;

    let newDueAt;
    if (input.customDueAt) {
      newDueAt = formatLocalDueAt(new Date(input.customDueAt));
    } else if (input.presetMinutes) {
      const view = currentView();
      newDueAt = formatLocalDueAt(computeSnoozeDueAt(view.now, input.presetMinutes));
    } else {
      return;
    }

    const nextStore = snoozeReminder(store, { id: reminderId, newDueAt });
    await persist(nextStore);
    currentReminder = null;
    resolveCurrentPopup();
  });

  ipcMain.on('reminder:start', async (_event, input) => {
    const reminderId = String(input.id ?? '').trim();
    const durationMinutes = Number(input.durationMinutes);
    if (!reminderId || !Number.isFinite(durationMinutes) || durationMinutes <= 0) return;

    const view = currentView();
    const reminder = (listReminders(store) ?? []).find(r => r.id === reminderId);
    if (!reminder) return;

    try {
      const result = startReminderFlow(store, {
        now: view.now,
        date: view.date,
        reminderId,
        durationMinutes,
        label: reminder.title,
      });
      if (result.changed) {
        await persist(result.store);
        currentReminder = null;
        resolveCurrentPopup();
        safeSendReload();
      }
    } catch (error) {
      console.error('reminder:start failed', error);
    }
  });

  ipcMain.on('reminder:delete', async (_event, input) => {
    const reminderId = String(input.id ?? '').trim();
    if (!reminderId) return;

    const nextStore = archiveReminder(store, { id: reminderId });
    await persist(nextStore);
    currentReminder = null;
    resolveCurrentPopup();
  });

  ipcMain.on('reminder:close', async (_event, input) => {
    const reminderId = String(input.id ?? '').trim();
    if (!reminderId) return;

    const reminder = (listReminders(store, { includeArchived: false }) ?? []).find(r => r.id === reminderId);
    if (!reminder) return;

    const closeMinutes = computeCloseSnoozeMinutes(reminder);
    const view = currentView();
    const newDueAt = formatLocalDueAt(computeSnoozeDueAt(view.now, closeMinutes));
    const nextStore = snoozeReminder(store, {
      id: reminderId,
      newDueAt,
      // Increment closeCount: read current, add 1
      _incrementClose: true,
    });

    // Manually increment closeCount since snoozeReminder doesn't do it
    const withClose = {
      ...nextStore,
      reminders: nextStore.reminders.map(r =>
        r.id === reminderId ? { ...r, closeCount: (reminder.closeCount ?? 0) + 1 } : r,
      ),
    };

    await persist(withClose);
    currentReminder = null;
    resolveCurrentPopup();
  });

  ipcMain.on('reminder:create', async (_event, input) => {
    const title = String(input.title ?? '').trim();
    const dueAt = String(input.dueAt ?? '').trim();
    if (!title || !dueAt) return;
    const nextStore = createReminder(store, { title, dueAt: `${dueAt}:00+08:00` });
    await persist(nextStore);
    safeSendReload();
  });

  ipcMain.on('reminder:edit', async (_event, input) => {
    const id = String(input.id ?? '').trim();
    if (!id) return;
    const changes = {};
    if (input.title !== undefined) changes.title = String(input.title).trim();
    if (input.dueAt !== undefined) changes.dueAt = `${String(input.dueAt).trim()}:00+08:00`;
    const nextStore = editReminder(store, { id, ...changes });
    await persist(nextStore);
    safeSendReload();
  });
}

async function bootstrap() {
  const userDataPath = app.getPath('userData');
  storePath = getDefaultStorePath(userDataPath);
  store = await ensureAppStore({ userDataPath, samplePath });
  await saveAppStore(storePath, store);
  shellState = createTrayShellState({ paused: store.runtime.paused });
  createMainWindow();
  createTrayWidgetWindow();
  createTray();
  registerIpc();
  startScheduler();
  showMainWindow('Ready.');
  // Startup catch-up for missed reminders
  const dueOnStart = checkDueReminders(store, currentView().now);
  if (dueOnStart.length > 0) showReminderPopup(dueOnStart[0]);
}

app.whenReady().then(bootstrap);

app.on('before-quit', () => {
  shellState = updateTrayShellState(shellState, 'quit');
  if (schedulerTimer) clearInterval(schedulerTimer);
});

app.on('window-all-closed', event => {
  event?.preventDefault?.();
});
