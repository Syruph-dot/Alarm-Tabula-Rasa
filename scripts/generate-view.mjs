import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mergeHardEvents, calculateFreeIntervals } from '../src/lib/intervals.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const samplePath = resolve(__dirname, '..', 'docs', 'sample-data', 'free-time-sample-2026-05-22.json');
const outPath = resolve(__dirname, '..', 'docs', 'day-view.html');

const raw = JSON.parse(readFileSync(samplePath, 'utf-8'));
const date = raw.metadata.date;
const events = raw.fixedEvents[date];
const merged = mergeHardEvents(events);
const dayStart = new Date(`${date}T${raw.settings.dayStart}:00+08:00`);
const dayEnd = new Date(`${date}T${raw.settings.dayEnd}:00+08:00`);
const free = calculateFreeIntervals(merged, dayStart, dayEnd);

function fmt(d) {
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

function timeToRow(d) {
  return Math.round((d.getHours() - 8) * 2 + d.getMinutes() / 30) + 1;
}

const hardHtml = merged.map(ev => `
    <div class="event hard" style="grid-row: ${timeToRow(ev.start)} / ${timeToRow(ev.end)}">
      <span class="time">${fmt(ev.start)}–${fmt(ev.end)}</span>
      <span class="label">${ev.labels.join(', ')}</span>
      <span class="source">${ev.sources.join(', ')}</span>
    </div>`).join('\n');

const freeHtml = free.map(f => `
    <div class="event free" style="grid-row: ${timeToRow(f.start)} / ${timeToRow(f.end)}">
      <span class="time">${fmt(f.start)}–${fmt(f.end)}</span>
      <span class="label">空闲</span>
    </div>`).join('\n');

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>Tabula Rasa — ${date}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, 'Segoe UI', sans-serif; background: #1a1a2e; color: #eee; padding: 16px; }
    h1 { font-size: 18px; margin-bottom: 12px; color: #a0a0c0; }
    .timeline { display: grid; grid-template-rows: repeat(60, 24px); gap: 1px; position: relative; }
    .hour-labels { position: absolute; top: 0; left: 0; right: 0; bottom: 0; pointer-events: none; }
    .hour-tick { position: relative; height: 48px; border-top: 1px solid #2a2a3e; }
    .hour-tick::before { content: attr(data-hour); position: absolute; left: -2px; top: -8px; font-size: 10px; color: #444; }
    .event { border-radius: 6px; padding: 4px 10px; overflow: hidden; display: flex; flex-direction: column; justify-content: center; margin: 1px 4px; font-size: 13px; }
    .event.hard { background: #3a3a5c; border-left: 3px solid #7c7cf0; }
    .event.free { background: #1e3a2e; border-left: 3px solid #4caf50; }
    .event .time { font-size: 11px; color: #888; }
    .event .label { font-size: 14px; font-weight: 500; }
    .event .source { font-size: 10px; color: #666; }
    .legend { display: flex; gap: 20px; margin: 16px 0; font-size: 13px; }
    .legend-item { display: flex; align-items: center; gap: 6px; }
    .legend-dot { width: 12px; height: 12px; border-radius: 3px; display: inline-block; }
    .legend-dot.hard { background: #7c7cf0; }
    .legend-dot.free { background: #4caf50; }
  </style>
</head>
<body>
  <h1>📅 ${date} — 日视图</h1>
  <div class="legend">
    <span class="legend-item"><span class="legend-dot hard"></span> 固定 / 临时事件</span>
    <span class="legend-item"><span class="legend-dot free"></span> 空闲时段</span>
  </div>
  <div class="timeline">
    ${hardHtml}
    ${freeHtml}
  </div>
</body>
</html>`;

writeFileSync(outPath, html, 'utf-8');
console.log(`✅ 已生成: ${outPath}`);
console.log(`   日期: ${date}`);
console.log(`   硬事件: ${merged.length} 个`);
console.log(`   空闲段: ${free.length} 个`);
