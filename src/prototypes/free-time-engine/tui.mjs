// PROTOTYPE — TUI shell for the free-time fill engine.
// Throwaway. The logic lives in engine.mjs.

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as readline from 'node:readline';
import {
  mergeHardEvents, calculateFreeIntervals,
  rebuildFromNow, extendBlockAndReschedule, moveBlockEndAndReschedule, addBreakAndReschedule,
  applyRuntimeOverrides, applyComparison, chooseComparisonPair,
  fmtTime, minutesBetween,
} from './engine.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SAMPLE_PATH = resolve(__dirname, '..', '..', '..', 'docs', 'sample-data', 'free-time-sample-2026-05-22.json');

const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const GREEN = '\x1b[32m';
const BLUE = '\x1b[34m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';
const CLEAR = '\x1b[2J\x1b[H';

export class State {
  constructor() {
    const raw = JSON.parse(readFileSync(SAMPLE_PATH, 'utf-8'));
    this.date = raw.metadata.date;
    this.settings = { earlyEndCooldownMinutes: 180, ...raw.settings, date: this.date };
    this.fixedEvents = raw.fixedEvents[this.date];
    this.reminderItems = raw.reminderItems;
    this.comparisonHistory = raw.comparisonHistory ?? [];
    this.softFillBlocks = [];
    this.runtimeBlocks = [];
    this.itemCooldowns = [];
    this.mockNow = new Date(`${this.date}T11:45:00+08:00`);
    this.message = '按 [r] 重建填充表';
    this.rebuild();
  }

  rebuild() {
    const merged = mergeHardEvents(this.fixedEvents);
    const dayStart = new Date(`${this.date}T${this.settings.dayStart}:00+08:00`);
    const dayEnd = new Date(`${this.date}T${this.settings.dayEnd}:00+08:00`);
    const free = calculateFreeIntervals(merged, dayStart, dayEnd);
    this.merged = merged;
    this.freeIntervals = free;
    this.softFillBlocks = rebuildFromNow(this.effectiveFixedEvents(), this.reminderItems, dayStart, this.effectiveSettings());
    this.message = `✅ 已重建 (${this.softFillBlocks.length} 个软填充块)`;
  }

  rebuildFromNow() {
    const now = this.mockNow;
    this.softFillBlocks = rebuildFromNow(this.effectiveFixedEvents(), this.reminderItems, now, this.effectiveSettings());
    this.message = `✅ 从 ${fmtTime(now)} 起重建 (${this.softFillBlocks.length} 个软填充块)`;
  }

  effectiveSettings(extra = {}) {
    return {
      ...this.settings,
      itemCooldowns: this.itemCooldowns,
      ...extra,
    };
  }

  effectiveFixedEvents() {
    return applyRuntimeOverrides(this.fixedEvents, this.runtimeBlocks);
  }

  replaceRuntimeBlock(block) {
    this.runtimeBlocks = [
      ...this.runtimeBlocks.filter(existing => existing.start >= block.end || existing.end <= block.start),
      block,
    ];
  }

  replaceRuntimeBlocks(blocks) {
    this.runtimeBlocks = blocks.reduce((all, block) => {
      if (!block) return all;
      return [
        ...all.filter(existing => existing.start >= block.end || existing.end <= block.start),
        block,
      ];
    }, this.runtimeBlocks);
  }

  shiftMockNow(minutes) {
    const next = new Date(this.mockNow.getTime() + minutes * 60000);
    const min = new Date(`${this.date}T${this.settings.dayStart}:00+08:00`);
    const max = new Date(`${this.date}T${this.settings.dayEnd}:00+08:00`);
    this.mockNow = new Date(Math.min(max.getTime(), Math.max(min.getTime(), next.getTime())));
    this.message = `🕒 mock 当前时间 → ${fmtTime(this.mockNow)}`;
  }

  adjustCooldown(minutes) {
    const next = Math.max(0, (this.settings.earlyEndCooldownMinutes ?? 180) + minutes);
    this.settings = { ...this.settings, earlyEndCooldownMinutes: next };
    this.message = `🧊 提前结束冷却 → ${next} 分钟`;
  }

  comparePair() {
    const pair = chooseComparisonPair(this.reminderItems, this.comparisonHistory, this.mockNow);
    if (!pair) {
      this.message = '⚠️ 至少需要 2 个活跃提醒事项';
      return;
    }

    const { left, right, reason } = pair;
    this._pendingComparison = { left, right };
    this.message = `⚖️  ${BOLD}${left.label}${RESET} vs ${BOLD}${right.label}${RESET}  — 按 [1] 左  [2] 右  [3] 平  [4] 跳过\n${DIM}抽样: 覆盖不足+分数接近+低置信；重复惩罚 ${Math.round(reason.repeatPenalty)}，近期惩罚 ${Math.round(reason.recencyPenalty)}${RESET}`;
  }

