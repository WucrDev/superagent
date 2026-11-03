# superagent｜越野灰盒原型（W1 可玩 build）

“一辆车、一段烂路、一根绞盘”的越野灰盒原型。W1 目标：**能开**。
当前版本是 three.js + Rapier 的浏览器可玩构建，不需要安装游戏引擎。

![第三人称视角](docs/images/w1-chase.png)

![座舱视角 blockout](docs/images/w1-cockpit.png)

[60 秒录屏（L 档爬坡 / 三视角 / H 档泥坡打滑）](docs/w1-playthrough.mp4)

> 试玩反馈（2026-11-03）：手感 8/10；A/D 转向已按屏幕方向修正；锚点/绞盘属 W3，W1 仅放置了 3 个锚点物体。

## 快速开始

1. 安装 **Node.js 22 LTS**（或 ≥ 22.12）与 npm。
2. 安装并初始化 Git LFS（美术资产需要）：

   ```bash
   brew install git-lfs   # macOS；其他平台见 https://git-lfs.com
   git lfs install
   ```

3. 安装依赖并启动：

   ```bash
   npm ci
   npm run dev     # 打开 http://127.0.0.1:5173/
   ```

## 操作

| 输入 | 动作 |
|---|---|
| WASD / 方向键 | 油门、刹车、转向 |
| 手柄左摇杆 / RT / LT | 转向、油门、刹车 |
| Q / E 或 手柄 LB / RB | L 档 / H 档（0.3 s 动力中断） |
| C 或 手柄 Y | 切换第三人称 / 自由 / 座舱 |
| Space 或 手柄 A | 手刹（坡起不溜车） |
| R 或 手柄 Start | 复位到起点 |
| 鼠标右键拖动 | 自由 / 座舱视角环视 |
| 滚轮 | 相机距离 |
| Esc | 手柄死区、转向灵敏度、FOV 设置 |

## W1 已实现（#1–#5）

- **工程骨架**（#1 / issue #7）：Vite + TypeScript，npm 锁版本，60 Hz 固定步长，Git LFS。
- **射线悬挂车辆**（#2 / issue #8）：每轮 8 条射线、弹簧-阻尼、上下限位；车身质量/重心可配。
- **两档变速箱**（#3 / issue #9）：L 0–35 km/h、H 0–90 km/h，换档 0.3 s 动力中断 + 合成换档音；手刹坡起。
- **相机与输入**（#4 / issue #10）：第三人称跟随、自由环视、座舱 blockout（仪表台/方向盘/座椅/A 柱/门板/后视镜），死区与灵敏度设置。
- **白盒测试场**（#5 / issue #11）：800×800 m，包含 8° 缓坡、40 cm 浅水、岩石堆、30°/35° 泥坡、2 m 沟、80 cm 深水、3 个绞盘锚点。
- HUD：速度、档位、相机模式、输入设备；合成引擎音。

验收自测与已知限制见 [`docs/w1-acceptance.md`](docs/w1-acceptance.md)。
常驻制作人（兼策划）负责设计细节与验收，关键决策上报项目所有者；职责与流程见
[`docs/game-producer.md`](docs/game-producer.md)。

## 常用命令

| 命令 | 作用 |
|---|---|
| `npm run dev` | 本地开发服务器（HMR） |
| `npm run build` | 类型检查 + 生产构建到 `dist/` |
| `npm run preview` | 预览生产构建 |
| `npm test` | Vitest 单元测试（时钟 + 射线悬挂车辆） |
| `npm run typecheck` | TypeScript 检查 |

## 目录

```
src/
  core/       # 固定步长循环、输入、渲染器、音频、数学工具
  vehicle/    # 8 射线悬挂车辆、两档变速箱、相机与座舱
  terrain/    # 800×800 白盒测试场
  tools/      # 绞盘、木板、千斤顶等（W3/W4）
  ui/         # HUD、设置面板
docs/         # 设计、排期、验收与决策记录
```

## 明确不在 W1 范围

- W2：四种路面材质/抓地曲线、坡度与涉水物理、打滑粒子、完整 HUD。
- W3：绞盘锚点检测、绳索、张力、失败态。
- W4：木板、千斤顶、维修包、工具轮盘。
- 35° 泥坡与 2 m 沟是故意留给后续工具的障碍；W1 车辆不保证直接通过。
- 座舱目前是 blockout，比例最终要与测试车外模叠合（W5 验收）。

W1–W6 计划见 [`docs/sprint-w1-w6.md`](docs/sprint-w1-w6.md)，技术栈决策见
[`docs/adr/0001-web-stack-threejs.md`](docs/adr/0001-web-stack-threejs.md)。
