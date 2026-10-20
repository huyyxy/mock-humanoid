#!/bin/bash
set -euo pipefail

usage() {
    cat <<EOF
Usage: $0 -v <version> [-n <container_name>] [-m <mode>] [-p <port>]

参数说明:
  -v, --version   镜像版本号 (必填)
  -n, --name      容器名称 (默认: mock-humanoid)
  -m, --mode      pull - 仅拉取, run - 仅运行 (默认), all - 拉取并运行
  -p, --port      宿主机端口 (默认: 3000，容器内固定为 3000)
  -h, --help      显示帮助信息

运行时挂载脚本所在目录的 .env；同名容器会先停止并删除。
未找到 .env 时仍可查看模拟场景，Realtime 连接不可用。

示例:
  $0 -v 1.0.0
  $0 -v 1.0.0 -m pull
  $0 -v 1.0.0 -m all -n my-mock-humanoid -p 8080
EOF
}

fail() {
    echo "错误: $*" >&2
    exit 1
}

VERSION=""
CONTAINER_NAME="mock-humanoid"
MODE="run"
HOST_PORT="3000"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

while [[ $# -gt 0 ]]; do
    case "$1" in
        -v|--version|-n|--name|-m|--mode|-p|--port)
            [[ $# -ge 2 && -n "$2" && "$2" != -* ]] || fail "$1 需要提供参数值"
            case "$1" in
                -v|--version) VERSION="$2" ;;
                -n|--name) CONTAINER_NAME="$2" ;;
                -m|--mode) MODE="$2" ;;
                -p|--port) HOST_PORT="$2" ;;
            esac
            shift 2
            ;;
        -h|--help) usage; exit 0 ;;
        *) fail "未知参数: $1 (使用 --help 查看帮助)" ;;
    esac
done

[[ "$VERSION" =~ ^[a-zA-Z0-9_][a-zA-Z0-9_.-]{0,127}$ ]] || fail "请通过 -v 提供有效的镜像版本号"
[[ "$CONTAINER_NAME" =~ ^[a-zA-Z0-9][a-zA-Z0-9_.-]*$ ]] || fail "无效的容器名称"
[[ "$HOST_PORT" =~ ^[0-9]{1,5}$ ]] || fail "宿主机端口必须为 1–65535 之间的整数"
HOST_PORT=$((10#$HOST_PORT))
(( HOST_PORT >= 1 && HOST_PORT <= 65535 )) || fail "宿主机端口必须为 1–65535 之间的整数"
case "$MODE" in
    pull|run|all) ;;
    *) fail "无效的模式 '$MODE'，可选值: pull, run, all" ;;
esac
command -v docker >/dev/null 2>&1 || fail "未找到 Docker，请先安装 Docker"

IMAGE_NAME="ccr.ccs.tencentyun.com/huyyxy/mock-humanoid:${VERSION}"

do_pull() {
    echo ">>> 拉取镜像: ${IMAGE_NAME}"
    docker pull "$IMAGE_NAME"
    echo ">>> 拉取完成: ${IMAGE_NAME}"
}

do_run() {
    local env_args=()
    if [[ -f "${SCRIPT_DIR}/.env" ]]; then
        env_args=(-v "${SCRIPT_DIR}/.env:/app/.env:ro")
    else
        echo ">>> 提示: 未找到 ${SCRIPT_DIR}/.env，Realtime 连接不可用；可参考 .env.example 创建配置。"
    fi

    local containers
    containers="$(docker ps -a --format '{{.Names}}')"
    if printf '%s\n' "$containers" | grep -Fxq -- "$CONTAINER_NAME"; then
        echo ">>> 已存在容器 ${CONTAINER_NAME}，先停止并删除..."
        docker stop "$CONTAINER_NAME"
        docker rm "$CONTAINER_NAME"
    fi

    echo ">>> 运行容器: ${CONTAINER_NAME} (镜像: ${IMAGE_NAME})"
    # 显式固定容器端口，避免 .env 中的 PORT 与端口映射不一致。
    docker run -d \
        --name "$CONTAINER_NAME" \
        -p "${HOST_PORT}:3000" \
        -e PORT=3000 \
        ${env_args[@]+"${env_args[@]}"} \
        --restart always \
        "$IMAGE_NAME"
    echo ">>> 容器已启动，可访问 http://localhost:${HOST_PORT}"
}

case "$MODE" in
    pull) do_pull ;;
    run) do_run ;;
    all) do_pull; do_run ;;
esac
