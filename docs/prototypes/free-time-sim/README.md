# Free-Time Logic Prototype

PROTOTYPE - throwaway logic check, not production code.

Question answered: given fixed class events, one temporary event, and a reminder item pool, does the MVP model produce a readable hard-time/soft-fill day?

Run:

```powershell
python docs/prototypes/free-time-sim/prototype_free_time.py
```

The script reads `docs/sample-data/free-time-sample-2026-05-22.json`, merges overlapping hard events, computes free intervals, fills them with reminder items by dynamic score, and prints the full derived state.
