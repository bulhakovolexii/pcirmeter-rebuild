#!/usr/bin/env bash
# Restore the research toolchain in a fresh sandbox (linux/arm64). Idempotent.
# Usage: bash tools/setup_sandbox.sh
set -euo pipefail

TOOLS=/home/agent/tools
GHIDRA_VER=12.1.4
GHIDRA_DIR=$TOOLS/ghidra_${GHIDRA_VER}_PUBLIC
GHIDRA_ZIP_URL=https://github.com/NationalSecurityAgency/ghidra/releases/download/Ghidra_${GHIDRA_VER}_build/ghidra_${GHIDRA_VER}_PUBLIC_20260921.zip
ENV_FILE=/etc/sandbox-persistent.sh

add_env() { grep -qxF "$1" "$ENV_FILE" || echo "$1" >> "$ENV_FILE"; }

sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq 7zip file binutils unzip \
  openjdk-21-jdk-headless bison flex zlib1g-dev poppler-utils >/dev/null
# LibreOffice без GUI — перевірка ODT-звіту: soffice --headless --convert-to pdf report.odt
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends libreoffice-writer-nogui \
  fonts-liberation >/dev/null

# Ghidra + native decompiler for linux/arm64 (not shipped in the release)
if [ ! -d "$GHIDRA_DIR" ]; then
  mkdir -p "$TOOLS"
  curl -sL -o "$TOOLS/ghidra.zip" "$GHIDRA_ZIP_URL"
  unzip -q "$TOOLS/ghidra.zip" -d "$TOOLS" && rm "$TOOLS/ghidra.zip"
fi
DECOMP=$GHIDRA_DIR/Ghidra/Features/Decompiler
if [ ! -x "$DECOMP/os/linux_arm_64/decompile" ]; then
  (cd "$DECOMP/src/decompile/cpp" && mkdir -p ghi_opt sla_opt com_opt \
    && make -j"$(nproc)" ARCH=aarch64 ARCH_TYPE= ghidra_opt sleigh_opt >/dev/null)
  mkdir -p "$DECOMP/os/linux_arm_64"
  cp "$DECOMP/src/decompile/cpp/ghidra_opt" "$DECOMP/os/linux_arm_64/decompile"
  cp "$DECOMP/src/decompile/cpp/sleigh_opt" "$DECOMP/os/linux_arm_64/sleigh"
fi
add_env "export GHIDRA_INSTALL_DIR=$GHIDRA_DIR"

# .NET SDK + ilspycmd
if [ ! -x /home/agent/.dotnet/dotnet ]; then
  curl -sSL -o /tmp/dotnet-install.sh https://dot.net/v1/dotnet-install.sh
  bash /tmp/dotnet-install.sh --channel 8.0 --install-dir /home/agent/.dotnet >/dev/null
fi
add_env 'export DOTNET_ROOT=/home/agent/.dotnet'
add_env 'export PATH="$PATH:/home/agent/.dotnet:/home/agent/.dotnet/tools"'
add_env 'export DOTNET_ROLL_FORWARD=Major'
export DOTNET_ROOT=/home/agent/.dotnet PATH="$PATH:/home/agent/.dotnet:/home/agent/.dotnet/tools"
dotnet tool list -g | grep -q ilspycmd || dotnet tool install -g ilspycmd --version 8.2.0.7535 >/dev/null

# REA MCP registration for Claude Code (restart the session afterwards)
GHIDRA_INSTALL_DIR=$GHIDRA_DIR npx -y rea-agents@6.7.0 setup --client claude_code --yes >/dev/null

# Playwright + headless Chromium for UI screenshots (tools/ui_screens.mjs). Ubuntu 26.04 is not on Playwright's
# list — take the ubuntu24.04-arm64 build and install its shared libraries by hand.
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq libatk1.0-0t64 libatspi2.0-0t64 libx11-6 \
  libxcomposite1 libxdamage1 libxext6 libxfixes3 libxrandr2 libgbm1 libxcb1 libxkbcommon0 libnss3 \
  libasound2t64 >/dev/null
if [ ! -d "$TOOLS/playwright/node_modules/playwright" ]; then
  mkdir -p "$TOOLS/playwright"
  (cd "$TOOLS/playwright" && npm init -y >/dev/null && npm install --silent playwright@1.56.1)
fi
(cd "$TOOLS/playwright" && PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=ubuntu24.04-arm64 \
  npx playwright install chromium-headless-shell >/dev/null)

# Proprietary inputs (kept out of git)
ROOT=$(cd "$(dirname "$0")/.." && pwd)
if [ -f "$ROOT/Setup.exe" ] && [ ! -d "$ROOT/reference/original" ]; then
  7z x -y -o"$ROOT/reference/original" "$ROOT/Setup.exe" >/dev/null
fi

echo "OK. Restart Claude Code so the REA MCP server is picked up."
