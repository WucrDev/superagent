# W3 绞盘验收自测（锚点、绳索、张力、失败态）

- 日期：2026-11-04
- 构建：W3 绞盘 PR HEAD（单键交互 + 倒挡修复版；基于 `main` 8e18123）
- 测试环境：macOS + Chrome 156 headless（SwiftShader，1280×720）；物理为 Rapier，固定步长 60 Hz
- 线上 build：<https://game.xiaoannurse.art/>（线上为 `index-6oAXVZPm.js`；单键交互与合并后的倒挡尚未部署，headless 验证使用本地 `npm run preview` 的 build）
- 自测命令：`npm ci`、`npm run typecheck`、`npm test`（49 tests）、`npm run build`
- 交付状态：**PR #43 为可审状态（前一轮设置；本轮 agent 未改 PR 状态、未合并、未部署）**。单键交互修复已完成自测；独立验收待安排，通过后才可合并。
- 结论：**实现与客观自测通过；制作人验收未通过；单键交互与倒挡已通过 headless 预检，主观手感、操作可懂度、飞书焦点/输入法、硬件手柄震动、盲测视频仍待人工/独立验收**。失败态中“拉不动/绳断”的截图使用固定车身做故障注入，原因见“已知限制”。

## 验收对照

| W3 任务 | 验收标准 | 结果 | 证据 |
|---|---|---|---|
| #16 锚点检测与评分 | 12 m / 60° 锥体射线；可挂类型表；评分公式；遮挡剔除；高亮 | 10 个锚点：树干 ×7（含起手练习锚点与跨水树）、大岩石、木桩（弱实例）、细灌木；可挂类型表在 `anchorTypes.ts`；评分按 §3.2；射线遮挡 + 红色低分高亮；瞄准时菱形标记与底座环 | `npm test` 的 `winchMath` 13 项；`docs/images/w3-aim.png` |
| #16 两个反例 | 近锚拽车头、跨水横拖 | 跨水：车从 (69,153) 被拖到 (72.0,159.2)，进水 0.24；近/偏角：灌木 2.7 m/70°、岩石 5.7 m/76° 手动可选、评分 0 显示红色 | `w3-cross-water.png`；截图 `w3-aim.png` 的红色点 |
| #17 绳索物理与收绳 | 16 段 PBD、4 次迭代；刚度 0.6、阻尼 0.15、最大伸长 8%；收绳 0.8–2.0 m/s；松绳与断开 | 16 段 PBD 实现；端点拉伸计算张力；收绳随负载 2.0→0.8 m/s；松开 F 自动放绳变松；断绳后绳体落地 | `rope.test.ts` 5 项；`winch.test.ts` 泥坡脱困 |
| #17 8 m 外的树拉出泥坑 ≤6 s | 收绳把车拖出泥坑 | 35° 湿泥坡试验：1.95 s 从坡底到坡顶；实机（1280×720 headless）从 z=147 拉到 z=154.8 | `winch.test.ts` 输出 `wet-mud ramp escape: 1.95 s`；`w3-pull.png` |
| #18 自动/手动锚与角度环 | 自动取最高分；X 手动循环 / V 回自动（无需瞄准键）；角度环 HUD（可关） | 自动选中泥坑树 A（74.3 分，10°/8.75 m）；手动 X 可选弱木桩/灌木；V 回自动；H 开关张力条 + 角度环，默认关 | 实测候选表见下；`w3-aim.png`；`winchMath.test.ts` 选择测试 |
| #19 张力模型与视听反馈 | 需求拉力 vs 实际拉力；打滑粒子/拉痕；电机三段音；手柄震动 | 弹簧 + 速度阻尼张力；实机收绳 11.8 kN（0.53 上限）；打滑时轮胎拉痕与泥屑；HUD/提示区分“收绳中 / 拉不动 / 轮胎打滑 / 即将断绳 / 绳断了”；电机三档与断绳/断锚合成音；手柄双马达震动代码 | `w3-pull.png`、`w3-stall.png`、`w3-cross-water.png`、`w3-rope-break.png` |
| #19 三种状态可区分 | 拉不动 / 打滑 / 断绳，仅凭视听可区分 | HUD 文字 + 张力条颜色 + 绳色变白 + 轮胎粒子/拉痕 + 合成音；主观可读性待人工 | 同上；音频需人工听 |
| #20 断绳 | 超限 1.2 s 断绳 + 0.8 m 回弹；可立即重挂 | 集成测试在超限后 1.42 s 断绳（含张力爬升），回弹 0.9 m/s，0.8 s 冷却后可重挂；实机 HUD“绳断了” | `winch.test.ts` 输出 `rope snap after 1.42 s`；`w3-rope-break.png` |
| #20 锚点脱落 | 强度 < 需求 1.5 s；树断/石滚；车下滑 | 弱木桩（20 强度实例）在张力 21.7 kN 时脱落，HUD“锚点脱落：木桩断了”，车继续下滑；阈值与计时单元测试 | `w3-anchor-fail.png`；`winchMath.test.ts` |
| #20 挂错（灌木） | 0.5 s 内脱落 + 提示 | 挂上后 0.82 s 脱落（0.3 s 挂钩 + 0.5 s 滑脱），提示“挂不住：灌木太细” | `winch.test.ts` 输出 `bush hook dropped after 0.82 s`；`w3-bush-slip.png` |
| #20 侧翻 | 可千斤顶/翻正恢复 | 侧翻检测 `up.y < 0.35`；按住 J 10 s 翻正；实测 up.y 0.12 → 0.95 | `w3-rolled.png`、`w3-righted.png` |

