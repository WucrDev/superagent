# W4 四件工具验收自测（木板、千斤顶、维修包、工具轮盘）

- 日期：2026-11-04
- 本 PR 构建：`index-ZUWWCkcv.js`（Before 基线：`main` c7b147e / `index-Bf1fPu_C.js`）
- 测试环境：macOS + Chrome 156 headless（SwiftShader），1280×720；另测 390×844 手机布局
- 自测命令：`npm ci`、`npm run typecheck`、`npm test`（69 tests）、`npm run build`
- 线上：**未部署**。主链接 <https://game.xiaoannurse.art/> 保持已验收的 W3（`Bf1fPu_C`）；按“未验收 build 只放预览”规则，本 build 只做本地 `vite preview` 验证，独立验收通过后再发布。
- 结论：**实现与客观自测通过；主观手感/观感、真实手柄与音频仍待人工验收**。独立验收（未参与实现）未执行，本文件不代替它。

## 验收对照

| W4 任务 | 验收标准 | 结果 | 证据 |
|---|---|---|---|
| #21 木板架桥 | 4 m 长，需两个受力点，放置后消耗 | 4 m 板，两端支撑射线；两端悬空/一端悬空拒绝放置且不消耗；正常放置木板 2→1 | `plankMath.test.ts` 6 项；`w4-after-ditch.png`；“木板已架好 · 4 m · 两端高差 0.00 m” |
| #21 2 m 沟能过 | 从 z=170.4 起步，木板中心落在 z=174.8（沟在 174–176） | 按住 W 后 z=170.4 → 188.9，越过 2 m 沟，未落入沟内 | `w4-after-ditch.png`、`w4-before-ditch.png`、`w4-after-crossing.png`；实测 z 序列 172.4 → 178.0 → 184.8 → 211.5 |
| #21 斜放滑落 | 斜放会滑落并提示 | 30° 坡上两端高差 2.3 m：消耗 1 块、板滑落，提示“两端高差 2.3 m · 斜放会打滑，找平一点再放” | `w4-after-slip.png`；planks 1→0 |
| #21 轻微下沉与弯曲声 | 车过桥有下沉与木板弯曲声 | 车在板中心时板面下沉 0.041 m（0.060 → 0.019）；`onCreak` 回调在 1.2 s 内触发 4 次 | 实测值；音声由 `EngineAudio.plankCreak` 合成，headless 无法听辨 |
| #22 千斤顶 | 3 s 翻正，需坡度 < 15° | 按住 J 3 s，`up.y` 0 → 0.70（1.4 s）→ 1.00；中途提示“还差 1.1 s”；车从侧翻姿态连续抬正 | `w4-after-rolled.png`、`w4-after-jack-mid.png`、`w4-after-jack-done.png` |
| #22 陡坡不可用并给理由 | 不是静默失败 | 30° 坡上提示“坡度 30° > 15° · 千斤顶会滑，先开到平处”，不进入翻正 | 实测 30° 坡；`jackAvailability` 单测 |
| #22 液压声与车身动画 | 翻正过程有液压声与车身动画 | 车身按进度从侧翻插值到竖直并抬升；液压泵/落车音由 `EngineAudio.jackPump/jackDone` 触发 | 动画截图；音频需人工听 |
| #23 血量与衰减 | 血量 100；<50 动力与转向衰减 | 平地正常驾驶 6 s、33.6 km/h：血量 100；掉沟撞击 -22（二次接触时总计 -23~-25）；血量 35 时动力 0.90、转向 0.91 | `w4-after-damaged.png`、`w4-after-ditch-crash.png`；`healthMath.test.ts` 7 项 |
| #23 可感知但不致命 | 损伤可感知；0 血仍能开 | 0–20 km/h 加速：满血 0.749 s vs 0 血 1.211 s（+62%）；1.3 s 满舵偏航 64.0° vs 48.3°（-25%）；0 血仍可行驶 | 实测值；`healthMath.test.ts`（0 血动力 0.65 / 转向 0.70） |
| #23 维修包 +35 / 2 s | 每包 +35，2 s 动画 | 35 → 70，维修包 1→0，HUD 提示“修理完成 · 车况 +35（70）”；中途显示“修理中 0.8 s” | `w4-after-repair-mid.png`；实测 health 70 |
| #23 每趟 1–3 个 | 每趟 1–3 个维修包 | 起始 1 个，路上 2 个红色补给箱，最多 3 个 | 实测维修包 1→2（拾取）；补给点布局 |
| #24 工具轮盘 | 4 槽 + 数量；拾取/丢弃/切换 | 4 槽：绞盘 ∞ / 木板 2 / 千斤顶 1 / 维修包 1；键盘 1–4 与按住 T 轮盘均可切换；靠近补给箱自动拾取（维修包 1→2）；丢弃木板 2→1，倒车可捡回 1→2 | `w4-after-tool-wheel.png`、`w4-after-hud.png`；实测计数 |
| #24 手柄快捷环 | 手柄不用键鼠即可切换 | 模拟手柄（Gamepad API）：按住 View + 十字右 → 高亮“木板”，松开选中；轻点 View → 切到千斤顶；按住十字下 3 s → 千斤顶翻正 | `w4-after-wheel-gamepad.png`；手柄测试日志 |
| #24 手机布局 | 新增工具条不遮挡既有控件 | 390×844：工具条在底部图例上方、避开倒车按钮；隐藏桌面长帮助文本 | `w4-after-mobile.png` |

