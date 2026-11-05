# W5.1 调色锁定｜按 3 张目标图冻结游戏内 grade

> 状态：实现与 worker 自测完成；**制作人独立验收见 §6**；“观感对不对味”的最终判定属所有者。
> 来源：W5.1 调色锁定任务（项目所有者 2026-11-06 批准）。
> 验收标准：[`docs/sprint-w1-w6.md`](sprint-w1-w6.md) W5 #21——**与 3 张目标图的观感差距可接受，不再改风格**。
> 基线：已部署 W5 build `ePYqKx_3`（主链接）｜本页对应分支 `agent/grade-lock-a8a09b42bae0`。

## 0. 结论先说

**这次没有改 grade 参数。** 3 张目标图本身就是 W5 build 的拍摄模式截图；其中座舱目标 03 与当前固定 grade 在同一机位/时刻对齐后，均值差约 1/255 量级（逐通道 R +0.1 / G −1.3 / B −1.1，§3）。因此 W5.1 做的是**把已经对上的固定 grade 冻死**：

- `src/core/grade.ts` 新增 `LOCKED_GRADE`，它就是游戏内固定 grade，也是拍照模式滤镜 0“原片”；数组与参数全部 `Object.freeze`。
- `src/core/grade.test.ts` 锁死参数、滤镜 0 = 游戏 grade、运行时不可变、暖高光/冷阴影方向；参数值/冻结漂移会让测试失败。
- `docs/target-shots/target-03-cockpit.webp` 实际是 PNG，已改名为 `target-03-cockpit.png`，README 同步更新，避免参考图打不开。
- 证据图与可复现脚本见 §3、§4。

没有“调前/调后换风格”的视觉变化：部署版 `ePYqKx_3` 与分支在座舱同机位的整帧均值完全一致（§3.2），差异只有随时间变化的胶片颗粒。外测/自测看到的就是已批准的目标图观感。

## 1. 固定 grade 是什么

管线不变（`src/core/postfx.ts`）：

```
RenderPass → BokehPass（轻景深）→ GradePass（颗粒、暗角、对比、饱和度、冷阴影/暖高光） → OutputPass
```

固定参数（`LOCKED_GRADE`，也是拍照模式“原片”）：

| 参数 | 值 | 作用 |
|---|---|---|
| grain | 0.018 | 胶片颗粒 |
| vignette | 0.24 | 暗角 |
| saturation | 1.02 | 饱和度 |
| contrast | 1.03 | 对比 |
| lift | (-0.004, 0.002, 0.008) | 冷阴影（蓝抬升） |
| gain | (1.03, 1.0, 0.97) | 暖高光（红高、蓝低） |

拍照模式的胶片/冷调/暖调/褪色四个滤镜仍然只影响拍照，不改变游戏内 grade。

## 2. 3 张目标图与来源

| # | 目标 | 文件 | 来源/说明 |
|---|---|---|---|
| 01 | 黄昏山脊：暖高光、粉雾、低太阳 | [`docs/target-shots/target-01-dusk-ridge.png`](target-shots/target-01-dusk-ridge.png) | 与 [`docs/images/w5-photo-hero.png`](images/w5-photo-hero.png) SHA-256 相同（`5aba4adf…`），来自 W5 build 拍摄模式 |
| 02 | 夜雨无援：冷蓝/青，车灯是唯一暖光 | [`docs/target-shots/target-02-night-rain.png`](target-shots/target-02-night-rain.png) | W5 build 拍摄模式，1920×1080、无 HUD |
| 03 | 座舱：暖内饰、青仪表、低照度 | [`docs/target-shots/target-03-cockpit.png`](target-shots/target-03-cockpit.png) | 与 [`docs/images/w5-cockpit.png`](images/w5-cockpit.png) SHA-256 相同（`2fa46d76…`），来自 W5 build 拍摄模式 |

目标图不是概念图；README 已写明“从当前引擎/拍摄模式出的目标画面”。这决定了 W5.1 的正确动作是**锁定**，而不是另调一套风格。

## 3. 对照证据（1920×1080，无 HUD canvas 抓取）

### 3.1 座舱目标 03：同机位可对齐到 2–3 px

复现参数：出生点 `(0, 0)`、车头朝 +z、`17:24`、晴天、拍照模式 FOV 70、`lookPitch = -0.04`、滤镜“原片”。

- 目标图与当前 build 的构图、标牌位置、仪表/方向盘位置一致；见下方对照图。
- 中间区域：从 `(200, 200)` 起裁 1500×800；当前帧按 (-2, -3) px 平移对齐。8-bit 均值：
  - 目标 03：`[57.06, 47.08, 41.35]`
  - 当前 build：`[57.17, 45.81, 40.25]`