## 试玩反馈修复（2026-11-04）

> 第 1–4 次反馈记录的是历史 build 的修复过程；**当前交互以「第五次反馈」为准**：G 直接挂钩，按住 F 收绳，再按 G 松绳，不再需要按住 F 瞄准。

### 第一次反馈：出生点按 F/G 没反应

**根因**：绞盘只在 12 m 内存在锚点时才进入可用状态；出生点附近没有锚点，F 只显示“无可用锚点”，G 没有目标。不是按键监听失效。

**修复**：出生点前方 7.8 m 加“起手锚点（练习）”（x=3.5 / z=9）；顶部 12 s 教程条 + 世界内标牌“起手绞盘 F/G”；首次按 F 隐藏教程。实测按 F 选中起手锚点（评分 43），G 挂钩，按住 F 把车从 (0,0) 拉到约 (1.7–2.0, 7.0)；截图 `w3-spawn.png`、`w3-spawn-pull.png`。

### 第二次反馈：“我当时已经离锚点非常近了”

用户截图确认在 **W3 build**（左上角 W3 徽标）里、车停在深水区、旁边就是锚点 C，但按 F 仍显示“12 m / 60° 内没有可选锚点”。复核定位：

- 旧锚点 C 在 (11,210)，用户停点约 (0,200)；钩点距离 **13.5 m**，刚好超出 12 m 自动范围，所以候选为空。
- 就算在 12 m 内、角度超出 60°（例如 (5,205)：1.9 m、132°），旧提示也只写“没有可选锚点”，没有告诉玩家要按 X 手动选。
- 这不是按键监听问题，是**锚点摆位 + 提示信息**的问题。

**修复**：

1. 锚点 C 从 (11,210) 挪到 (4,206)：从用户停点 (0,200) 的钩点距离约 5.6 m、角度约 45°，自动可选。
2. 无自动目标时提示具体原因：最近锚点距离（“再靠近到 12 m 内”）、超 60°（“按 X 手动选”）、遮挡、灌木。
3. 教程条补上 X 换锚。

**修复前后（同一 `car.place(0,200,0)`、1280×720、按住 F；Before 为 b0c643d，After 为 `index-Hlx6nnhi.js`）**：

Before（旧锚点 C 13.5 m，候选为空）：![anchor C before](images/w3-anchor-c-before.png)
After（锚点 C 5.6 m 自动选中）：![anchor C after](images/w3-anchor-c-after.png)

同位置按 G 挂钩后按住 F，车从 (0,200) 被拉到 (2.1,204.4)，状态“轮胎打滑”。

近距离但角度超出 60° 时的提示：![anchor C hint](images/w3-anchor-c-hint.png)

线上 `index-Hlx6nnhi.js` 已验证：(0,200) 选中锚点 C、G 挂钩、F 拉动；(5,205) 提示“锚点在 1.9 m、132° · 按 X 手动选”；无 console error。旧页面若仍显示 W2 徽标需强刷；W3 徽标下若仍有异常，请告诉具体停点和朝向。

### 第三次反馈：“按什么键都不行，水雾也不会停止”

用户截图确认在 W3 build 里，车停在深水、锚点 C 前，画面没有绞盘提示，白雾持续。复核后是两个独立问题：

