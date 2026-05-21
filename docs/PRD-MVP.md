# PRD: Tabula Rasa — MVP 原型

## Product Definition

**Tabula Rasa** 是一个面向大学生日常的 Windows 桌面 **空闲时间管理器**。

它不是完整日程系统，也不是决策器。它只把用户一天里的时间分成两类：

1. **硬时间**：课表、固定安排、临时加入事件。它们占住时间，不被系统随意移动。
2. **软填充**：项目池里的提醒事项。系统根据内部数据动态塞进空闲时间，允许变动、替换、缩短、顺延。

产品重点是：用户只需要用很少的点击，把课表外的空闲时间交给系统填充；系统在每个软填充块结束时提醒切换，并在临时事件加入后自动从当前时间往后修表。

## Problem Statement

SKK 是一位兴趣广泛的大学生，每天除了课表，还有很多不固定出现的事情：同学约事、社团、临时通知、吃饭、杂务、通勤、小组讨论等。当前痛点有三：

1. **空闲时间散掉**：课间、晚上、零碎空档本来可以推进项目，但经常被滑走。
2. **临时事件打乱**：临时加入一个事件后，后面的空闲安排需要重新填充，手动改表很烦。
3. **项目偏好难维护**：用户不想给每个项目手动填高/中/低优先级，但可以凭第一印象判断两个项目哪个更重要。

需要一个轻量工具：以课表和临时事件为硬约束，动态填充空闲时间；用户通过托盘小组件做少量二选一点击，系统用这些点击持续修正项目数据，再据此动态修表。

## Solution

MVP 由四个核心能力组成：

- **固定时间录入**：用户录入课表和已确定安排，作为硬约束。
- **提醒事项池**：用户录入想在空闲时间推进的事项名称，系统保存其动态数据。
- **二选一偏好采样**：托盘唤起小组件，展示两个提醒事项，让用户按第一印象点选“哪个更重要”。
- **动态空闲填充**：系统根据固定时间、临时事件、提醒事项数据，自动生成从当前时间往后的软填充时间表。

闹钟只负责提醒切换，不承载复杂决策。用户加入临时事件后，系统自动重新生成后续软填充块。

## Interaction Principles

- 除名称外，优先使用点击选择，不要求用户填复杂参数。
- 不暴露“高/中/低优先级”“弹性时间”等工程字段。
- 软填充块不是承诺，只是当前最合适的安排；动态变化是正常行为。
- 固定时间和临时事件是硬约束；提醒事项填充是软约束。
- 闹钟提醒保持轻，只告诉用户现在该切换到什么。

## Core Concepts

### Fixed Event（固定事件）

已确定的时间占用，例如课程、会议、固定饭点、考试、社团例会。

用户需要输入或选择：

- 名称
- 开始时间
- 结束时间或持续时长
- 可选重复规则（MVP 可先不做，只支持当天）

### Temporary Event（临时事件）

当天临时加入的时间占用。它不是“突发事件”或 emergency，而是大学生活中临时出现的安排。

用户从托盘或主窗口加入：

- 开始：现在 / 当前块结束后 / 选择时间
- 时长：15 / 30 / 45 / 60 / 90 分钟
- 名称：可输入，也可从常用项选择，例如吃饭、通勤、社团、同学约、小组讨论、杂事、其他

确认后，系统从当前时间往后重新生成软填充块。

### Reminder Item（提醒事项）

可以被塞进空闲时间的项目或事项，例如课程作业、个人项目、阅读、训练、实验、复习。

用户最少只需要输入：

- 名称

MVP 可以用点击选择补充：

- 常用块长：15 / 30 / 45 / 60 分钟
- 是否暂时隐藏

系统内部维护动态数据，不要求用户理解或手动编辑。

### Soft Fill Block（软填充块）

系统把 Reminder Item 放入空闲时间后生成的临时时间块。

软填充块可以被系统动态调整：

- 换成另一个提醒事项
- 缩短
- 顺延
- 被临时事件挤掉
- 因新的偏好采样而重新排序

