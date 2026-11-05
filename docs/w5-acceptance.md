# W5 验收记录｜像那么回事（相机 / 昼夜天气 / 调色 / 存档 / 录屏）

> 状态：实现自测完成，**制作人独立验收待做**；主观项与目标图相关项保持“待人工验收”。
> 基线：W4 `024d0cb`（build `CNvtFRAR`，已上线主链接）｜本页对应 W5 分支 `agent/polish-w5-fa40e3a0bc60`。
> 验收标准来源：[`docs/sprint-w1-w6.md`](sprint-w1-w6.md) W5 #19–#23。
> 证据约定：截图来自本页 revision 的实际 build；命令结果见下方各节；主观项不代填。

## 0. 这周交付了什么

| 任务 | 状态 | 主要证据 |
|---|---|---|
| #19 相机、座舱与摄影 v0 | 客观项通过（含座舱绞盘/HUD/掉帧）；“值得发的截图”投票待人工 | 拍照模式 UI、1920×1080 抓拍、座舱截图、顶视图叠合、座舱绞盘与 FPS |
| #20 昼夜与基础天气 | 客观项通过；夜雨手感待人工 | 24 min 日循环、雨/雾、车灯、湿滑制动测量 |
| #21 后期与调色 v0 | 固定管线完成；**3 张目标图缺失，无法完成观感比对** | `PHOTO_FILTERS` + 固定 grade、示例图 |
| #22 存档与检查点 v0 | 通过（自动化强退重开） | 木屋检查点、localStorage 快照、重开后的数值 |
| #23 60 秒录屏脚本 | 通过（`npm run record`） | [`w5-60s.mp4`](w5-60s.mp4)，ffprobe 1920×1080 / 60 fps / 60 s |

## 1. #19 相机、座舱与摄影 v0

### 1.1 拍照模式

- 入口：`P` 进入/退出；`C` 切换第三人称 / 自由 / 座舱；滚轮调 FOV **24–200**；`[` / `]` 调三档曝光（-1 / 0 / +1 EV）；`1`–`5` 选 **原片 + 4 个滤镜**；`Space` 快门；HUD 全部隐藏。
- 抓拍：`PostFx.capture()` 从同一个 EffectComposer 读取 canvas，输出**无 DOM HUD**的 PNG；实测 1920×1080 PNG 约 3–6 MB。
- 快门音：`EngineAudio.cameraShutter()` 两段机械声（无音频的 headless 环境只验证调用路径）。

拍照模式（1280×720，HUD 隐藏、相机 UI 在画面外）：

Before（W4，无拍照模式、固定 HUD）：[`w4-rework-spawn.png`](images/w4-rework-spawn.png)
After（W5 拍照模式）：[`w5-photo-ui.png`](images/w5-photo-ui.png)

可发的成片示例（1920×1080，山脊观景点，黄昏，暖调）：
![W5 hero](images/w5-photo-hero.png)

> “团队内投票 ≥4/5 通过”是主观项，需人工投票；当前只能标待人工验收。

### 1.2 座舱内饰 v0

- 内容：仪表台（双表 + 指针 + 刻度）、三辐方向盘、驾驶/副驾座椅、门板与扶手、A 柱、遮阳板、车内后视镜、车外后视镜、中央通道与换挡杆、座舱灯、引擎盖/翼子板 blockout。
- 比例：车身 1.80 × 4.00 m，外模座舱宽 1.50 m；仪表台 1.48 m（相对误差 1.3%）；方向盘/眼点/驾驶座中心均为 x = -0.32 m（0% 偏差）；眼点 y = 0.54 m，座舱顶 0.76 m，外模车顶 0.80 m。
- 座舱视角：`driverEye (-0.32, 0.54, -0.10)`，FOV 默认 70（60–90 可调），左右 ±90°、上下 ±45°。
- 从座舱能拍到方向盘 + 仪表台 + 前方路况；见 [`w5-cockpit.png`](images/w5-cockpit.png)。
- **座舱绞盘/HUD（cockpit-design §4 第 5 条）**：在 W3 湿泥地 (50,150) 用座舱机位选择/挂上“泥坑树 A”，按 H 打开张力条与角度环，按住 F 3.2 s 后车辆位移 **4.94 m**（x 50.07→51.28，z 149.94→154.74），绳索保持 attached，HUD 可读。截图 [`w5-cockpit-winch.png`](images/w5-cockpit-winch.png)，原始数据 [`w5-cockpit-check.json`](w5-cockpit-check.json)。完整 35° 湿泥坡脱困仍以 W3 验收为准。

Before（W4 build `CNvtFRAR`，同一 1280×720、同一出生点、HUD 隐藏）：[`w5-before-cockpit.png`](images/w5-before-cockpit.png)
After（W5，同一机位）：[`w5-after-cockpit.png`](images/w5-after-cockpit.png)