1. **白雾不是卡死**：车在 80 cm 深水区，发动机进水会持续冒白烟，驶离水面后 10 s 恢复；它是 W2 的进水反馈，不是渲染或游戏循环卡死。
2. **键盘事件没有到达游戏**：切到飞书/其他窗口后页面 `blur`，按键全部清空；飞书内置 webview、后台标签或未点过的 iframe 也会让 keydown 进不到页面，但渲染继续（所以白雾还在动）。修复：
   - 启动/失焦时显示“点击画面继续”焦点卡；点击后隐藏。
   - canvas 加 `tabIndex` 并在 pointerdown 时 `focus()`，让嵌入 webview 的键盘目标明确。
   - HUD 深水提示：“深水 80 cm · 动力 -40% · 尽快驶出（进水后 10 s 恢复）”。
   - 复测：点一下画面（焦点卡消失）→ WASD 应能开、F/G 应能瞄准；手机/平板没有物理键盘，请用电脑 Chrome/Safari 或接手柄。

Before（旧版出生点，无焦点卡）：![focus before](images/w3-spawn.png)
After（`index-BVFkGArs.js`，启动即显示焦点卡）：![focus after](images/w3-focus.png)

Before（旧版深水，无 HUD 提示）：![water before](images/w3-anchor-c-after.png)
After（深水提示 + 锚点 C）：![water after](images/w3-water-hint.png)

**S 刹车/倒挡**：S 刹车实测有效（14.1 → 1.7 km/h）；停住后继续按住 S 进入倒挡，HUD 显示 R，倒挡限速约 12 km/h；深水 (0,200) 实测倒出到 z=189.1，松开 S 回 L。该倒挡按 owner 要求在同一 PR 补齐（自动倒挡；W1 原 L/H 变速箱未新增物理档位）。

线上 `index-BVFkGArs.js` 已验证：焦点卡可见、点击隐藏、失焦重现；深水提示出现；锚点 C 可选中；无 console error。

### 第四次：G 按了还算没挂钩 / 操作是否被验收

用户按 G 后截图仍是“瞄准”提示（旧文案写的是“F 收绳 · G 挂钩”，没说明要先按住 F，也没显示挂钩中），并质疑这个操作是否经过制作人验收。**答案：没有验收过**；制作人自检只跑通了状态机，没有验证这组操作是否好懂，W3 门禁未通过。

修复：

- 瞄准提示：`按住 F 瞄准 · G 挂钩 · X 换锚 · V 自动`（不再写“F 收绳”）。
- 按 G 后 0.3 s 内显示 `挂钩中…（约 0.3 s）`，随后 `已挂钩 · 继续按住 F 收绳 · G 松绳 · H 张力条`；打滑时追加“轮胎打滑”。
- 完整 HUD、帮助和教程同步为“按住 F 瞄准/收绳”。
- 当时的流程（已被第五次反馈取代）：**按住 F 瞄准 → 轻按 G → 等约 0.3 s → 继续按住 F 收绳；按 G 松绳**。

Before（旧文案“F 收绳”，尚未挂钩）：![prompt before](images/w3-prompt-before.png)
After 瞄准：![prompt aim](images/w3-prompt-aim.png)
After 挂钩中：![prompt attaching](images/w3-prompt-attaching.png)
After 已挂钩：![prompt attached](images/w3-prompt-attached.png)

线上 `index-WZcO526t.js` 已验证：瞄准/挂钩中/已挂钩三段提示正确，真实挂上 `spawn-tree`，无 console error。**若修完提示后仍觉得三键流程本身别扭，是否简化成“G 直接挂最近锚点”或单键流程，需要 owner 拍板。**（已由第五次反馈采纳：G 直接挂钩。）

### 第五次反馈：按住 F 再按 G 不合理，改成 G 直接挂钩（2026-11-04）

**反馈**：owner 认为“按住 F 瞄准，再按 G 挂钩”不合理；按 G 后提示仍停在“G 挂钩”，看不出是否挂上，也没有清楚的绳/张力反馈；切到飞书后所有按键失效（焦点/输入法）。

**改动**：

- 删除 F 瞄准状态：无绳时常驻 Ready，自动选择前方 60° 内评分最高的锚点，提示 `G 挂钩 · <锚点>`。
- G 直接挂钩/松绳；挂上后按住 F 收绳；X 手动循环，V 回自动。只有一套操作，没有第二套瞄准键。
- 已挂钩提示改为 `已挂钩 · G 松绳 · 按住 F 收绳 · <锚点> · 张力 63%`，低张力显示“绳松”；绳、锚点高亮、车身下沉与张力条（H）保持原反馈。
- 无锚时按原因提示：超 12 m / 超 60°（按 X）/ 遮挡 / 灌木 / 超过 10 m 绳长。
- 帮助和焦点卡补“按键没反应？点一下游戏画面，并把输入法切到英文”。
- 物理、张力、断绳、锚点脱落、灌木滑脱、侧翻行为未改。