  resolveComparison(choice) {
    if (!this._pendingComparison) return;
    const { left, right } = this._pendingComparison;
    this._pendingComparison = null;

    const label = choice === 1 ? 'left' : choice === 2 ? 'right' : choice === 3 ? 'tie' : null;
    if (!label) { this.message = '已跳过'; return; }

    this.reminderItems = applyComparison(this.reminderItems, left.id, right.id, label);
    this.comparisonHistory.push({
      at: this.mockNow.toISOString(),
      leftItemId: left.id,
      rightItemId: right.id,
      choice: label,
    });
    this.message = `⚖️  ${left.label} vs ${right.label} → ${label === 'tie' ? '平局' : choice === 1 ? '左胜' : '右胜'}`;
    this.rebuildFromNow();
  }

  extendCurrent() {
    const now = this.mockNow;
    const result = extendBlockAndReschedule(
      this.softFillBlocks, this.effectiveFixedEvents(), this.reminderItems, now, 15, this.effectiveSettings(),
    );
    if (!result) {
      this.message = '⚠️ 没有可延长的进行中块，或已到下一条硬事件边界';
      return;
    }

    // Keep blocks before the extended one, replace the rest
    this.replaceRuntimeBlock(result.extendedBlock);
    const pastBlocks = this.softFillBlocks.filter(b => b.end <= result.extendedBlock.start);
    this.softFillBlocks = [...pastBlocks, result.extendedBlock, ...result.subsequentBlocks];
    this.recalcDerived();
    this.message = `⏱️  延长 "${result.extendedBlock.label}" +15分钟 → ${fmtTime(result.extendedBlock.end)}`;
  }

  moveEnd(move) {
    const now = this.mockNow;
    const result = moveBlockEndAndReschedule(
      this.softFillBlocks, this.effectiveFixedEvents(), this.reminderItems, now, move, this.effectiveSettings(),
    );
    if (!result) {
      this.message = '⚠️ 没有可提前结束的进行中块';
      return;
    }

    this.itemCooldowns = [
      ...this.itemCooldowns.filter(cooldown => cooldown.itemId !== result.cooldown.itemId || new Date(cooldown.until) <= now),
      result.cooldown,
    ];
    if (result.adjustedBlock) this.replaceRuntimeBlock(result.adjustedBlock);
    const target = result.adjustedBlock ?? result.skippedBlock;
    const pastBlocks = this.softFillBlocks.filter(b => b.end <= target.start);
    const runtimeBlocks = result.adjustedBlock ? [result.adjustedBlock] : [];
    this.softFillBlocks = [...pastBlocks, ...runtimeBlocks, ...result.subsequentBlocks];
    this.recalcDerived();
    const action = move === 'now' ? '停止' : '提前结束';
    const targetEnd = result.adjustedBlock?.end ?? now;
    this.message = `⏹️  ${action} "${target.label}" → ${fmtTime(targetEnd)}，冷却到 ${fmtTime(result.cooldown.until)}`;
  }

  addBreak() {
    const now = this.mockNow;
    const result = addBreakAndReschedule(
      this.softFillBlocks, this.effectiveFixedEvents(), this.reminderItems, now, 15, this.effectiveSettings(),
    );
    if (!result) {
      this.message = '⚠️ 当前无法插入休息块';
      return;
    }

    this.replaceRuntimeBlocks([result.completedBlock, result.breakBlock]);
    const pastBlocks = this.softFillBlocks.filter(b => b.end <= (result.completedBlock?.start ?? result.breakBlock.start));
    const runtimeBlocks = [result.completedBlock, result.breakBlock].filter(Boolean);
    this.softFillBlocks = [...pastBlocks, ...runtimeBlocks, ...result.subsequentBlocks];
    this.recalcDerived();
    this.message = `☕  增加休息 ${fmtTime(result.breakBlock.start)}–${fmtTime(result.breakBlock.end)}`;
  }

  recalcDerived() {
    const merged = mergeHardEvents(this.fixedEvents);
    const dayStart = new Date(`${this.date}T${this.settings.dayStart}:00+08:00`);
    const dayEnd = new Date(`${this.date}T${this.settings.dayEnd}:00+08:00`);
    this.merged = merged;
    this.freeIntervals = calculateFreeIntervals(merged, dayStart, dayEnd);
  }