顶视图叠合（外模 + 座舱，同一相机、50% 混合）：

![W5 cockpit overlay](images/w5-cockpit-overlay.png)

> 说明：外模是三视图 blockout（Box），没有单独的精模三视图；本图用同一正交近似机位把“外模顶视”和“座舱顶视”叠合，关键尺寸从同一车型常量读取并标注。A 柱内外模无对应斜面，按座舱设计值 0.12 rad 记录。座舱盲认（第 3 条）与多车型（第 4 条）按 `docs/cockpit-design.md` 在 P2/P3 新车型时执行。

### 1.3 切换与性能

- 第三人称 ↔ 自由 ↔ 座舱由 `C` 循环，切换时 `car.setCockpit()` 隐藏外模/显示内饰，相机由 `CameraRig` 阻尼跟随。**20 次连续切换实测**：模式按 free→cockpit→chase 循环，`cockpit` 与外模 `visible` 一致，console 0 error（1280×720）。原始记录 [`w5-switch-check.json`](w5-switch-check.json)。
- 座舱视角与第三人称使用同一 `WebGLRenderer`/`PostFx`；**1280×720 同场景各 5 s** 的 rAF 实测：第三人称 60.11 fps、座舱 60.08 fps，掉帧 **0.05%**（≤10%）。原始数据 [`w5-cockpit-check.json`](w5-cockpit-check.json)。

## 2. #20 昼夜与基础天气

- 日循环：默认 **24 分钟 = 1 游戏日**（`DEFAULT_DAY_SECONDS = 1440`），设置面板可调 **6–90 分钟**；`N` 切换时间加速 ×8；HUD 显示 `HH:MM`、天气、大灯、发现数。
- 天气：`B` 循环 **晴 → 雨 → 雾**；雨有雨线、雨声与湿滑；雾有能见度衰减；夜间/雨雾自动开大灯（17.6 时后或雨雾中）。
- 湿滑：`WET_GRIP.dirt = 0.46`。实测（1280×720，Chrome GPU，真实键盘，同一条干土车道，静止加速到 30 km/h 后全力制动）：
  - 干地（12:00 晴）：起始 z=63.37，制动距离 **4.394 m**。
  - 夜雨（21:00 雨，湿透）：起始 z=68.62，制动距离 **9.146 m**。
  - 同距离制动所需速度比 `sqrt(4.394/9.146) = 0.693`，即需要 **30.7% 更低** 的入场速度；再叠加夜雨能见度（夜间雨雾 far≈85 m vs 晴 190 m），满足“≥30% 减速”的客观代理指标。单元测试见 `src/vehicle/raycastVehicle.test.ts` 的 “needs a ~30 % lower entry speed…”。
- 夜雨示例（1280×720，HUD 显示 21:00 / 雨 / 大灯，浅水区）：

![W5 night rain](images/w5-night-rain-hud.png)

- 雾示例（1280×720，HUD 显示 09:00 / 雾 / 大灯，能见度衰减）：

![W5 fog](images/w5-fog-hud.png)

> “可感知、不是作弊感”是主观项；客观的制动距离与能见度证据见上，最终手感待人工试玩。

## 3. #21 后期与调色 v0

固定管线（`src/core/postfx.ts`）：

- RenderPass → BokehPass（轻景深）→ GradePass（胶片颗粒、暗角、冷阴影/暖高光分离、饱和度/对比度）→ OutputPass。
- 一套参数定死：`PHOTO_FILTERS` 的“原片”参数就是游戏内固定 grade；拍照模式额外提供 4 个滤镜（胶片/冷调/暖调/褪色），不改变游戏内 grade。
- 景深轻量：非拍照 `aperture 0.00035 / maxblur 0.0018`；拍照 `0.0008 / 0.004`，焦点跟随车辆。

**缺口（必须由人拍板）**：#21 的验收要求“与 3 张目标图的观感差距可接受”，但仓库里没有目标图；`docs/production-plan.md` 把“目标图 3–5 张”列在 P2，而 W5 已引用它。当前实现是中性胶片 v0，**没有目标图就不能宣布观感通过**。请所有者决定：先按当前 v0 继续，还是先补 3 张目标图再定调。

## 4. #22 存档与检查点 v0

- 木屋位于出生点西侧，驶近 `(-9.6, 4.2)`、半径 5.5 m 的检查点即自动写入 localStorage（版本 1）。
- 保存内容：检查点位置/朝向、车况、工具库存（木板/维修包/千斤顶/绞盘）、已发现目标、游戏时刻、天气。
- 加载：强退/刷新后回到木屋检查点，车况、库存、发现数、时刻、天气恢复；`R` 仍是回起点复位，不覆盖存档。
- 发现目标：木屋检查点 / 山脊观景点 / 起手绞盘练习，共 3 个；发现即记录。
- “清除检查点存档”在设置面板底部。

