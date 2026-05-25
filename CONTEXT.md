# Alarm Tabula Rasa

Alarm Tabula Rasa is a lightweight free-time manager that helps the user decide what to do next, react to interruptions, and preserve fixed commitments while rebuilding the rest of the day.

## Language

**Reminder**:
A dated and timed prompt that appears when due and asks the user to snooze or start the reminded item.
_Avoid_: Personal project, standing project, soft-fill item

**Personal Project**:
A reusable user-owned item that can be selected by the dynamic free-time planner.
_Avoid_: Reminder, timed reminder

**Block**:
A planned interval on the day schedule.
_Avoid_: Task, card

**One-off Block**:
A non-reusable block created from an immediate runtime action for a bounded duration.
_Avoid_: Personal project, standing project

**Course Block**:
A class interval imported from the course table and highlighted as high-visibility schedule context.
_Avoid_: Reminder, personal project

## Relationships

- A **Reminder** may start exactly one **One-off Block** when the user chooses `开始`.
- A **Personal Project** may be selected repeatedly into future **Blocks** by the planner.
- A **Course Block** should not be treated as a **Personal Project**.
- A **Reminder** is not a **Personal Project** unless the user explicitly creates a separate project.
- Starting a **Reminder** does not create or activate a **Personal Project**.
- Starting a **Reminder** may truncate the current **Course Block**.
- A **One-off Block** started from a **Reminder** must end before the next **Course Block** begins.
- A **Course Block** appears in the unified blocks list with `runtimeLocked: true` so user actions (early-end, Reminder start) can target it.
- Starting a **Reminder** composites two existing operations: `endCurrentBlockEarly` (truncate current block at now) followed by `lockBlockInStore` (insert the labeled one-off block for the chosen duration).

### Reminder popup

- The **Reminder popup** is an independent lower-right `reminderWindow` (not fullscreen alarm, not tray widget).
- Only one popup is visible at a time. Multiple due **Reminders** are queued by `dueAt` then `createdAt`; after the current popup is resolved, the next one is shown immediately in the same window.
- The popup close button snoozes the reminder for 12 minutes. Each subsequent close on that same reminder increments by 5 minutes (12 → 17 → 22 …). The increment resets if the user explicitly chooses `开始`.
- `showing` is a transient UI state, not persisted. Persisted statuses: `scheduled`, `snoozed`, `started`. Soft-delete via `archivedAt`.
- Due detection uses the same scheduler loop and 30-second lookback window as alarm triggers.

## Example Dialogue

> **Dev:** "Should `Add Reminder` add an item to the dynamic planning pool?"
> **Domain expert:** "No. A **Reminder** has a date and time. The reusable planning-pool item is a **Personal Project**."

## Flagged Ambiguities

- "Reminder" was previously used for reusable soft-fill items and for timed prompts; resolved: **Reminder** only means a dated and timed prompt, while reusable soft-fill items are **Personal Projects**.
- A started **Reminder** was considered as a possible way to create a reusable project; resolved: starting a **Reminder** creates only a **One-off Block**.
- **Course Block** was considered as possibly protected from Reminder start actions; resolved: course blocks are highlighted schedule context, but a Reminder can still be force-started over the current course.
- Forced start over a **Course Block** was considered as a visual overlap; resolved: the current course is truncated, while the next course remains a hard upper bound for the **One-off Block**.
- **Course Block** is endable like any other block. Its `runtimeLocked` status only prevents softmax re-sampling from replacing its label; it does not prevent user actions such as early-end or reminder-start.