- 平均绝对差 **12.24 / 255 ≈ 4.8%**；逐通道有符号差（当前−目标）**R +0.11 / G −1.27 / B −1.10**，量级 ∼1/255；残差主要来自颗粒的逐帧时间噪声、约 1 帧的时间/环境采样差异和 2–3 px 的对齐误差，不是色偏。

![Target 03 vs locked build](images/w5-lock-target-03.png)

### 3.2 部署版 vs 分支：没有视觉变化

同一机位/时刻/天气/曝光，部署版 W5 build `ePYqKx_3` 与 W5.1 分支：

- 座舱整帧（1920×1080）8-bit 均值都为 `[51.6, 40.4, 35.1]`（未舍入 `[51.56, 40.44, 35.11]`；`docs/w5-color-lock*.json` 的 `mean` 是 240×135 缩略统计，因此写成 `[51.7, 40.5, 35.2]`，口径不同）。
- 整帧平均绝对差 **4.9 / 255 ≈ 1.9%**；参数未改，差异在胶片颗粒的逐帧时间噪声量级内。
- 黄昏、夜雨条件的均值也一致（`docs/w5-color-lock-before.json` / `docs/w5-color-lock.json`）。

![Before/after cockpit](images/w5-lock-before-after-03.png)

> 说明：W5.1 只冻结 grade，不改变 UI/画面表现；因此“调前/调后”应是同一张画面。若这里出现肉眼可见的差异，说明有范围外改动，验收不通过。

### 3.3 黄昏 / 夜雨条件

目标 01、02 是 look-dev 机位，仓库没有记录当时相机的位置/朝向/曝光，因此不能像座舱那样逐像素复现。用同条件（黄昏山脊 `17:36`、夜雨 `21:00`）抓的当前 build：

| 条件 | 当前 build 抓图 | 整帧均值 |
|---|---|---|
| 黄昏山脊 | [`w5-lock-dusk.png`](images/w5-lock-dusk.png) | `[52.3, 36.6, 36.9]` |
| 夜雨车灯 | [`w5-lock-night.png`](images/w5-lock-night.png) | `[1.2, 2.1, 15.3]` |

这两张用于确认同一套固定 grade 在黄昏/夜雨下仍保持“暖高光 + 冷阴影、胶片颗粒、暗角”的方向；构图与目标 01/02 不同，不能当作逐像素对照。目标 01/02 本身的来源见 §2。

## 4. 可复现命令

```bash
npm ci
npm run typecheck
npm test
npm run build
npm run capture:grade                    # 本分支 build → docs/images/w5-lock-*.png
node scripts/capture-grade-lock.mjs \
  --url "https://game.xiaoannurse.art/?fresh=1" --prefix before-
                                         # 已部署 W5 build → docs/images/w5-lock-before-*.png
```

`capture-grade-lock.mjs` 用游戏自带的 `__superagent` 调试接口停循环、设时间/天气/车/相机，再从 `PostFx.capture()` 取无 HUD 的 1920×1080 PNG；参数与产物记录在 `docs/w5-color-lock.json`。

## 5. 锁的机制

- `src/core/grade.ts`：`LOCKED_GRADE` + `PHOTO_FILTERS`，对象与 `lift`/`gain` 数组全部 `Object.freeze`；`GAME_GRADE_INDEX = 0`。
- `src/core/postfx.ts`：构造时 `applyFilter(GAME_GRADE_INDEX)`；`PHOTO_FILTERS` 从 `grade.ts` 再导出，拍照模式行为不变。
- `src/core/grade.test.ts`：
  1. 固定参数值逐项相等；
  2. 游戏 grade = 滤镜 0，共 5 个滤镜；
  3. 运行时不可写（改值/`push` 都抛错）；
  4. 暖高光（`gain[0] > gain[2]`）、冷阴影（`lift[2] > lift[0]`）方向，以及颗粒/暗角/饱和/对比在合理区间。

`npm test` 结果见 §7；参数值/冻结漂移会失败，表示“调色被改了”，需要重新走目标图评审，而不是改测试。PostFx 构造接线（`applyFilter(GAME_GRADE_INDEX)`）目前由代码审查覆盖；若要更强的接线回归，可补 WebGL mock，不在本次范围。实测把 `LOCKED_GRADE.grain` 从 0.018 改成 0.019 后，`src/core/grade.test.ts` 的“keeps the target-locked values”立即失败（1 failed / 3 passed）；恢复后 4/4 通过。

## 6. 制作人独立验收