  render() {
    let out = `${CLEAR}${BOLD}🧪 Tabula Rasa — 空闲填充引擎原型${RESET}\n`;
    out += `${DIM}日期: ${this.date}  |  时段: ${this.settings.dayStart}–${this.settings.dayEnd}  |  mock 当前时间: ${fmtTime(this.mockNow)}  |  提前结束冷却: ${this.settings.earlyEndCooldownMinutes}分钟${RESET}\n\n`;

    // --- Hard events ---
    out += `${BOLD}📌 硬事件${RESET}\n`;
    for (const ev of this.merged) {
      out += `  ${BLUE}${fmtTime(ev.start)}–${fmtTime(ev.end)}${RESET}  ${ev.labels.join(', ')}  ${DIM}(${ev.sources.join(',')})${RESET}\n`;
    }

    // --- Free intervals ---
    out += `\n${BOLD}🟢 空闲时段${RESET}\n`;
    for (const f of this.freeIntervals) {
      const min = minutesBetween(f.start, f.end);
      out += `  ${fmtTime(f.start)}–${fmtTime(f.end)}  ${DIM}(${Math.round(min)} 分钟)${RESET}\n`;
    }

    // --- Soft-fill blocks ---
    out += `\n${BOLD}🧩 软填充块${RESET}\n`;
    if (this.softFillBlocks.length === 0) {
      out += `  ${DIM}(无 — 所有空闲时段不足以填充)${RESET}\n`;
    } else {
      for (const b of this.softFillBlocks) {
        const extMark = b.extended ? ` ${YELLOW}← 已延长${RESET}` : '';
        const shortMark = b.shortened ? ` ${YELLOW}← 已提前结束${RESET}` : '';
        const breakMark = b.break ? ` ${YELLOW}← 休息${RESET}` : '';
        out += `  ${GREEN}${fmtTime(b.start)}–${fmtTime(b.end)}${RESET}  ${b.label}  ${DIM}(${b.durationMinutes}分钟, score:${b.score})${RESET}${extMark}${shortMark}${breakMark}\n`;
      }
    }

    // --- Reminder items ---
    out += `\n${BOLD}📋 提醒事项${RESET}\n`;
    for (const item of this.reminderItems) {
      const activeMark = item.active ? '' : ` ${DIM}[隐藏]${RESET}`;
      const cooldown = this.itemCooldowns.find(entry => entry.itemId === item.id && new Date(entry.until) > this.mockNow);
      const cooldownMark = cooldown ? ` ${YELLOW}[冷却到 ${fmtTime(cooldown.until)}]${RESET}` : '';
      out += `  ${item.label.padEnd(16)} score:${String(item.importanceScore).padEnd(4)} conf:${(item.confidence ?? 0).toFixed(2)}${activeMark}${cooldownMark}\n`;
    }

    // --- Message ---
    if (this.message) out += `\n${this.message}\n`;

    // --- Footer ---
    out += `\n${DIM}[r]${RESET}重建  ${DIM}[n]${RESET}从mock当前时间重建  ${DIM}[e]${RESET}+15分钟  ${DIM}[a]${RESET}-15分钟  ${DIM}[s]${RESET}停止当前块  ${DIM}[b]${RESET}休息15分钟  ${DIM}[c]${RESET}二选一  ${DIM}[</>]${RESET}冷却±30分钟  ${DIM}[←/→]${RESET}时间±15分钟  ${DIM}[↑/↓]${RESET}时间±60分钟  ${DIM}[q]${RESET}退出\n`;

    return out;
  }
}

const state = new State();

if (process.argv.includes('--smoke')) {
  state.rebuildFromNow();
  state.extendCurrent();
  state.comparePair();
  state.resolveComparison(1);
  state.moveEnd(-15);
  state.addBreak();
  console.log(state.render());
  process.exit(0);
}

readline.emitKeypressEvents(process.stdin);
if (process.stdin.isTTY) process.stdin.setRawMode(true);

console.log(state.render());

process.stdin.on('keypress', (_str, key) => {
  if (key.name === 'q') {
    console.log(`${CLEAR}原型已退出。\n`);
    process.exit(0);
  }

  if (state._pendingComparison) {
    const map = { 1: 1, 2: 2, 3: 3, 4: 4 };
    const choice = map[key.name];
    if (choice !== undefined) {
      state.resolveComparison(choice);
    } else if (key.name === 'escape') {
      state._pendingComparison = null;
      state.message = '已取消比较';
    }
    console.log(state.render());
    return;
  }

  switch (key.name) {
    case 'r': state.rebuild(); break;
    case 'n': state.rebuildFromNow(); break;
    case 'e': state.extendCurrent(); break;
    case 'a': state.moveEnd(-15); break;
    case 's': state.moveEnd('now'); break;
    case 'b': state.addBreak(); break;
    case 'c': state.comparePair(); break;
    case ',': state.adjustCooldown(-30); break;
    case '<': state.adjustCooldown(-30); break;
    case '.': state.adjustCooldown(30); break;
    case '>': state.adjustCooldown(30); break;
    case 'left': state.shiftMockNow(-15); break;
    case 'right': state.shiftMockNow(15); break;
    case 'up': state.shiftMockNow(60); break;
    case 'down': state.shiftMockNow(-60); break;
    case 'escape': process.exit(0); break;
  }
  console.log(state.render());
});