自动化强退重开（Chrome headless，1280×720，`?fresh=1` 开始）：

```
设置 health=55, plank=1, repair=3, time=20.5, weather=rain
teleport(-9.6, 4.2, π/2) → 进入检查点
save: {version:1, checkpointId:'cabin', health:55, inventory:{plank:1, repair:3},
       discovered:['cabin'], hours:20.50, weather:'rain'}
关闭页面 → 新页面打开同一 localStorage
after reload: health=55, plank=1, repair=3, discovered=['cabin'],
              hours≈20.53, weather='rain', 位置 (-9.60, 4.15)
notice: 已从木屋检查点继续 · 车况 55 · 木板 1 · 维修包 3 · 发现 1/3
```

## 5. #23 60 秒录屏脚本

- 一条命令：`npm run record`（先 `npm run build`，再 `node scripts/record-demo.mjs`）。
- 固定机位 + 时间加速：`RecordDemo` 用 5 个 tripod 机位跟踪车辆，`N` 的 ×8 时间加速由脚本开启；15:00 开始，约 60 s 内经过晴天 → 雾 → 黄昏夜雨，最后停在浅水区；HUD/DOM 全部隐藏，只录 canvas。
- 录制：`canvas.captureStream(60)` + `MediaRecorder`（VP9/VP8），Node 端按 1 MB 分片取回，ffmpeg 转 H.264 1080p60（`-preset veryfast -crf 24`，约 1.5 分钟）。
- 产物：[`w5-60s.mp4`](w5-60s.mp4)。

ffprobe（实际运行）：

```
1920x1080 · 60/1 fps · 59.40 s · 29.0 MB · 3564 frames
```

## 6. 命令与结果

```
npm run typecheck  → 通过
npm test           → 14 个文件 / 89 项通过
npm run build      → 通过，dist/assets/index-*.js
npm run record     → docs/w5-60s.mp4（1920×1080, 60/1, 59.40 s, 29.0 MB）
node（临时浏览器脚本） → docs/w5-cockpit-check.json（FPS + 座舱绞盘）
node（临时浏览器脚本） → docs/w5-switch-check.json（20 次切换）
```

## 7. 已知限制

- 目标图缺失：见 §3。
- “值得发的截图”投票、夜雨手感、调色观感、座舱盲认/多车型均为人工项，未代填。
- 座舱内饰仍是低模 blockout；外模没有精模三视图，叠合是常量测量 + 同机位顶视，不是美术精模比对。
- 座舱绞盘验证是湿泥地挂钩/收绳 4.94 m，不是完整 35° 湿泥坡脱困（后者以 W3 验收为准）。
- 音频/手柄/真实手机触屏仍未在 headless 环境验证；录屏为 canvas-only，无音轨。
- **独立制作人验收：有条件通过**（见 §8）；W5 门禁不能算全绿，#21 目标图缺失需所有者决定。


## 8. 独立制作人验收

> 执行者：未参与 W5 实现的独立子代理（fresh context），2026-11-06；审查 head `0c29981`，随后补交座舱 FPS/绞盘与切换 artifact。

**结论：有条件通过（conditional pass）**。周交付物（可玩 build、89 项测试、构建、1080p60 视频）真实可用；但 W5 卡不能全绿：

- #21 后期调色：**不通过/不可评估** — 验收要求与 3 张目标图比对，仓库没有目标图（`production-plan.md` 把目标图列为 P2）。必须由所有者决定：按当前 v0 继续，还是先补 3 张目标图再定风格。
- #19：初审缺座舱绞盘完成证据与 ≤10% 掉帧证据；现已补：
  - 座舱机位湿泥地挂钩/收绳，车辆移动 4.94 m，张力条/角度环/HUD 可读（[`w5-cockpit-check.json`](w5-cockpit-check.json)、[`w5-cockpit-winch.png`](images/w5-cockpit-winch.png)）；
  - 1280×720 同场景各 5 s：60.11 → 60.08 fps，掉帧 0.05%（≤10%）。
  - 仍保留“待人工”：值得发的截图 4/5 投票。
- #20 客观通过（夜雨湿滑 + 能见度）；“可感知、不作弊感”待人工。
- #22、#23 客观通过。
- 主观项（截图投票、调色观感、夜雨手感、座舱盲认）不得写成完成；座舱盲认/多车型按 `cockpit-design.md` 在 P2/P3 新车型时执行。
- 20 次切换/0 console error 的原始记录已补为 [`w5-switch-check.json`](w5-switch-check.json)。
