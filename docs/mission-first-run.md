# 第一趟｜第一个可直接游玩的 directed mission（W5 之后）

> 状态：**实现 + worker 自测 / 预检完成，制作人独立验收待做；未合并、未部署。**
> 基线：`origin/main` `e3867cf`（W5，W4 四件工具与 W5 拍照/存档已合入）。
> 分支：`agent/first-run-mission-a3021fd18c42`（PR 见任务回执；不自动合并/部署）。
> 依赖：W4 试炼区（2 m 沟、侧翻坡、撞击墩、维修包）、W3 起手锚点/绞盘、W5 拍照与木屋检查点、W5 存档 v1。

## 1. 这趟任务是什么

从木屋旁的出生点出发，按右上角任务卡跑完 5 个目标，最后回到木屋检查点完成并保存。目标严格按顺序推进；完成页显示本趟用时、山脊照片和最佳成绩，可「再跑一趟」或「自由驾驶」。

| # | 目标 id | 任务卡标题 | 完成条件（触发区） | 关键操作 |
|---|---|---|---|---|
| 1 | `cross-ditch` | 跨过 2 m 沟 | 在 W4 沟边放下木板，并把车开到东岸（x 34.7–44，z 12–38） | 停进黄框 → `2` 选木板 → `G` 架桥 → 低速过沟 |
| 2 | `recover` | 侧翻后翻正，或撞伤后修好 | W4 试炼区内完成 **千斤顶翻正** 或 **维修包修理**（x 35–72，z 8–42） | 上单侧侧翻坡 → 按住 `J` 3 s；或低速撞墩 → `4` 选维修包 → 停稳按住 `G` 2 s |
| 3 | `winch` | 用绞盘把自己拉出来 | 在起手锚点 12 m 内或 W3 试炼 16 m 内，**真正收绳移动 ≥ 1.2 m**（收绳中累计位移） | `1` 选绞盘 → `G` 挂锚点 → 按住 `F` 收绳 → `G` 松绳 |
| 4 | `photo` | 在山脊观景点拍一张 | 在山脊观景点 10 m 内按 `P` 进拍照并 `Space` 快门 | `P` → `Space`（可选 FOV/曝光/滤镜）→ `P` 退出 |
| 5 | `return` | 开回木屋检查点 | 进入木屋检查点半径 5.5 m（x≈-9.6，z≈4.2） | 直接开回木屋，自动完成 |

- 任务计时从点击「开始第一趟」/按 `Enter`/第一次驾驶输入开始。
- 目标 2 是**二选一**：千斤顶翻正或维修，不要求两个都做。
- 目标 3 主路径用出生点旁的「起手锚点（练习）」；北边 W3 湿泥试炼（x≈50 / z≈148）也接受，但主验收路径不走 W3。
- 任务卡上的「重开」、完成页「再跑一趟」都会回到起点（0,0）、车况 100、木板/维修包回到初始数量，任务从目标 1 重新计时；最佳成绩保留。

## 2. 路线（世界坐标：x 东、z 北）

```
木屋 / 出生点 (0,0)
   │  向东出闸，沿 W4 黄线/虚线
   ▼
W4 停车框 (28.6, 24.1) ── 2 选木板 + G 架桥 ──▶ 2 m 沟东岸 (36.2, 24.3)
   │
   ▼
侧翻坡入口 (45.5, 24.5) ── 左轮上坡 ──▶ 侧翻点 (53.5, 23.8) ── 按住 J 3 s
   │
   │  R 回起点（普通复位键，任务进度不丢；也可以原路倒回）
   ▼
起手锚点 (3.5, 9) ◀── 1 选绞盘 + G 挂钩 + 按住 F 收绳 ≥ 1.2 m + G 松绳
   │
   ▼
沿缓坡向北 (5, 40) ──▶ 山脊观景点 (7, 61) ── P + Space 拍照
   │
   ▼
南侧下坡 (7, 95) → 山西侧 (-15, 95) → 沿西侧向南 (-15, 15) → 木屋检查点 (-9.6, 4.2)
```

