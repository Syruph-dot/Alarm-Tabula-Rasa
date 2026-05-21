# 007 - Tray Shell And Pause Controls

**Type**: AFK

**Blocked by**: 004 - Add Temporary Event And Rebuild Future Table; 005 - Pairwise Preference Sampler; 006 - Lightweight Alarm Presenter

**User stories covered**: 3, 8, 13, 14

## What to build

Complete the tray-first shell around the MVP. The tray menu should expose the main window, preference sampler, temporary event insertion, pause/resume, and quit. Closing the main window should keep the app running in the tray.

## Acceptance criteria

- [ ] App creates a system tray icon.
- [ ] Tray menu can open the main window.
- [ ] Tray menu can open the pairwise preference sampler.
- [ ] Tray menu can open the temporary event insertion path.
- [ ] Pause prevents alarms from firing until resumed.
- [ ] Resume restores alarm scheduling.
- [ ] Closing the main window minimizes to tray rather than quitting.
- [ ] Manual verification notes cover Windows tray behavior.

## Blocked by

- 004 - Add Temporary Event And Rebuild Future Table
- 005 - Pairwise Preference Sampler
- 006 - Lightweight Alarm Presenter