**验证**：

- `npm run typecheck` 通过。
- `npm test`：45 tests 通过（新增 3 项：G 单击挂钩、F 收绳 + G 松绳、60° 外锚点用 X 选中；原有绞盘集成测试改为不按 F 直接 G）。
- `npm run build` 通过（`index-C_E-i2Xi.js`）。
- Chrome 156 headless（CDP，1280×720，`npm run preview` 的 build）实测：
  - 无输入：`state=ready`，自动选中“起手锚点（练习）”，提示 `G 挂钩 · 起手锚点（练习） · X 换锚`。
  - 单按 G（不按 F）：`state=attached`，提示 `已挂钩 · G 松绳 · 按住 F 收绳 · 起手锚点（练习） · 绳松`。
  - 按住 F 1.1 s：`reeling=true`，张力 13.8 kN（load 63%），提示带 `张力 63%`。
  - 再按 G：`state=ready`，提示 `已松绳 · 0.7 s 后可再挂`；0.8 s 后恢复自动选锚。
  - 远离锚点：提示 `无可用锚点 · 最近锚点 起手锚点（练习） 23.3 m · 再靠近到 12 m 内`。
  - console error 0。

单按 G 后已挂钩（`已挂钩 · G 松绳 · 按住 F 收绳 · 起手锚点（练习） · 绳松`，可见绳与锚点标记）：![direct hook](images/w3-direct-hook.png)
无锚点时的具体提示：![no anchor hint](images/w3-no-anchor-hint.png)

**仍待人工/独立验收**：飞书内嵌 webview 的键盘焦点和中文输入法行为无法在 headless 复现；单键交互的可懂度、手感与“挂上没有”的主观确认仍需制作人独立试玩。

### 倒挡补充（owner 追加，2026-11-04）

**需求**：缺少倒挡。静止时按住 S 进入 R，HUD 档位显示 R；行驶中 S 仍是刹车；倒车限速 10–15 km/h；L/H 不变。

**实现**：

- 输入不变：S 仍是 `brake`。车速 ≤ 0.6 m/s 且持续按住 S 0.45 s 后接合 `R`；W/油门、Q/E 换挡、松开 S 立即退出 R。
- 倒挡使用反向驱动力，目标上限 12 km/h（`REVERSE_MAX_SPEED`），下坡有轻微 governor（实测坡道短时约 14 km/h，仍在 10–15 区间）；R 状态下不再施加刹车力（S 变成倒车油门）。
- HUD 档位增加 `R`；README 操作表、游戏内帮助、W1 验收补倒挡说明。
- 前进 L/H 的换挡逻辑、扭矩与限速未改。

**验证**：

- `npm test`：49 tests 通过。新增/更新：
  - `RaycastVehicle > brakes with S while rolling forward and does not engage R`
  - `RaycastVehicle > engages R when S is held at a standstill and caps reverse speed`
  - `HUD gear display > shows R for reverse and keeps the forward gear labels`
  - `surface feel` 的制动距离改为“停稳即停测”，避免继续按住 S 后倒车污染旧数据；四种材质阈值仍通过。
- `npm run typecheck` 通过；`npm run build` 通过（`index-DhGBd8AF.js`）。
- Chrome 156 headless（CDP，本地 `npm run preview` 的 build）实测：
  - 静止按住 S：`gear=R`，HUD `#gear` 文本为 `R`；0.8 s 倒车约 5–6 km/h。
  - 行驶中（约 25.8 km/h）按 S 0.35 s：仍为 `L`，速度降到约 12.2 km/h，未进入 R。
  - 继续按住 S：接合 R；平路 2.5 s 约 12 km/h，坡道约 14.3 km/h（≤15）。
  - 松开 S：立即回到 `L`，倒车惯性保留后自然衰减。
  - console error 0。

静止按住 S，HUD 档位显示 `R`、速度约 12 km/h：![reverse R](images/w3-reverse-r.png)

**仍待人工/独立验收**：倒挡手感（接合时机、倒车速度、坡道倒车）与飞书焦点/输入法仍需制作人独立试玩；本 agent 未部署、未改 PR 状态。

