export const PREFERENCE_PROMPT = '第一印象：哪个更重要？';

const K = 160;

function pairKey(a, b) {
  return [a, b].sort().join('::');
}

function minutesSince(value, now) {
  if (!value) return Infinity;
  return Math.max(0, (now - new Date(value)) / 60000);
}

function expectedScore(item, opponent) {
  return 1 / (1 + Math.pow(10, ((opponent.importanceScore ?? 0) - (item.importanceScore ?? 0)) / 400));
}

function scoreDelta(item, opponent, result) {
  return Math.round(K * (result - expectedScore(item, opponent)));
}

function applyScore(items, leftId, rightId, choice, at) {
  if (choice === 'skip') return items;

  return items.map(item => {
    if (item.id !== leftId && item.id !== rightId) return item;
    const isLeft = item.id === leftId;
    const opponent = items.find(candidate => candidate.id === (isLeft ? rightId : leftId));
    if (!opponent) return item;

    const result = choice === 'left'
      ? (isLeft ? 1 : 0)
      : choice === 'right'
        ? (isLeft ? 0 : 1)
        : 0.5;

    return {
      ...item,
      importanceScore: Math.max(0, (item.importanceScore ?? 0) + scoreDelta(item, opponent, result)),
      confidence: Math.min(1, (item.confidence ?? 0) + (choice === 'tie' ? 0.05 : 0.02)),
      lastComparedAt: at.toISOString(),
    };
  });
}

export function choosePreferencePair(items, history = [], now = new Date()) {
  const active = items.filter(item => item.active);
  if (active.length < 2) return null;

  const itemCounts = new Map(active.map(item => [item.id, 0]));
  const pairStats = new Map();

  for (const entry of history) {
    if (!entry.leftItemId || !entry.rightItemId) continue;
    itemCounts.set(entry.leftItemId, (itemCounts.get(entry.leftItemId) ?? 0) + 1);
    itemCounts.set(entry.rightItemId, (itemCounts.get(entry.rightItemId) ?? 0) + 1);

    const key = pairKey(entry.leftItemId, entry.rightItemId);
    const stat = pairStats.get(key) ?? { count: 0, skips: 0, lastAt: null };
    stat.count += 1;
    if (entry.choice === 'skip') stat.skips += 1;
    if (!stat.lastAt || new Date(entry.at) > new Date(stat.lastAt)) stat.lastAt = entry.at;
    pairStats.set(key, stat);
  }

  const pairs = [];
  for (let i = 0; i < active.length; i += 1) {
    for (let j = i + 1; j < active.length; j += 1) {
      const left = active[i];
      const right = active[j];
      const key = pairKey(left.id, right.id);
      const stat = pairStats.get(key) ?? { count: 0, skips: 0, lastAt: null };
      const leftCount = itemCounts.get(left.id) ?? 0;
      const rightCount = itemCounts.get(right.id) ?? 0;
      const coverageBonus = 260 / (1 + leftCount + rightCount);
      const uncertaintyBonus = (1 - (left.confidence ?? 0)) * 35 + (1 - (right.confidence ?? 0)) * 35;
      const closenessBonus = Math.max(0, 160 - Math.abs((left.importanceScore ?? 0) - (right.importanceScore ?? 0)));
      const unscheduledBonus = (left.lastScheduledAt ? 0 : 35) + (right.lastScheduledAt ? 0 : 35);
      const staleBonus = Math.min(80, (minutesSince(left.lastComparedAt, now) + minutesSince(right.lastComparedAt, now)) / 120);
      const repeatPenalty = stat.count * 100;
      const recencyPenalty = minutesSince(stat.lastAt, now) < 60 ? 320 : 0;
      const skipPenalty = stat.skips > 0 && minutesSince(stat.lastAt, now) < 180 ? 260 : 0;

      pairs.push({
        left,
        right,
        prompt: PREFERENCE_PROMPT,
        score: coverageBonus + uncertaintyBonus + closenessBonus + unscheduledBonus + staleBonus
          - repeatPenalty - recencyPenalty - skipPenalty,
        reason: {
          coverageBonus,
          uncertaintyBonus,
          closenessBonus,
          unscheduledBonus,
          staleBonus,
          repeatPenalty,
          recencyPenalty,
          skipPenalty,
          previousComparisons: stat.count,
        },
      });
    }
  }

  pairs.sort((a, b) => b.score - a.score);
  return pairs[0] ?? null;
}

export function resolvePreferenceChoice(items, history = [], input) {
  const at = input.at instanceof Date ? input.at : new Date(input.at ?? Date.now());
  if (!['left', 'right', 'tie', 'skip'].includes(input.choice)) {
    throw new Error('choice must be left, right, tie, or skip');
  }

  const nextHistory = [
    ...history,
    {
      at: at.toISOString(),
      leftItemId: input.leftItemId,
      rightItemId: input.rightItemId,
      choice: input.choice,
      prompt: PREFERENCE_PROMPT,
    },
  ];

  return {
    items: applyScore(items, input.leftItemId, input.rightItemId, input.choice, at),
    history: nextHistory,
  };
}