- 2 m 沟停框：x 27.7–29.7、z≈24.1；木板中心落在 x≈33 的沟中心。
- 侧翻坡是既有的单侧坡（x 46.5–53.5，z≈24.4–26.0），不需要新几何。
- 山脊观景点是 W5 既有 POI（x=7，z=61，y≈3.63）；木屋检查点与 W5 一致。
- 回程走山脊南侧下坡 + 山西侧，避开北侧坡道接缝；这是实机验证过的路线。

## 3. 玩法/UI 实现

- `src/mission/firstRun.ts`：纯状态机（无 DOM/Rapier/Three 依赖）。负责 5 个目标的顺序、触发区、计时、最佳成绩、事件通知与存档快照。
- `src/ui/missionHud.ts`：介绍卡、右上任务卡（计时/当前目标/提示/5 步清单）、完成页（用时 + 照片 + 「再跑一趟 / 自由驾驶」），以及「重开」按钮。
- `src/main.ts`：把车辆位置、木板放置、千斤顶完成、维修完成、拍照快门、绞盘收绳位移接入任务；每完成一个目标自动写 W5 检查点存档。
- `src/tools/toolkit.ts`：新增 `onPlankPlaced` / `onJackDone` / `onRepairDone` 钩子和 `resetRun()`（仅任务重开使用，不改变 `R` 的原有行为）。
- `src/ui/photoMode.ts`：新增 `onCapture` 回调，把快门生成的 PNG data URL 交给任务完成页；不改变原有下载行为。
- `src/core/saveGame.ts`：`SaveData` 增加**可选** `mission` 字段；版本仍为 1，旧 W5 存档可正常加载（缺字段视为无任务）。
- `index.html` / `src/style.css`：任务卡、介绍页、完成页、移动端排布；没有引入新美术资产，沿用现有颜色/字体。
- **没有移动/修改 W1–W5 的坐标、坡度、水面、岩石、锚点或既有工具行为。** 任务只读取既有地形与地标，不新增/修改地形几何；`src/terrain/testTrack.ts` 保持原样。

## 4. 存档/检查点整合

- 任务进度随 W5 检查点写入同一份 localStorage 存档：
  - 每次目标完成、任务开始/重开、任务完成都会触发一次检查点保存；
  - 原有的木屋检查点/发现 POI 保存也会带上当前任务状态。
- 存档中的任务字段：`{ id, status, objectiveIndex, elapsedMs, bestMs }`；`status` 为 `active` 或 `complete`，目标顺序由 `objectiveIndex` 恢复，避免出现乱序完成。
- 刷新/强退后：车辆回到木屋检查点（W5 语义），任务从当前目标继续；HUD 顶部提示「继续第一趟 · 目标 N/5」。
- 完成后刷新：任务卡显示「第一趟完成 · 最佳 mm:ss」，点「重开」可再跑；完成页的照片只在当次运行内存中保留，不写入存档（避免数 MB PNG 撑爆 localStorage）。
- 自动化验证：先写 W5 检查点，再 reload，`mission.objectiveIndex` 从存档恢复；完成态 reload 后点「重开」回到起点、车况 100、plank 2 / repair 1。见 §6.3。

## 5. 从 fresh load 的真实键盘路径（无 `car.place` / 无 debug teleport）

测试环境：macOS 26 + Chrome 156 headless（`--use-angle=metal` GPU），1280×720；`npm run verify:mission`（Vite preview + Playwright 真实键盘事件）。