说明：断绳/拉不动的实机截图仍需固定车身做故障注入（当前地形自然持续陷车不足）；S 倒挡已在本轮补上，见上文「倒挡补充」。

## 最终自测（线上 `index-6oAXVZPm.js`，2026-11-04）

> 本节记录的是**单键交互修复前**的上一版 build（仍需按住 F 瞄准）；当前交互见上文「第五次反馈」。表中倒挡行为来自上一版自动倒挡（限速 15 km/h），合并后的统一实现见「倒挡补充」。

同一 Chrome 156 headless、1280×720、线上 build；按制作人清单实际试玩：

| 项 | 实际结果 | 截图 |
|---|---|---|
| 起手锚点全流程 | 按住 F：提示“按住 F 瞄准 · G 挂钩 …（评分 88）”；按 G：先“挂钩中…（约 0.3 s）”，再“已挂钩 · 继续按住 F 收绳 · G 松绳”；继续按住 F：车 z≈2→6，状态“轮胎打滑” | `w3-final-practice.png` |
| 朽木桩锚点脱落 | 选中弱桩并挂钩，张力过载后 `anchorFailed`，提示“锚点脱落：木桩断了” | `w3-final-stump.png` |
| 灌木滑脱 | 挂上后 0.5 s 滑脱，提示“挂不住：灌木太细” | `w3-final-bush.png` |
| 断绳 | 固定车身故障注入超限，1.2 s 后 `broken`，提示“绳断了：张力超过上限 1.2 s” | `w3-final-rope.png` |
| 侧翻/翻正 | 侧翻提示“侧翻 · 按住 J 翻正（10 s）”；按住 J 后恢复直立 | `w3-final-rolled.png` / `w3-final-righted.png` |
| 深水 | 车在 80 cm 深水，HUD“深水 80 cm · 动力 -40% · 尽快驶出（进水后 10 s 恢复）” | `w3-final-water.png` |
| S 刹车/倒挡 | 14.1 → 1.7 km/h 刹停；继续按住 S 显示 R 并后退（z 153.0→150.4）；深水 (0,200) 倒出到 z=189.1；松开 S 回 L | `w3-final-reverse.png` / `w3-final-reverse-water.png` |
| 跨水 | 车被拖到 (72.0,159.2)，锚点 C/跨水流程正常 | `w3-final-stream.png` |
| 控制台 | 无 console error | — |

说明：断绳/拉不动的实机截图仍需固定车身做故障注入；S 倒挡已补（自动倒挡，限速 15 km/h）。

## 实机候选与张力（当前 PR）

`__superagent.car.place(50, 147, 0)`、无需按键即可自动选锚、打开 H：

| 锚点 | 类型 | 分数 | 角度 | 距离 | 自动可选 | 备注 |
|---|---|---|---:|---:|---|---|
| 泥坑树 A | 树干 | 74.3 | 10.0° | 8.75 m | 是 | 自动选择的稳定锚 |
| 泥坑树 B | 树干 | 59.0 | 17.8° | 8.53 m | 是 | 角度更大、分数更低 |
| 朽木桩 | 木桩弱实例 | 35.5 | 21.4° | 9.67 m | 是 | 强度 20，会断 |
| 细灌木 | 灌木 | 0 | 70.3° | 2.66 m | 否 | 手动可挂，0.5 s 脱落 |
| 大岩石 | 岩石 | 0 | 75.9° | 5.72 m | 是 | 低分红色，手动可选 |

- 收绳 1.2 s（实机 wall clock）：张力 11.8 kN，load 0.53，车从坡底开始爬。
- 继续收绳：车到 (51.6, 2.16, 154.8)，张力降到 32 N（接近锚点、绳松）。
- 跨水：车 (69,153) → (72.0,159.2)，水 ingress 0.24，状态“收绳中/轮胎打滑”。
- 弱木桩：张力约 21.7 kN 持续到 1.5 s 计时后脱落，锚点 `failed`，车到 (52.4,1.84,153.8)。

## 复现步骤

