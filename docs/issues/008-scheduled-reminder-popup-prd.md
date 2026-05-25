# 008 - PRD: Scheduled Reminder Popup And Start Flow

**Type**: PRD / AFK-ready feature slice

**Status**: Ready for agent as a local tracker draft

**Intended triage label**: `ready-for-agent`

**GitHub publication status**: Published as [#17](https://github.com/Syruph-dot/Alarm-Tabula-Rasa/issues/17) on 2026-05-23. Implementation broken into issues [#9](https://github.com/Syruph-dot/Alarm-Tabula-Rasa/issues/9)–[#16](https://github.com/Syruph-dot/Alarm-Tabula-Rasa/issues/16).

## Problem Statement

The current `Add Reminder` interaction does not match the user's expected meaning of a reminder. It currently behaves like adding a reusable personal project into the soft-fill pool, while the desired meaning is a time-based reminder: the user records an item and a reminder date/time, then receives a small actionable popup when that time arrives.

This semantic mismatch also makes short-lived reminder items too sticky. A scheduled reminder should not become a permanent personal project just because the user needed to be reminded once. If the user chooses to start the reminded item, it should take over the current block for a selected duration, then behave like a runtime action rather than polluting the long-term project list.

The due reminder also needs a calm but visible UI. The reminder should appear from the lower-right corner as a small window, show the current day context as a compact Gantt chart, highlight courses in red, and offer two immediate actions: `Snooze` and `开始`.

## Solution

Change `Add Reminder` into a scheduled reminder creation flow. The user enters a reminder title and a reminder date/time. The app persists this as a scheduled reminder, watches for due reminders using the same current-time model as the rest of the app, and displays a bottom-right popup when a reminder becomes due.

The popup slides upward from the bottom-right edge of the screen. It shows the reminder title, due time, a compact Gantt chart for the current day, and two primary actions:

- `Snooze`: opens a list of preset delay durations and a custom date/time option. Choosing an option hides the popup and updates the reminder's next due time.
- `开始`: opens a list of duration choices. Choosing a duration stops the current block at now, starts this reminder item as the active block for the chosen duration capped by the next course start, updates the future schedule, and closes the popup.

The existing reusable personal-project pool remains available, but it should no longer be presented as `Add Reminder`. That entry should be renamed to project-oriented language such as `Add Project` / `个人项目`, while `Add Reminder` becomes exclusively date/time based.

## User Stories

1. As a user, I want `Add Reminder` to ask for an item and a date/time, so that a reminder means "tell me at this time" rather than "add a standing project."
2. As a user, I want to enter a short reminder title, so that the popup clearly tells me what I planned to do.
3. As a user, I want to choose the exact reminder date and time, so that I can create reminders for later today or another day.
4. As a user, I want the app to persist scheduled reminders, so that reminders survive app restarts.
5. As a user, I want the app to respect the current mock/real time mode, so that reminder behavior can be tested and controlled consistently with the schedule engine.
6. As a user, I want a due reminder to appear at the lower-right of the screen, so that it is visible without taking over the whole screen.
7. As a user, I want the popup to slide up from the bottom, so that the reminder has a clear arrival motion.
8. As a user, I want the popup to remain compact, so that it does not cover the main app or the current work unnecessarily.
9. As a user, I want the popup to show the reminder title prominently, so that I can immediately understand what it is asking me to consider.
10. As a user, I want the popup to show the reminder due time, so that I can distinguish an on-time reminder from a snoozed one.
11. As a user, I want the popup to show the current Gantt chart, so that I can decide whether to snooze or start with schedule context.
12. As a user, I want courses in the popup Gantt chart to be red, so that class time is highly visible before I decide whether to override it.
13. As a user, I want the current block to be visually identifiable in the popup Gantt chart, so that I know what would be interrupted by `开始`.
14. As a user, I want `Snooze` to open a list instead of immediately choosing one delay, so that I can make a low-friction but deliberate choice.
15. As a user, I want common snooze presets, so that I can delay by a few minutes without manual entry.
16. As a user, I want a custom snooze date/time option, so that I can reschedule the reminder precisely when presets are wrong.
17. As a user, I want snoozing to hide the current popup, so that the reminder does not continue to demand attention after I choose a new time.
18. As a user, I want snoozing to record the new due time, so that the reminder comes back at the selected moment.
19. As a user, I want `开始` to open a duration list, so that starting the reminder always has an explicit time boundary.
20. As a user, I want common start-duration presets, so that I can quickly choose 15, 30, 45, 60, or 90 minutes.
21. As a user, I want a custom start-duration option, so that I can choose an exact duration when presets do not fit.
22. As a user, I want starting a reminder to stop the current block, so that the schedule reflects the real interruption.
23. As a user, I want starting a reminder to create a current block for the selected duration, capped by the next course start, so that the day plan immediately reflects what I am doing now without covering the next class.
24. As a user, I want future blocks to be recalculated after starting a reminder, so that the rest of the day remains coherent.
25. As a user, I want a started reminder to stop notifying me, so that it does not reappear after I have acted on it.
26. As a user, I want one-off reminders not to become permanent personal projects, so that my reusable project list stays clean.
27. As a user, I want existing personal projects to remain available, so that dynamic soft-fill planning still works.
28. As a user, I want the personal-project creation UI to use project language, so that it is not confused with scheduled reminders.
29. As a user, I want multiple due reminders to be handled predictably, so that simultaneous reminders do not stack into multiple confusing windows.
30. As a user, I want only one reminder popup visible at a time, so that I can make one decision at a time.
31. As a user, I want the next due reminder to appear after the current one is snoozed or started, so that nothing is silently lost.
32. As a user, I want past-due reminders created while the app was closed to appear when the app starts, so that missed reminders still surface.
33. As a user, I want the reminder popup to be interactive, so that I can choose actions without opening the main window first.
34. As a user, I want the popup to avoid stealing unnecessary focus, so that it is visible but not disruptive before I click it.
35. As a user, I want the reminder state to be inspectable in the main UI, so that I can see scheduled or snoozed reminders before they fire.
36. As a user, I want to edit or archive scheduled reminders before they fire, so that I can correct mistakes.

## Implementation Decisions

- Define a new domain concept: **Scheduled Reminder**. It is separate from reusable personal projects and separate from fixed/course events.
- A Scheduled Reminder has an id, title, due date/time, status, creation/update timestamps, and optional history for snooze/start actions.
- Use statuses that represent external behavior: scheduled, snoozed, showing, started, and archived/dismissed. `showing` is an active notification state, not a scheduling result.
- Existing reusable soft-fill items should stop being called reminders in the UI. Rename that visible flow to project-oriented language such as `Add Project` / `个人项目`.
- Keep the existing soft-fill project pool for dynamic planning. Do not remove personal projects or pairwise preference behavior as part of this PRD.
- Add a small Scheduled Reminder module with a stable interface for due selection, snooze calculation, start transition, and queue ordering. This should be a deep module with pure behavior that can be tested without Electron.
- Due detection should use the app's current runtime clock, including mock-time mode. This keeps reminder testing consistent with existing schedule rebuilding behavior.
- Due detection should surface reminders where due time is at or before now and status is scheduled or snoozed.
- If multiple reminders are due, display only one popup. Order by due time, then creation time. After the visible reminder is resolved, the next due reminder may be displayed.
- Showing a popup should not create duplicate scheduled reminders or duplicate popups for the same reminder.
- Snooze should update the same Scheduled Reminder record with a new due time and status, then hide the popup.
- Snooze presets should include short options suitable for desktop interruption handling: 5 minutes, 10 minutes, 15 minutes, 30 minutes, and 1 hour.
- Snooze must also support a custom date/time selection from the popup action list.
- `开始` should require a duration choice before mutating the schedule.
- Start presets should include 15, 30, 45, 60, and 90 minutes, plus a custom duration option.
- Starting a reminder should stop the current active block at now and insert a one-off runtime block for the selected duration.
- If starting a reminder happens during the current course, the current course block should be truncated at now rather than shown as an overlap under the one-off block.
- The effective end time of a reminder-started one-off block must be capped to before the next course block begins. The next course is a hard upper bound even when the user selects a longer duration.
- The started reminder block should be treated as a one-off runtime block unless the user explicitly chooses to make it a standing project in a later feature.
- Starting a reminder should not add a long-term active item to the personal-project pool by default.
- Starting a reminder should mark the Scheduled Reminder as started and prevent future popup notifications for that reminder.
- Future generated blocks should be recalculated after starting the reminder. The selected Reminder start may force-truncate the current course or fixed block, but it must not cover the next course block.
- Course blocks should be highlighted red in the popup Gantt chart as high-visibility schedule context, not as a hard protection that disables `开始`.
- The popup Gantt chart should be compact rather than a full planner surface. It should show the day's horizontal timeline, current time, fixed/course blocks, and the selected current block context.
- The popup should use desktop-notification dimensions: wide enough for a readable mini timeline and two action buttons, but not a full main window.
- The popup should animate from below the lower-right screen edge to its resting lower-right position.
- The popup window should be always-on-top and skip the taskbar. It must allow interaction with action menus.
- The popup should be rendered by the app, not by OS-native notifications, because the Gantt chart and duration menus are custom UI.
- The popup action menus should be inside the popup window, not separate OS context menus, so custom date/time and duration controls can be supported consistently.
- Add Reminder creation in the main UI should validate that title is non-empty and due date/time is valid.
- A past due date/time entered intentionally should either fire immediately or be rejected with a clear message. The implementation should choose one behavior and cover it in tests; firing immediately is preferred because it is simple and recoverable.
- The main UI should expose a list of scheduled reminders with statuses and next due time. This list can be compact, but it must make scheduled reminders inspectable.
- Existing fullscreen alarm transitions remain separate. This PRD is about due reminder popups, not block transition animation.
- The old semantic conflict should be resolved visibly: users should not see two different controls both named `Add Reminder`.

## Testing Decisions

- Tests should assert external behavior and state transitions, not Electron implementation details.
- Add pure tests for Scheduled Reminder due selection: not due, due now, overdue after app restart, snoozed due, and started reminders excluded.
- Add pure tests for reminder queue ordering when multiple reminders are due.
- Add pure tests for snooze presets and custom snooze date/time producing the next due time and preserving reminder identity.
- Add runtime tests for starting a reminder: the current block is stopped at now, a one-off block is inserted for the selected duration, future blocks are recalculated, and the reminder is marked started.
- Add runtime tests for course boundaries: starting during the current course truncates that course at now, and a selected duration longer than the gap to the next course is capped before the next course starts.
- Add runtime tests proving started reminders do not become active long-term personal projects by default.
- Add store persistence tests for creating, snoozing, starting, archiving, and reloading scheduled reminders.
- Add renderer tests for the main `Add Reminder` form: it must include title and date/time inputs, not the old duration-only project item form.
- Add renderer tests for renamed personal-project creation language, so the old project pool remains reachable without using reminder terminology.
- Add renderer tests for the popup HTML: reminder title, due time, Gantt chart container, red course styling, `Snooze`, and `开始` controls are present.
- Add main-process bootstrap tests for the scheduled-reminder IPC handlers and popup lifecycle at a string/contract level where possible.
- Reuse existing app-runtime and renderer test styles already present in the project. Keep Electron window behavior behind small contracts so most coverage remains fast and deterministic.
- Manual verification should include real-time and mock-time flows: create a reminder due in the near future, observe popup, snooze it, then start it and confirm the day plan changes.

## Out of Scope

- Recurring reminders.
- Multi-device sync or cloud notifications.
- OS-native notification integration.
- Calendar import/export beyond existing course-table behavior.
- Multiple simultaneous popup windows.
- Turning a one-off reminder into a permanent personal project from the popup.
- Advanced conflict resolution beyond truncating the current course/fixed block and capping the reminder-started block before the next course.
- Full redesign of the main day planner.
- New fullscreen transition effects.

## Further Notes

- Keep the feature lightweight. The reminder popup is a decision aid for the current day, not a heavy task-management system.
- The scheduled reminder model should deliberately avoid the earlier ambiguity where temporary reminder-like items became standing personal projects.
- The Gantt chart in the popup is part of the decision UI. It should be designed for scanning: fixed/course time must be obvious, and courses must be red.
- The `开始` flow is a runtime action. It should answer "what do I do now and for how long?" rather than "how should this item rank in my long-term soft-fill pool?"
- Because the app already has mock-time controls, this feature should remain testable without waiting for wall-clock time.
