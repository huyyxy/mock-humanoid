# mock-humanoid 文档索引

## 产品与设计

- [mock-humanoid 需求文档](./requirements.md)：定义产品范围、页面布局、Stardust Realtime 接入、本地机器人技能、模拟世界、状态模型和验收标准。
- [内置 Realtime tools 契约](./tool-schemas.md)：8 个本地 function tools 的完整 Stardust 定义、参数约束和运行时合并规则。
- [内置演示场景契约](./demo-scene.md)：初始地点、人物、物体、放置面、巡逻路线、动作与表情别名。
- [场景控制面板布局](./control-panel.md)：位置点、路线编排和手动执行的页面结构与交互。
- [语音输入布局与行为](./voice-input.md)：Server VAD、Push to Talk 与浏览器 3A 的交互和协议契约。

## 推荐阅读顺序

1. 先读 [requirements.md](./requirements.md)，确定产品范围、交互和验收基线。
2. 实现场景、导航、G1 URDF 资产或模拟状态时，读 [demo-scene.md](./demo-scene.md)。
3. 实现 Stardust function tools、参数校验和 SDK 注册时，读 [tool-schemas.md](./tool-schemas.md)。

`requirements.md` 的版本号代表产品主契约版本；另外两份模块契约独立递增，并通过本文档记录当前配套版本。

## 当前配套组合

| 产品主契约 | 场景与资产契约 | Tools 契约 | 兼容状态 |
|---|---|---|---|
| `requirements 0.13` | `demo-scene 0.10` | `tool-schemas 0.8` | 当前唯一支持组合 |

本组合包含缺省 session tools 冲突规则、默认相机下 2D/3D 的南北方向统一，以及不改变规划虚线的人物动态局部避障。

## 已落地的契约检查

- `tests/contracts/aliases/`：动作与表情别名的契约测试。
- `tests/geometry.test.ts`：按 `0.05m` 栅格和 `0.40m` 障碍膨胀验证巡逻闭环、固定地点连通性、视线边界和 A* 循环内规划超时。
- `tests/assets.test.ts`：校验 G1 清单、许可证、URDF 引用和文件 SHA-256。
- `tests/realtime.test.ts`：覆盖连接状态机、`session.updated` 确认、异常断线、语音提交、转写显示、function call 去重及缓存上限。
- `tests/audio.test.ts`：验证 AudioWorklet、浏览器 3A、Push to Talk 暂停/恢复和零增益防回放链路。
- `tests/engine.test.ts`：覆盖参数边界、导航成功/规划超时、持续任务取消、交接确认、高亮过期与空闲 tick 发布行为。

## G1 资产交付状态

- `/assets/robots/unitree-g1/asset-manifest.json` 已落地，包含官方上游仓库、精确 commit、BSD-3-Clause 许可证及逐文件 SHA-256。
- G1 URDF、全部引用 mesh 与 `semantic-map.json` 均随 Docker 镜像从本地提供；加载失败时不回退到其他人形模型。

## 文档状态

| 文档 | 状态 | 最近更新 |
|---|---|---|
| [requirements.md](./requirements.md) | Draft 0.13 | 2026-07-22 |
| [tool-schemas.md](./tool-schemas.md) | Draft 0.8 | 2026-07-22 |
| [demo-scene.md](./demo-scene.md) | Draft 0.10 | 2026-07-22 |
| [control-panel.md](./control-panel.md) | Draft 0.1 | 2026-07-22 |
| [voice-input.md](./voice-input.md) | Draft 0.1 | 2026-07-22 |