## Before / After

Before 为本 PR 之前的 `main`（c7b147e，W3 build `Bf1fPu_C`），After 为本 PR HEAD 的 build `ZUWWCkcv`；同一 1280×720、同一场景与相机。

| 场景 | Before（W3） | After（W4） |
|---|---|---|
| 出生点 HUD：车况条 + 4 槽工具条 | ![before hud](images/w4-before-hud.png) | ![after hud](images/w4-after-hud.png) |
| 按 1–4 / 按住 T：W3 无工具系统，W4 打开轮盘 | ![before keys](images/w4-before-tools-keys.png) | ![after wheel](images/w4-after-tool-wheel.png) |
| 侧翻：W3“按住 J 翻正（10 s）” vs W4“按住 J 3 s 千斤顶（坡度 0°）” | ![before rolled](images/w4-before-rolled.png) | ![after rolled](images/w4-after-rolled.png) |
| 2 m 沟同一机位：W3 没有架桥手段 vs W4 木板跨沟 | ![before ditch](images/w4-before-ditch.png) | ![after ditch](images/w4-after-ditch.png) |

补充证据：

- 木板跨沟后继续行驶到对岸：![after crossing](images/w4-after-crossing.png)
- 斜放打滑（消耗 1 块 + 提示）：![after slip](images/w4-after-slip.png)
- 千斤顶中途与完成：![jack mid](images/w4-after-jack-mid.png)、![jack done](images/w4-after-jack-done.png)
- 车损 35 与维修动画：![damaged](images/w4-after-damaged.png)、![repair mid](images/w4-after-repair-mid.png)
- 沟边撞击 -22：![ditch crash](images/w4-after-ditch-crash.png)
- 手柄轮盘高亮：![wheel gamepad](images/w4-after-wheel-gamepad.png)
- 手机 390×844：![mobile](images/w4-after-mobile.png)

## 实测记录（当前 build）

- `npm run typecheck`：通过。
- `npm test`：69 tests / 10 files 通过（新增 inventory 7、healthMath 7、plankMath 6）。
- `npm run build`：通过（`index-ZUWWCkcv.js`、`index-xe1Qf5xo.css`）。
- Chrome 156 headless 实测：
  - 工具：1–4 选择；按住 T 轮盘；Backspace 丢弃；拾取维修包/木板。
  - 木板：放置 → 过沟 z=170.4→188.9；斜放 1→0 并提示；车在板上时板面下沉 0.041 m，creak 回调 4 次。
  - 千斤顶：平坡 3 s 翻正（`up.y` 1.0）；30° 坡拒绝并给理由；手柄十字下同样可用。
  - 车况：平地 6 s 无伤；掉沟 -22（二次接触 -23~-25）；35 血维修 2 s 后 70；0 血 0–20 km/h 1.211 s vs 满血 0.749 s；偏航 48.3° vs 64.0°。
  - 工具轮盘（模拟手柄）：View + 十字右选木板、轻点 View 切下一件、十字下 3 s 翻正。
  - 回归：绞盘 G 挂钩 → 按住 F 收绳（z 0→7.07）→ G 松绳；R 复位；控制台无 error。
- 失败态/边界：木板两端悬空不消耗；维修时车在动提示“停稳再修”；车况满提示“留着”；绞盘/千斤顶不可丢。

## 已知限制

- **独立验收未做**：本文件是 worker 自检，不等同于 `docs/game-producer.md` 要求的未参与实现者独立走查；PR 不应在独立验收前合并到主链接。
- **手柄**：用 `navigator.getGamepads` 桩模拟，只验证逻辑与映射；真实手柄的死区、按键手感、震动未验证。
- **音频**：木板吱呀、液压泵、维修棘轮、撞击声均只在代码路径触发；headless 无音频输出，需人工听辨。
- **主观项**：木板/打滑提示的可读性、千斤顶 3 s 的节奏、工具轮盘的扫视成本、车损与维修的“可感知”程度，待制作人/所有者试玩判定。
- **损伤阈值**：沟边/侧翻可一次扣 22 左右；平地 6 s 无伤。是否需要更轻的损伤曲线属于手感调参，待人工验收后决定。
- **未部署**：主链接保持 W3；独立验收通过后用 `deploy/fuyou/README.md` 的 rsync 流程发布本 build。
