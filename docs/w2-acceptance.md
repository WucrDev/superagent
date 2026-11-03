# W2 验收自测（路面与坡度）

- 日期：2026-11-03
- 构建：W2 路面与坡度（本 PR HEAD；基于 W1 `main` + 转向修复）
- 测试环境：macOS + Chrome 156 headless（CDP 驾驶/物理验证）；主观项需要人工浏览器试玩
- 自测命令：`npm ci`、`npm run typecheck`、`npm test`（18 tests）、`npm run build`

## 验收对照

| W2 项 | 验收标准 | 结果 |
|---|---|---|
| #12 四种路面材质 | 泥 / 岩 / 雪 / 深水；每轮按材质查摩擦系数 | 4 条材质车道（干土基线 / 泥 / 岩 / 雪）+ 深水区；每个 collider 在 `TerrainField` 注册 `Surface`，每轮由 `surfaceAt(collider.handle)` 查询 |
| #12 抓地曲线 | 滑动时加侧向阻力 | `gripCurve(滑移速度)` 低滑移 1.0 → 高滑移 0.6；侧向力乘 `surface.lateralGrip`；滚动阻力乘 `rollingResistance` |
| #12 同一坡干土能上、湿泥上不去 | 干土到顶；湿泥滑回 | 同一 30° 几何、同起点静止起步：干土峰值 y=6.99 m（到顶），湿泥峰值 y=4.73 m 后滑回 z≈111.3 m / y=1.04 m |
| #12 材质差异可口头描述 | 玩家可描述 | 客观差异：约 34 km/h 制动距离 干土 5.85 / 泥 8.99 / 岩 6.18 / 雪 13.38 m；**主观描述待人工试玩** |
| #13 坡度查询（法线夹角） | 提供坡度 | `slopeDeg`：平地 0.0°，30° 坡 29.8°（轮速接触法线平均） |
| #13 深水 >50 cm 进水 | 动力 -40%，10 s 恢复 | 入水后 `waterIngress` 0.94→1.0，`powerFactor` 0.62；同 3 s 静止加速：干地 34.0 km/h / 23.85 m，深水 26.9 km/h / 13.77 m |
| #13 倒出来能恢复 | 10 s 恢复 | 出水后 ingress 0.97 → 0.47（5 s）→ 0（10 s）；power 0.61 → 0.81 → 1.00 |
| #13 打滑粒子与拉痕 | 有 | 雪地打滑 6.68 m/s：轮胎拉痕 + 雪屑粒子（截图） |
| #13 白烟 | 深水冒白烟 | 深水截图：车头白烟 + 水花粒子 |

## 材质参数

| 材质 | friction | lateralGrip | rollingResistance | 用途 |
|---|---|---|---|---|
| 干土 dirt | 1.00 | 1.00 | 1.0 | 基线 / 干土坡 |
| 泥地 mud | 0.62（W1 坡 0.70 / 0.55 保留） | 0.70 | 1.7 | 泥坡、2 m 沟底 |
| 湿泥 wetMud | 0.35 | 0.50 | 2.2 | 湿泥 30° 坡 |
| 岩石 rock | 0.95 | 1.15 | 0.9 | 岩石堆 / 岩石车道 |
| 雪地 snow | 0.40 | 0.55 | 2.1 | 雪地车道 |
| 深水 water | 0.35 | 0.50 | 3.0 | 水下地面 |

## 实测

### 材质车道（同一车道 z=55 静止起步，L 档全油门 2.5 s；随后从约 34 km/h 全力制动）

| 车道 | 2.5 s 距离 | 2.5 s 末速 | 制动距离 | 车道识别 |
|---|---|---|---|---|
| 干土（基线） | 19.06 m | 34.0 km/h | 5.85 m | dirt |
| 泥地 | 19.13 m | 33.5 km/h | 8.99 m | mud |
| 岩石 | 19.06 m | 34.1 km/h | 6.18 m | rock |
| 雪地 | 18.91 m | 33.4 km/h | 13.38 m | snow |