1. `npm ci && npm run dev`，打开 `http://127.0.0.1:5173/`。
2. 控制：`G` 挂钩/松绳（无绳时自动显示最佳锚点）；按住 `F` 收绳；`X` 切换手动锚；`V` 回自动；`S` 刹车，停稳后继续按住进入倒挡 `R`（≤12 km/h）；`J` 翻正；`H` 开关张力条 + 角度环；`R` 复位。按键没反应时先点一下画面，并把输入法切到英文。
3. 浏览器控制台：
   - 绞盘试炼：`__superagent.car.place(50, 147, 0)`，等自动选锚后直接按 G；按住 F 收绳。
   - 弱木桩：`__superagent.winch.selectAnchor('pad-stump')`，按 G；约 1.5 s 后断。
   - 灌木：`__superagent.winch.selectAnchor('pad-bush')`，按 G。
   - 跨水：`__superagent.car.place(69, 153, 0.44)`，`__superagent.winch.selectAnchor('stream-tree')`，按 G；按住 F 收绳。
   - 侧翻：`__superagent.car.rigidBody.setRotation({x:0,y:0,z:0.7071,w:0.7071}, true)`，按住 J 10 s。
   - 断绳/拉不动的故障注入：挂上后 `__superagent.car.rigidBody.setBodyType(1, true)`（固定车身）再按住 F；用完 `setBodyType(0, true)` 恢复。
4. 单元/集成：`npx vitest run src/tools/winchMath.test.ts src/tools/rope.test.ts src/tools/winch.test.ts src/vehicle/raycastVehicle.test.ts src/ui/hud.test.ts`。

## 截图

### Before / After（同一 1280×720、同一第三人称相机）

Before：`main` 8e18123（W2，无 W3 地形/绞盘 HUD）。

Before 出生点：![W3 before spawn](images/w3-before-spawn.png)
After 出生点（本 PR HEAD，HUD 默认不显示绞盘面板；显示 12 s 教程条与起手练习锚点）：![W3 after spawn](images/w3-spawn.png)
出生点按 F/G 后（起手锚点已把车拉动）：![W3 spawn pull](images/w3-spawn-pull.png)

Before 绞盘试炼位置（同一 `car.place(50,147,0)`，此时为空地）：![W3 before pad](images/w3-before-pad.png)
After 同一位置的瞄准状态（H 打开张力条 + 角度环）：![W3 aim](images/w3-aim.png)

> W2 基线没有绞盘、W3 测试地形和绞盘 HUD，因此绞盘交互本身不存在“Before 同状态”截图；上面对比的是同一位置、同一相机、同一视口的基线缺失状态。绞盘专用状态（收绳、打滑、断绳等）只能提供 After。

### After：绞盘交互与失败态

收绳起步（湿泥打滑、绳绷紧、张力条、角度环）：![W3 pull](images/w3-pull.png)
拉不动（固定车身故障注入，HUD“拉不动” + 即将断绳提示）：![W3 stall](images/w3-stall.png)
跨水横拖（车已进入水面）：![W3 cross water](images/w3-cross-water.png)
绳断了（超限 1.2 s）：![W3 rope break](images/w3-rope-break.png)
锚点脱落（朽木桩）：![W3 anchor fail](images/w3-anchor-fail.png)
挂错灌木（0.5 s 滑脱）：![W3 bush slip](images/w3-bush-slip.png)
侧翻：![W3 rolled](images/w3-rolled.png)
翻正后：![W3 righted](images/w3-righted.png)

## 已知限制 / 待人工验收

- **“拉不动/绳断”实机截图使用固定车身**：当前灰盒地形里车会被 22 kN 绞盘拉动，自然出现持续“拉不动”需要更深的陷车地形；因此这两张失败态截图用固定车身做故障注入。逻辑、阈值与计时由 `winch.test.ts` 验证；这是地形内容缺口，不是状态机缺口。
- **弱木桩是刻意弱实例（强度 20）**：设计表里木桩/电线杆强度为 60；为让“锚点脱落”可教学，W3 试炼场放了一个强度 20 的朽木桩实例，正常 60 强度木桩在当前坡道不一定断。
- 设计文档 3.3 的“正前方 2 m、角度 80°”与“35° 坡正对/偏 20°”没有逐字复现：试炼场用 10°/17.8° 两棵树和 70°/76° 的灌木/岩石做角度差异；W2 的 35° 泥坡仍在原地。跨水反例已复现。
- **联机/拖车**（设计 §8）不在 W3 单机范围；`vehicle` 锚点类型留在表里，未放实例。
- 音频是合成音，未做混音；手柄震动代码已写，但当前环境没有手柄硬件，**待人工用手柄验收**。
- 主观项（拉出瞬间“松一口气”、三种状态仅凭视听区分、30 秒盲测视频 8/10 看懂）**待人工试玩/录屏**，未代填。
- 绞盘 HUD 默认关（设计 §6 沉浸优先）；按 H 打开。测试截图为了证据打开了 H。