这符合产品定位：Tabula Rasa 管的是空闲时间，不是不可变日程。

## User Stories

1. As a user, I want to enter my fixed classes and fixed events, so the app knows which time ranges cannot be used.
2. As a user, I want to add reminder items by name, so the app can fill free time without making me write a full schedule.
3. As a user, I want to summon a tray widget that asks me to compare two reminder items, so I can express preference with one click.
4. As a user, I want the comparison question to be based on first impression, not “which is more important today”, so I do not have to reason deeply.
5. As a user, I want the app to update item data after each comparison, so future free-time filling becomes closer to my actual preference.
6. As a user, I want the app to automatically fill free gaps with reminder items, so I can use idle time without planning every block.
7. As a user, I want filled blocks to be allowed to change dynamically, so the schedule does not feel too rigid.
8. As a user, I want to add a temporary event quickly when something comes up, so the app can reserve that time.
9. As a user, I want the app to rebuild only the future part of the free-time table after a temporary event, so past blocks are not rewritten.
10. As a user, I want a fullscreen alarm when a filled block ends, so I notice that it is time to switch.
11. As a user, I want the alarm to show only the next item and a short countdown, so the reminder stays lightweight.
12. As a user, I want to dismiss the alarm by clicking, so I can continue without extra typing.
13. As a user, I want the app to run from the system tray, so it stays available without occupying attention.
14. As a user, I want to pause and resume reminders from the tray, so the app does not interrupt during unmanaged time.

## Implementation Decisions

### 技术栈

- **Runtime**: Electron（Windows 桌面、系统托盘、全屏覆盖层支持成熟）
- **UI**: HTML/CSS + vanilla JS 或轻量框架
- **Audio**: Web Audio API（MVP 可使用默认提示音，BGM 个性化后置）
- **Storage**: 本地 JSON 文件（单用户、无网络需求）
- **Packaging**: electron-builder（生成 Windows 安装包）

### Module A: Free Time Engine（空闲时间引擎）

负责把硬时间和提醒事项池合成为当天从当前时间往后的软填充表。

**数据模型**:

```ts
FixedEvent {
  id: string
  label: string
  startTime: string
  endTime: string
  source: "class" | "fixed" | "temporary"
}

ReminderItem {
  id: string
  label: string
  defaultDurationMinutes: number
  active: boolean

  // Internal dynamic data, not edited directly by the user.
  importanceScore: number
  confidence: number
  lastComparedAt?: string
  lastScheduledAt?: string
  lastTouchedAt?: string
}

SoftFillBlock {
  id: string
  itemId: string
  label: string
  startTime: string
  endTime: string
  generatedAt: string
}
```

**核心接口**:

- `buildFreeTimeTable(fixedEvents, reminderItems, now): SoftFillBlock[]`
- `addTemporaryEvent(fixedEvents, event): FixedEvent[]`
- `rebuildFromNow(fixedEvents, reminderItems, now): SoftFillBlock[]`
- `getNextAlarm(softFillBlocks, now): AlarmInfo | null`

**填充原则**:

1. 固定事件和临时事件先占位。
2. 只计算当前时间之后的空闲区间。
3. 每个空闲区间按提醒事项动态分数选择填充项。
4. 提醒事项块长优先使用默认块长；空档不足时可以缩短到 15 分钟。
5. 同一个提醒事项刚被安排过后，短时间内降低再次出现概率。
6. 很久没有被安排过的提醒事项获得轻微补偿，但不强制插入。
7. 每次偏好采样或临时事件加入后，都允许重建未来软填充块。

MVP 不追求全局最优，只追求“足够合理、可动态修正、用户操作少”。

### Module B: Preference Sampler（二选一偏好采样）

托盘唤起的小组件，用于采样用户对提醒事项的第一印象偏好。

**交互**:

窗口展示两个提醒事项：

- 左侧事项 A
- 右侧事项 B
- 按钮：A 更重要 / B 更重要 / 差不多 / 跳过

文案不使用“今天哪个更重要”，而使用：

