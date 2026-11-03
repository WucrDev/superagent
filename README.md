# superagent｜越野灰盒原型

“一辆车、一段烂路、一根绞盘”的越野灰盒原型。当前是 **W1 工程骨架**：three.js + Rapier，浏览器直接运行，不需要安装游戏引擎。

![W1 骨架运行截图：占位车、起点线与 HUD](docs/images/w1-web-skeleton.png)

## 技术栈

| 项 | 方案 |
|---|---|
| 渲染 | three.js（WebGL2） |
| 物理 | Rapier 3D（WASM），60 Hz 固定步长 |
| 工程 | Vite + TypeScript，npm 锁版本（`package-lock.json`） |
| 美术 | glTF / GLB + 贴图，大文件走 Git LFS |
| 输入 | 统一 InputManager：键盘 + 鼠标（滚轮）+ Gamepad API |

原 Unity 方案已按项目所有者决定废弃，决策记录见
[`docs/adr/0001-web-stack-threejs.md`](docs/adr/0001-web-stack-threejs.md)。

## 快速开始（目标：15 分钟内跑起来）

1. 安装 **Node.js 22 LTS**（或 ≥ 22.12）与 npm。
2. 安装并初始化 Git LFS（美术资产需要）：

   ```bash
   brew install git-lfs   # macOS；其他平台见 https://git-lfs.com
   git lfs install
   ```

3. 安装依赖并启动开发服务器：

   ```bash
   npm ci          # 或 npm install
   npm run dev     # 打开 http://127.0.0.1:5173/
   ```

4. 操作：
   - **键盘**：WASD / 方向键驾驶，Space 手刹，R 复位；
   - **手柄**：左摇杆转向，RT 油门，LT 刹车，A 手刹，Start 复位；
   - **鼠标**：滚轮缩放第三人称相机。

## 常用命令

| 命令 | 作用 |
|---|---|
| `npm run dev` | 本地开发服务器（HMR） |
| `npm run build` | 类型检查 + 生产构建到 `dist/` |
| `npm run preview` | 预览生产构建 |
| `npm test` | Vitest 单元测试（时钟 + 车辆物理） |
| `npm run typecheck` | 只做 TypeScript 检查 |

## 目录

```
src/
  core/       # 固定步长循环、输入、渲染器、数学工具
  vehicle/    # 车辆与跟随相机（当前为占位车）
  terrain/    # 测试场地形
  tools/      # 绞盘、木板、千斤顶、编辑器工具（后续）
  ui/         # HUD
docs/         # 设计、排期与决策记录
docs/images/  # 运行截图
```

## 当前进度

- [x] **W1 #1 / issue #7**：工程骨架、60 Hz 固定步长、Input System（键盘/手柄）、可运行占位车
- [ ] W1 #2 / issue #8：8 射线弹簧-阻尼悬挂（替换占位车）
- [ ] W1 #3 / issue #9：两档变速箱与动力
- [ ] W1 #4 / issue #10：第三人称 / 自由 / 座舱相机与输入设置
- [ ] W1 #5 / issue #11：白盒测试场 v0

> 占位车只是为了让骨架能端到端验证“输入 → 60 Hz 物理 → 渲染 → HUD”。
> 真正的车辆手感从 W1 #2 开始，不要在占位车上继续加功能。

## 验收（issue #7）

- 新成员 clone 后 15 分钟内能跑起来；
- `npm run typecheck`、`npm test`、`npm run build` 通过，无警告。
