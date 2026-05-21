"""PROTOTYPE - throwaway free-time fill simulation.

This is not production code. It exists to make the PRD model concrete with
sample data and then be deleted or absorbed after review.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[3]
SAMPLE_PATH = ROOT / "docs" / "sample-data" / "free-time-sample-2026-05-22.json"


@dataclass
class Interval:
    start: datetime
    end: datetime
    labels: list[str]
    sources: list[str]

    def minutes(self) -> int:
        return int((self.end - self.start).total_seconds() // 60)


def parse_dt(value: str) -> datetime:
    return datetime.fromisoformat(value)


def clock_on(date: str, clock: str) -> datetime:
    return datetime.fromisoformat(f"{date}T{clock}:00+08:00")


def fmt(dt: datetime) -> str:
    return dt.strftime("%H:%M")


def merge_hard_events(events: list[dict[str, Any]]) -> list[Interval]:
    intervals = [
        Interval(
            start=parse_dt(event["startTime"]),
            end=parse_dt(event["endTime"]),
            labels=[event["label"]],
            sources=[event["source"]],
        )
        for event in events
    ]
    intervals.sort(key=lambda item: item.start)

    merged: list[Interval] = []
    for interval in intervals:
        if not merged or interval.start >= merged[-1].end:
            merged.append(interval)
            continue

        merged[-1].end = max(merged[-1].end, interval.end)
        merged[-1].labels.extend(interval.labels)
        merged[-1].sources.extend(interval.sources)

    return merged


def free_intervals(hard: list[Interval], day_start: datetime, day_end: datetime) -> list[Interval]:
    cursor = day_start
    result: list[Interval] = []
    for interval in hard:
        if interval.start > cursor:
            result.append(Interval(cursor, interval.start, ["free"], ["free"]))
        cursor = max(cursor, interval.end)
    if cursor < day_end:
        result.append(Interval(cursor, day_end, ["free"], ["free"]))
    return result


def choose_item(items: list[dict[str, Any]], scheduled_counts: dict[str, int]) -> dict[str, Any]:
    active = [item for item in items if item.get("active", True)]
    return max(
        active,
        key=lambda item: item["importanceScore"] - scheduled_counts.get(item["id"], 0) * 80,
    )


def build_soft_blocks(
    free: list[Interval],
    items: list[dict[str, Any]],
    minimum_minutes: int,
) -> list[dict[str, Any]]:
    blocks: list[dict[str, Any]] = []
    scheduled_counts: dict[str, int] = {}

    for interval in free:
        cursor = interval.start
        while int((interval.end - cursor).total_seconds() // 60) >= minimum_minutes:
            item = choose_item(items, scheduled_counts)
            remaining = int((interval.end - cursor).total_seconds() // 60)
            duration = min(item["defaultDurationMinutes"], remaining)
            if duration < minimum_minutes:
                break

            end = cursor + timedelta(minutes=duration)
            blocks.append(
                {
                    "label": item["label"],
                    "itemId": item["id"],
                    "start": fmt(cursor),
                    "end": fmt(end),
                    "durationMinutes": duration,
                    "scoreAtGeneration": item["importanceScore"],
                }
            )
            scheduled_counts[item["id"]] = scheduled_counts.get(item["id"], 0) + 1
            cursor = end

    return blocks


def main() -> None:
    data = json.loads(SAMPLE_PATH.read_text(encoding="utf-8"))
    date = data["metadata"]["date"]
    events = data["fixedEvents"][date]
    settings = data["settings"]

    day_start = clock_on(date, settings["dayStart"])
    day_end = clock_on(date, settings["dayEnd"])
    hard = merge_hard_events(events)
    free = free_intervals(hard, day_start, day_end)
    soft = build_soft_blocks(free, data["reminderItems"], settings["minimumFillMinutes"])

    output = {
        "date": date,
        "prototype": "free-time-sim",
        "hardIntervals": [
            {
                "start": fmt(item.start),
                "end": fmt(item.end),
                "minutes": item.minutes(),
                "labels": item.labels,
                "sources": item.sources,
            }
            for item in hard
        ],
        "freeIntervals": [
            {
                "start": fmt(item.start),
                "end": fmt(item.end),
                "minutes": item.minutes(),
            }
            for item in free
        ],
        "softFillBlocks": soft,
    }
    print(json.dumps(output, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