| # | 输入 | 实测结果 |
|---|---|---|
| 0 | 打开 `/?fresh=1`，等待加载 | 任务介绍卡可见；点「开始第一趟」或按 Enter 开始；直接按 WASD 也会自动开始 |
| 1 | 开车向东到 W4 黄框：W/点踩，A/D 修正，停进 x≈28.6/z≈24.1 | 停在 **x=27.74，z=24.06，v≈0.1，health 100，planks 3**（路上拾取 1） |
| 2 | `2` → `G` | 木板 3→2；任务目标 1 待过沟 |
| 3 | 低速开过 2 m 沟，到 x≈36.2/z≈24.3 | **x=35.25，z=24.18，health 100，planks 2，idx=1**；检查点存档 `mission.objectiveIndex=1` |
| 4 | 继续向东到侧翻坡，上坡 | 在 **x≈53.5，z≈23.8** 侧翻（up.y≈0.32）；落稳后 health≈65.9 |
| 5 | 按住 `J` 3.4 s | 车翻正（up.y=1）；**idx=2**；HUD「完成目标 2/5：练一次脱困」 |
| 6 | 按 `R` 回起点（普通复位，任务进度保留） | **x=0.04，z≈-0.03，idx=2**；车况/木板保留 |
| 7 | `1` → `G` 挂起手锚点 → 按住 `F` 1.2 m → `G` 松绳 | 自动选中 `spawn-tree`；收绳到 **x≈0.76，z≈2.99**，位移 ≥1.2 m；**idx=3**；HUD「完成目标 3/5：绞盘自救」 |
| 8 | 沿缓坡向北到山脊观景点，停在 x≈6.9/z≈59.5 | POI「山脊观景点」；**idx=3（拍照目标）** |
| 9 | `P` → `Space` → `P` | `photo.isActive=true`；拍照后 **idx=4**；HUD「完成目标 4/5：山脊拍照」；1280×720 PNG 已生成 |
| 10 | 南侧下坡 → 山西侧 → 木屋北侧，停 x≈-9.9/z≈9.1 | 进入木屋检查点；**idx=5，status=complete**；health≈65.9 |
| 11 | 观察完成页 | 完成页可见；用时 **01:43**；山脊照片缩略图可见；存档 `mission.status=complete` |
| 12 | 点「再跑一趟」/「重开」 | 回到 x≈0/z≈0，车况 100，planks 2，repair 1，idx=0，计时归零 |

> `R` 是游戏内既有复位键（README 控制表），不是 `car.place`/`teleport`/调试命令；主验收路径只用了一次 `R`（目标 2→3 回起点）。也可以从侧翻坡原路开回，但没有作为验收路径。

脚本输出（最终 build `index-BTIP9LkL.js`）：

```json
{
  "mission": {
    "idx": 5,
    "status": "complete",
    "planks": 2,
    "health": 65.88994921875
  },
  "save": {
    "id": "first-run",
    "status": "complete",
    "objectiveIndex": 5,
    "elapsedMs": 103377,
    "bestMs": 103377
  },
  "completeVisible": true,
  "completeTime": "01:43",
  "photoVisible": true,
  "consoleErrors": []
}
```

> 01:43 是脚本按已知路线、无停车看牌的连续驾驶成绩；第一次玩的玩家需要读任务卡/找路/试工具，预计 10–20 分钟。这个体感区间尚未由人工计时确认，列在待验收项。

### 截图（均为最终 build `BTIP9LkL`，1280×720，GPU Chrome）

| 截图 | 内容 |
|---|---|
| ![intro](images/first-run-intro.png) | fresh load 的任务介绍卡「开始第一趟」 |
| ![plank](images/first-run-plank.png) | 黄框内架好木板，任务卡目标 1/5 |
| ![rollover](images/first-run-rollover.png) | 侧翻坡上翻车（health 67，目标 2/5） |
| ![recovered](images/first-run-recovered.png) | `J` 3 s 翻正，完成目标 2/5 |
| ![winched](images/first-run-winched.png) | 起手锚点收绳，完成目标 3/5，提示 `G` 松绳 |
| ![ridge](images/first-run-ridge.png) | 山脊观景点，目标 4/5 等待拍照 |
| ![photo](images/first-run-photo.png) | 拍照模式快门，HUD 隐藏，照片已保存 |
| ![complete](images/first-run-complete.png) | 完成页：01:43 + 山脊照片 + 再跑一趟 |
| ![resume](images/first-run-resume.png) | 刷新后从木屋检查点继续目标 3/5 |

