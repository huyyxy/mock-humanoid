# mock-humanoid

运行在单个 Docker 容器中的网页人形机器人模拟器，通过 Stardust Realtime 获得对话和本地工具调用能力。模拟世界包含 2D 导航、3D 点云、宇树 G1 URDF 机器人、物体操作、人物跟随、身体动作和脸部灯效表情。

页面内的“场景控制”支持临时新增位置点、按顺序编排路线、手动前往位置点和执行路线；这些配置仅存在于当前页面内存，重置或刷新后恢复内置场景。

项目不包含注册、登录、多人协作或持久化；刷新页面会重置会话与模拟世界。

## 文档

从 [文档索引](./docs/INDEX.md) 开始，推荐依次阅读：

1. [需求文档](./docs/requirements.md)
2. [内置演示场景契约](./docs/demo-scene.md)
3. [Realtime tools 契约](./docs/tool-schemas.md)

G1 URDF、mesh、许可证和来源清单是实现交付的必需资产；具体契约见[机器人初始状态与模型资产](./docs/demo-scene.md#3-机器人初始状态与模型资产)。

## 本地运行

需要 Node.js 22 和 pnpm 10：

```bash
pnpm install
cp .env.example .env
pnpm dev
```

打开 `http://localhost:3000`。`VITE_STARDUST_GROUP_ID` 和 `VITE_STARDUST_ROBOT_ID` 未配置时，场景、2D/3D 数字孪生和本地状态仍可查看，Realtime 连接按钮会禁用。

主要环境变量：

| 名称 | 必需 | 默认值 | 用途 |
|---|---|---|---|
| `VITE_STARDUST_GROUP_ID` | 是 | — | Stardust group ID |
| `VITE_STARDUST_ROBOT_ID` | 是 | — | 模拟机器人 ID |
| `VITE_STARDUST_BASE_URL` | 否 | `wss://stardust.ticos.cn` | Realtime WebSocket 基地址 |
| `PORT` | 否 | `3000` | Web 服务端口 |

## 验证与构建

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm start
```

生产构建由同一个 Express 进程提供前端、运行时配置接口和健康检查：

- `GET /healthz`
- `GET /api/runtime-config`（`Cache-Control: no-store`）

## Docker

使用脚本构建并启动（镜像仓库与 stardust-all 中其他项目保持一致）：

```bash
cp .env.example .env
# 编辑 .env，填写实际的 Stardust group ID 和 robot ID
./docker_build.sh -v 1.0.0
./docker_run.sh -v 1.0.0
```

`docker_build.sh` 支持 `-m build|push|all`（默认 `build`），上传时需提供 `-p <仓库密码>`。镜像名称为 `ccr.ccs.tencentyun.com/huyyxy/mock-humanoid:<version>`。

`docker_run.sh` 支持 `-m pull|run|all`（默认 `run`）、`-n <容器名称>` 和 `-p <宿主机端口>`（默认 `3000`）。脚本可在任意目录调用，运行时只读挂载项目目录下的 `.env`，容器内端口固定为 `3000`，不受 `.env` 中 `PORT` 的影响。启动时会停止并删除同名容器，再以自动重启策略运行新容器。没有 `.env` 也可以启动并查看模拟场景，但无法连接 Realtime。

```bash
# 构建并推送
./docker_build.sh -v 1.0.0 -m all -p '<仓库密码>'
# 拉取并运行，使用自定义容器名和端口
./docker_run.sh -v 1.0.0 -m all -n my-mock-humanoid -p 8080
```

也可以直接使用 Docker 命令：

```bash
docker build -t mock-humanoid .
docker run --rm -p 3000:3000 \
  -e VITE_STARDUST_GROUP_ID=your-group \
  -e VITE_STARDUST_ROBOT_ID=mock-g1 \
  mock-humanoid
```

## 实现导航

- `src/world/`：确定性 A*、模拟状态机、任务调度和 8 个技能
- `src/realtime/`：Stardust Realtime、PCM16 24kHz 音频和 function call 适配
- `src/components/`：2D 导航地图与基于真实 G1 URDF 的 3D 点云视图
- `public/assets/robots/unitree-g1/`：G1 URDF、mesh、语义映射、许可证和校验清单
- `tests/`：规划、技能、别名和资产完整性测试
