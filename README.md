# superagent｜越野灰盒原型

“一辆车、一段烂路、一根绞盘”的越野灰盒原型（Unity 6 + URP）。
设计与排期见 `docs/`，其中：

- `docs/production-plan.md`：阶段与门禁
- `docs/sprint-w1-w6.md`：W1–W6 任务与验收
- `docs/winch-design.md`：W3 绞盘详细设计
- `docs/cockpit-design.md`：座舱硬性要求

## 环境

| 项 | 版本 / 说明 |
|---|---|
| Unity | **6000.3.27f2**（Unity 6.3 LTS，版本锁定，禁止中途升级大版本） |
| 渲染管线 | URP（编辑器内置版本） |
| 输入 | Input System |
| 版本管理 | Git + Git LFS（美术资产） |

## 第一次打开（目标：15 分钟内进入 Play）

1. 安装 [Unity Hub](https://unity.com/download)，在 Hub 中安装 **Unity 6000.3.27f2**。
2. 安装并初始化 Git LFS：

   ```bash
   brew install git-lfs        # macOS；其他平台见 https://git-lfs.com
   git lfs install
   ```

3. clone 本仓库。仓库根目录**就是** Unity 工程根目录（`Assets/`、`Packages/`、`ProjectSettings/` 都在根目录）。
4. Unity Hub → `Add project from disk` → 选择仓库根目录 → 用 6000.3.27f2 打开。
5. 首次打开会导入包。若 Unity 提示把 URP 等内置包升级到当前编辑器版本，选择继续/升级（正常流程）；完成后把 `Packages/manifest.json` 与 `Packages/packages-lock.json` 的变化一起提交。
6. 打开 `Assets/Scenes/SampleScene.unity`，点 Play。

## 工程约定

- **物理固定步长 60 Hz**：`ProjectSettings/TimeManager.asset`（Fixed Timestep = `0.016666668`）。
- **输入**：只启用 Input System；默认可编辑映射在 `Assets/InputSystem_Actions.inputactions`（手柄 + 键鼠，Player/UI 两套 Action Map）。
- **渲染**：URP；`Assets/Settings/` 内是 PC / Mobile 两套管线资产，画质档在 `ProjectSettings/QualitySettings.asset` 切换。
- **目录结构**：

  ```
  Assets/
    Game/
      Core/       # 启动、服务、通用框架
      Vehicle/    # 车辆、悬挂、动力、相机
      Terrain/    # 地形、路面、测试场
      Tools/      # 绞盘、木板、千斤顶、维修包、编辑器工具
      UI/         # HUD、工具轮盘、设置
    Scenes/       # 工程场景
    Settings/     # URP 管线与全局设置
  ```

- **美术资产走 Git LFS**：规则见 `.gitattributes`（fbx/贴图/音频/视频等）。
- **不要提交** `Library/`、`Temp/`、`Logs/`、`UserSettings/` 等生成目录，见 `.gitignore`。

## W1 / issue #7 验收

- 新成员 clone 后 15 分钟内能打开工程并进入 Play；
- 工程无编译警告。