## 6. 测试与命令

### 6.1 单元测试（`npm test`）

- 新增 `src/mission/firstRun.test.ts`（11 项）：
  - 5 个目标顺序与 initial idle；
  - 没有木板/在错误河岸不能完成过沟；
  - 提前按千斤顶/维修/绞盘/拍照不会越级；
  - 千斤顶与维修二选一、W3 试炼或练习锚点两种绞盘地点；
  - 拍照后回木屋才完成；计时/最佳成绩；
  - restart 保留 best、清空本轮进度；
  - 存档恢复（active/complete、非法/异任务快照、目标索引钳制）；
  - `formatRunTime` 与全部触发区边界。
- 新增 `src/core/saveGame.test.ts` 3 项：mission 字段 round-trip、非法 mission 字段清洗/丢弃、旧存档（无 mission 字段）仍可加载。
- 既有测试全部保留。

实际结果：

```
npm run typecheck  → 通过
npm test           → 15 files / 102 tests 通过
npm run build      → 通过
dist/assets/index-BTIP9LkL.js
dist/assets/index-FhVE_owq.css
```

### 6.2 真实键盘验收脚本

```
npm run verify:mission
```

- 启动 `vite preview`（127.0.0.1:4177），打开 `?fresh=1`，Chrome GPU；
- 只用真实 `keyboard.down/up/press` 与 UI 点击，不调用 `car.place`、`teleport`、任务调试接口；
- 目标 1 完成后断言检查点存档 `mission.objectiveIndex=1`；完成时断言 `status=complete`、完成页/照片可见、console error 0；
- 失败时进程非 0；截图写入 `docs/images/first-run-*.png`。

### 6.3 存档/重开补测

另一条浏览器检查（同一 build，非主路径）通过任务 API 推进到目标 2 → `saveNow()` → reload：

```
after reload: car (-9.59, 4.17) · mission active/idx2 · HUD「目标 3/5 · 用绞盘把自己拉出来」
save: {id:'first-run', status:'active', objectiveIndex:2, elapsedMs:612, bestMs:null}
complete → save complete/idx5 → reload → 任务卡「第一趟完成 · 最佳 00:02」
点「重开」→ car (0.03,-0.03) · health 100 · plank 2 · repair 1 · active/idx0 · 计时归零
```

（这条补测使用 `mission` 公开方法快速推进，用于验证存档/恢复/重开接线；玩家路径的完整性由 §5 的真实键盘脚本覆盖。）

## 7. 已知限制 / 待验收

- **制作人独立验收未做**：本文件是 worker 自测/预检，不代替制作人从 fresh load 独立走查；未合并、未部署、不自动合并。
- **人类 10–20 分钟尚未实测**：脚本连续驾驶 01:43；第一次玩预计 10–20 分钟，但需要人工计时确认。主观节奏/任务卡可读性/完成页观感待人工验收。
- **回程用了普通 `R` 复位**：目标 2→3 的回起点使用 `R`（README 既有控制，不是调试传送）。也可以原路驾驶回起点，但没有作为验收路径；若制作人要求纯连续驾驶，需要再补一条无 `R` 的回程证据。
- **W3 试炼的出口**：任务接受 W3 湿泥试炼作为绞盘地点；但实测从试炼坡收绳后车可能停在 35° 坡上，继续开去山脊前需要倒车/复位。主路径因此使用出生点练习锚点；W3 只作为可选教学点。
- **照片时段**：任务不锁定时间；按 24 分钟一游戏日，慢玩到山脊可能偏黄昏/夜晚，完成页照片会更暗。截图是在 16:00 出发的白天路径。
- **照片只存在当次运行**：完成页照片不写入 localStorage（体积原因）；刷新后完成页不再有照片。
- **没做手机触屏验收**：任务卡/完成页有移动端布局，但本轮只验证了 1280×720 桌面键盘路径。