> 第一印象：哪个更重要？

**算法**:

MVP 使用简单 Elo / pairwise score 更新即可：

- 选择 A：A 的 `importanceScore` 上升，B 小幅下降。
- 选择 B：B 的 `importanceScore` 上升，A 小幅下降。
- 选择“差不多”：两者分数靠近，置信度上升。
- 选择“跳过”：不改变分数，只降低短期内再次抽到这对组合的概率。

候选对选择优先考虑：

- 分数接近、需要区分的事项
- 很久没有比较过的事项
- 最近没有被安排过但仍 active 的事项

这个模块的目标不是一次性得到准确优先级，而是通过低成本点击持续修正内部数据。

### Module C: Alarm Presenter（闹钟呈现层）

全屏覆盖层，只做轻量提醒。

**状态机**:

```txt
IDLE -> SWEEPING_IN -> SHOWING -> DISMISSING -> IDLE
                         |
                         v
                      EXPIRED
```

**显示内容**:

- 大号文字：现在切换到 `nextBlock.label`
- 副文字：倒计时 `00:30` 到 `00:00`
- 可选提示：点击关闭

**不做**:

- 不在闹钟上做复杂决策。
- 不要求用户选择延长、跳过、重排方案。
- 不展示内部分数。

### Module D: Timeline View（时间表视图）

展示当天时间结构，但不把软填充块伪装成不可变承诺。

视觉上区分：

- 固定事件：稳定、不可移动
- 临时事件：当天加入、不可移动
- 软填充块：系统生成、可动态变化

用户可操作：

- 添加固定事件
- 添加临时事件
- 添加/隐藏提醒事项
- 立即重建未来空闲表

### Module E: App Shell（应用壳层）

- 系统托盘图标
- 托盘菜单：打开主窗口、偏好采样、加入临时事件、暂停/恢复、退出
- 主窗口关闭时最小化到托盘
- 可选开机自启
- 主进程负责调度闹钟

## 数据持久化

存储路径: `%APPDATA%/TabulaRasa/data.json`

```json
{
  "fixedEvents": {
    "2026-05-21": []
  },
  "reminderItems": [],
  "generatedTables": {
    "2026-05-21": []
  },
  "comparisonHistory": [],
  "settings": {
    "alarmSeconds": 30,
    "clickToDismiss": true,
    "autoStart": false,
    "defaultReminderDurationMinutes": 30,
    "minimumFillMinutes": 15
  }
}
```

`generatedTables` 是缓存结果，可以被重建；真正重要的数据是 `fixedEvents`、`reminderItems` 和 `comparisonHistory`。

## Testing Decisions

核心测试对象是纯逻辑模块：

- 空闲区间计算：固定事件占位后能正确得到空闲时间。
- 临时事件加入：只重建当前时间之后的软填充块。
- 填充算法：能按动态分数选择提醒事项，并尊重最小填充时长。
- 偏好采样：二选一结果能正确更新分数和置信度。
- 冷却与补偿：刚安排过的事项不会过度重复，长期未安排事项有轻微回补。
- 闹钟状态机：到点触发、倒计时、点击关闭、自动关闭的状态转换正确。

UI 层以手动验证为主，MVP 不强求端到端自动化。

## Out of Scope（MVP 不做）

- 复杂日历同步
- WeChat 导入
- 多设备云同步
- 移动端
- 多用户
- 统计分析报表
- 自定义闹钟皮肤/主题
- 精细化手动优先级编辑
- 全局最优排程
- 在闹钟界面做重决策
- 把软填充块当作不可变日程承诺

## Further Notes

- “临时事件”是正确术语，不使用“突发事件”。
- Tabula Rasa 的核心价值是管理课表外空闲时间，而不是替代完整日历。
- 二选一小组件采样的是长期直觉偏好，不是“今天哪个更重要”。
- 系统可以频繁修正软填充表；这不是缺陷，而是产品特性。
- 用户只需要维护少量名称和固定时间，复杂数据由系统内部逐步学习。
