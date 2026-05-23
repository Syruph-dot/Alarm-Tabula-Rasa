# Rename `reminderItems` store key to `personalProjects`

The store key `reminderItems` currently holds reusable soft-fill pool items — what the domain model calls **Personal Projects**, not Reminders. With 008-scheduled-reminder-popup introducing real **Reminders** (dated/timed prompts with snooze and start), keeping the old key name would cause persistent confusion. We rename `reminderItems` → `personalProjects` across the codebase, with a one-way migration in `normalizeStore` that detects the old key and upgrades it on first load.

**Considered alternative**: keep the key and add a new `reminders` array alongside it, relying on documentation to disambiguate. Rejected because having `reminderItems` and `reminders` in the same store, meaning different things, is a bug magnet.