> 直线全油门时四种材质的加速差异很小（引擎力低于抓地极限）；差异主要体现在制动、侧向抓地与坡道，符合“抓地曲线”的预期。

### 干土 / 湿泥同一 30° 坡（z=110 静止起步，L 档全油门 8 s）

| 坡 | 接触材质 | 峰值 y | 结束位置 | 结论 |
|---|---|---|---|---|
| 干土 30° | dirt | 6.99 m | z=144.14, y=0.30（越过坡顶） | 能上 |
| 湿泥 30° | wetMud | 4.73 m | z=112.13, y=1.29（滑回坡底） | 上不去，滑回 |

### 深水（80 cm）

- 驶入：z=180 起步加速 2.6 s 到 z≈198，ingress 0.944，power 0.622。
- 同条件 3 s 静止加速：干地 34.0 km/h / 23.85 m；深水 26.9 km/h / 13.77 m，ingress 1.0。
- 出水恢复：0.97（出水瞬间）→ 0.47（5 s）→ 0（10 s）；power 0.61 → 0.81 → 1.00。
- 40 cm 浅水不触发进水：ingress 0，power 1.0。

### W1 回归（W2 改动不得破坏 W1 验收）

- 平地 L 档 2 s：34.7 km/h，与 `docs/w1-acceptance.md` 一致。
- 30° 泥坡**静止起步**：L 档 z 131.94→139.18（+7.24 m，爬上去）；H 档 z 131.93→131.39（-0.54 m，滑下），与 W1“L 能起步、H 打滑”一致。
- 手刹在 30° 泥坡上仍能停住（17 km/h 进入，2.5 s 内停稳）。
- 三视角 chase → free → cockpit 切换正常。

## 复现步骤

1. `npm ci && npm run dev`，打开 `http://127.0.0.1:5173/`。
2. 浏览器控制台使用调试钩子：
   - 材质车道：`__superagent.car.place(40, 55)`（依次 40/54/68/82），按住 W 2.5 s；再按 S 测制动。
   - 干/湿泥坡：`__superagent.car.place(-60, 110)` / `(-32, 110)`，按住 W 8 s。
   - 深水：`__superagent.car.place(0, 180)`，按住 W 2.6 s；读 `__superagent.car.waterIngress` / `powerFactor`。
   - 坡度：`__superagent.car.slopeDeg`；材质：`__superagent.car.currentSurface.label`。
3. 视觉：截图见下。

## 截图

材质车道（Before：`main` 无 W2 内容 / After：本 PR）：

Before：![车道 before](images/w2-lanes-before.png)
After：![车道 after](images/w2-lanes-after.png)

干土 / 湿泥同坡（Before：`main` 无坡 / After：本 PR）：

Before：![坡 before](images/w2-ramps-before.png)
After：![坡 after](images/w2-ramps-after.png)

深水白烟（Before：W1 只有视觉水面 / After：本 PR）：

Before：![水 before](images/w2-water-before.png)
After（静态）：![水 after](images/w2-water-after.png)
After（行驶中，白烟 + 拉痕 + 水花）：![水 driving](images/w2-water-driving.png)

干土 30° 爬坡与雪地打滑：

![干土爬坡](images/w2-dry-ramp.png)
![雪地打滑](images/w2-snow-slip.png)

## 已知限制

- 轮胎仍是 W1 的单点轮胎力近似，没有独立轮速/轮滑；抓地曲线以接触点滑移速度近似“抓地峰值后衰减”。
- 深水判定以车身中心与发动机高度为准，半浸没（只淹前轮）不触发进水。
- 材质差异的主观描述（“雪地飘、岩石咬、泥地拖”）与白烟观感需要人工试玩；agent 不代填。
- W2 的 HUD（#15）与地形摆点工具（#14）不在本卡范围。