> 执行者：未参与 W5.1 实现的独立子代理（fresh context），2026-11-06。
> 审查对象：分支 head `e3867cf` + 未提交改动（17 个文件）；自起 build `dist/assets/index-5K2mGnVF.js`，部署版 bundle `index-ePYqKx_3.js`。
> 结论：**技术部分通过；整卡有条件通过**——本页 §3 数字已按复核意见修正；#21 最终“观感对不对味”与 target 01/02 的滤镜归属待所有者（见 §8），不代填“观感通过”。

独立复核（均在本机实际执行，未修改仓库）：

- `npm run typecheck` → exit 0；`npm test` → 15 文件 / 93 项全过（含 `grade.test.ts` 4 项）；`npm run build` → exit 0。
- 从部署版与分支 bundle 抽出 5 个滤镜常量，逐项相同；postfx 逻辑一致；部署构造 `applyFilter(0)`，分支 `GAME_GRADE_INDEX = 0` → 不依赖 worker 截图即可证明参数未变。
- 座舱 before/after：相位偏移约 `(-0.002, -0.008)`、响应 0.987；全帧有符号均值差 `[0.003, 0.006, 0.006]`；MAE **4.91/255**；平坦区差值 std 6.73 与颗粒幅度一致；高/低频能量 70.513 vs 70.518 → 差异只有逐帧颗粒，无调色回归。
- target 03：构图/结构一致，相位对齐约 1.7 px；居中 1500×800、shift `(-2,-4)` 复算 MAE **12.30/255 (4.82%)**，有符号差 R +0.10 / G −1.30 / B −1.09；与 §3.1 的 `(200,200)` 裁切口径同量级，均属颗粒/时间/对齐残差。
- 锁：`grain` 0.018→0.019、`lift` B 0.008→0.006、去掉 `Object.freeze` 三种篡改都让测试失败；基线 4/4 通过。`PostFx` 构造接线未单测，已见 §5，非阻塞。
- 范围/卫生：无 gameplay/UI/物理/HUD 改动，无部署/CI/密钥/依赖变化；staged 清单干净；target 01/03 与仓库既有图 SHA-256 相同，02 唯一；02 带 sRGB/gAMA 元数据、01/03 为 canvas RGBA，描述属实。
- 复核发现并已修正：§3.1 裁切原点/数值、§3.2 全帧均值口径、§3.3 night 均值、§0/§3.1 的“1/255”措辞、§8 的 target 01“暖调”旁证。

## 7. 命令与结果（worker 自测）

```
npm run typecheck   → 通过
npm test            → 15 个文件 / 93 项通过（含新增 `src/core/grade.test.ts` 4 项）
npm run build       → 通过，dist/assets/index-*.js
npm run capture:grade → docs/images/w5-lock-{dusk,night,cockpit}.png + docs/w5-color-lock.json
部署版抓图          → docs/images/w5-lock-before-*.png + docs/w5-color-lock-before.json
                    （PR 保留 before/after 合成图与 JSON；原始 before PNG 可用 §4 命令重生成，未重复提交）
```

## 8. 限制与未决

- **观感最终判定属所有者**：本页证明“当前固定 grade 与目标 03 对得上、目标 01/02 来自同一 build”，但“对不对味”仍需人看；不代填“通过”。
- 目标 01/02 的 look-dev 机位/曝光未记录，无法逐像素复现；§3.3 只做同条件确认。
- 目标 02 是带 sRGB/gAMA 元数据的截图，目标 01/03 是 canvas 抓图；色彩管理路径略有差异，因此比较用 8-bit 均值/平均绝对差，不用像素哈希。
- **需要所有者拍板（不代填）**：target 01/02 是否算“游戏内 grade 目标”。`docs/w5-acceptance.md` §1.1 的图注把 target 01 来源图 `w5-photo-hero.png` 标为“山脊观景点，黄昏，**暖调**”；在拍照模式语境里“暖调”是滤镜名，所以 target 01 很可能是“暖调”滤镜而非游戏内原片。target 02 的滤镜/曝光未知。一个固定 grade 不可能同时等于两张不同滤镜图，因此：
  - **A（建议，当前实现）**：接受 target 01/02 是拍照模式/滤镜变体，只有 target 03 定义游戏内原片；维持当前中性 `LOCKED_GRADE`。
  - **B**：希望游戏内黄昏/夜雨也向 target 01/02 靠——这是新的风格决定，需要新目标图与重新评审，不在本次“锁定”范围。
- 本次锁的是游戏内固定 grade（原片）；拍照滤镜是拍照模式专用、不改变游戏 grade。
- W5.1 不改变玩家可见画面；如果所有者希望“更暖的黄昏”或“更冷的夜雨”，那是新的风格决定（改 `LOCKED_GRADE` 并重新出目标图），不在本次锁定范围内。
