# 007 - Tray Shell And Pause Controls

**Type**: AFK

**Status**: Implemented in MVP slice

**Blocked by**: 004 - Add Temporary Event And Rebuild Future Table; 005 - Pairwise Preference Sampler; 006 - Lightweight Alarm Presenter

**User stories covered**: 3, 8, 13, 14

## What to build

Complete the tray-first shell around the MVP. The tray menu should expose the main window, preference sampler, temporary event insertion, pause/resume, and quit. Closing the main window should keep the app running in the tray.

## Acceptance criteria

- [x] App creates a system tray icon.
- [x] Tray menu can open the main window.
- [x] Tray menu can open the pairwise preference sampler.
- [x] Tray menu can open the temporary event insertion path.
- [x] Pause prevents alarms from firing until resumed.
- [x] Resume restores alarm scheduling.
- [x] Closing the main window minimizes to tray rather than quitting.
- [x] Manual verification notes cover Windows tray behavior.

## Implementation notes

- Core shell state/menu logic lives in `src/lib/tray-shell.js`.
- Electron main process creates `Tray`, builds menu from shell state, and keeps app alive when main window closes.
- Tray menu entries:
  - `打开主窗口`
  - `偏好采样`
  - `加入临时事件`
  - `暂停提醒` / `恢复提醒`
  - `退出`
- Pause blocks `show-next-alarm`; resume restores alarm trigger.

## Manual verification notes

Run `pnpm start` on Windows:

1. Confirm tray icon appears.
2. Click tray icon or `打开主窗口`: main window appears.
3. Choose `偏好采样`: main window appears with pairwise sampler visible.
4. Choose `加入临时事件`: main window appears with temporary-event presets visible.
5. Choose `暂停提醒`, then click `测试下一次提醒`: no fullscreen alarm; page shows paused message.
6. Choose `恢复提醒`, then click `测试下一次提醒`: fullscreen alarm appears.
7. Close main window: app remains in tray.
8. Choose `退出`: app exits.

## Blocked by

- 004 - Add Temporary Event And Rebuild Future Table
- 005 - Pairwise Preference Sampler
- 006 - Lightweight Alarm Presenter
