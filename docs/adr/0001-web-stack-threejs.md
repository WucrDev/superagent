# ADR 0001：W1 技术栈从 Unity 改为 three.js + Rapier

- 状态：已接受
- 日期：2026-11-03
- 决策人：项目所有者
- 替代：原 `docs/sprint-w1-w6.md` W1 #1 中的 Unity 6 URP 工程

## 背景

原计划使用 Unity 6 + URP。Unity 6.3 LTS（6000.3.27f2）已安装到本机，但编辑器启动需要
Unity 账号许可证激活；项目所有者明确表示不想使用 Unity，要求改用 three.js。

## 决策

- **渲染/场景**：three.js（WebGL2），浏览器直接运行。
- **物理**：Rapier 3D（WASM），固定 60 Hz 步长。
- **工程**：Vite + TypeScript；依赖用精确版本 + `package-lock.json` 锁定。
- **输入**：自定义 `InputManager`（键盘、鼠标滚轮、Gamepad API），不再有引擎输入系统。
- **美术**：glTF / GLB + 贴图，大文件走 Git LFS。
- **发布**：静态站点；后续需要上 Steam 时用 Tauri / Electron 包一层。

## 影响

- 原 Unity 工程骨架（PR #34）废弃；W1 #1（issue #7）改为 Web 工程骨架。
- W1 #2（issue #8）的 8 射线悬挂改用 Rapier ray cast 实现，不再有 WheelCollider。
- 没有引擎编辑器：测试场摆点（W2 #8）、座舱 blockout（W5 #19）需要自建工具或在 Blender 里完成。
- 浏览器可以直接分享试玩链接，录屏与外测成本降低；代价是资产/光照迭代更依赖代码与 Blender。
- 以 1080p 60 fps 为性能目标；移动端暂不作为目标。

## 风险

- 没有现成编辑器：地形、摆点、材质迭代更慢，W2 的摆点工具要更早投入。
- Rapier 没有高层车辆控制器；低速发飘、涉水穿模等问题仍要在射悬挂与摩擦模型里自己解决。
- 座舱内饰需要在 Blender 建低模并导入 glTF；比例与外模一致性的验收标准不变
  （见 `docs/cockpit-design.md`）。
- WebGL2 的渲染能力低于 URP 的完整特性集；后期/调色（W5 #21）需要用 three.js 后处理链实现。
