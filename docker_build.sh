#!/bin/bash
set -euo pipefail

usage() {
    cat <<EOF
Usage: $0 -v <version> [-m <mode>] [-p <password>]

参数说明:
  -v, --version   镜像版本号 (必填)
  -m, --mode      build - 仅构建 (默认), push - 仅上传, all - 构建并上传
  -p, --password  Docker 登录密码 (上传模式时必填)
  -h, --help      显示帮助信息

示例:
  $0 -v 1.0.0
  $0 -v 1.0.0 -m push -p xxx
  $0 -v 1.0.0 -m all -p xxx
EOF
}

fail() {
    echo "错误: $*" >&2
    exit 1
}

VERSION=""
PASSWORD=""
MODE="build"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

while [[ $# -gt 0 ]]; do
    case "$1" in
        -v|--version|-p|--password|-m|--mode)
            [[ $# -ge 2 && -n "$2" && "$2" != -* ]] || fail "$1 需要提供参数值"
            case "$1" in
                -v|--version) VERSION="$2" ;;
                -p|--password) PASSWORD="$2" ;;
                -m|--mode) MODE="$2" ;;
            esac
            shift 2
            ;;
        -h|--help) usage; exit 0 ;;
        *) fail "未知参数: $1 (使用 --help 查看帮助)" ;;
    esac
done

[[ "$VERSION" =~ ^[a-zA-Z0-9_][a-zA-Z0-9_.-]{0,127}$ ]] || fail "请通过 -v 提供有效的镜像版本号"
case "$MODE" in
    build|push|all) ;;
    *) fail "无效的模式 '$MODE'，可选值: build, push, all" ;;
esac
if [[ "$MODE" != "build" && -z "$PASSWORD" ]]; then
    fail "上传模式需要提供密码参数 (-p)"
fi
command -v docker >/dev/null 2>&1 || fail "未找到 Docker，请先安装 Docker"

IMAGE_NAME="ccr.ccs.tencentyun.com/huyyxy/mock-humanoid:${VERSION}"

do_build() {
    echo ">>> 开始构建镜像: ${IMAGE_NAME}"
    docker build -t "$IMAGE_NAME" "$SCRIPT_DIR"
    echo ">>> 构建完成: ${IMAGE_NAME}"
}

do_push() {
    echo ">>> 登录 Docker 仓库..."
    printf '%s\n' "$PASSWORD" | docker login ccr.ccs.tencentyun.com --username=100011783411 --password-stdin
    echo ">>> 推送镜像: ${IMAGE_NAME}"
    docker push "$IMAGE_NAME"
    echo ">>> 上传完成: ${IMAGE_NAME}"
}

case "$MODE" in
    build) do_build ;;
    push) do_push ;;
    all) do_build; do_push ;;
esac
