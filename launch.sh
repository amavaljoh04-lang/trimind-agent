#!/usr/bin/env bash
# TriMind Agent — Single command launcher
# Usage: ./launch.sh [--backend-only] [--frontend-only]
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONFIG_FILE="$SCRIPT_DIR/config.yaml"

# Colors
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
RESET='\033[0m'
BOLD='\033[1m'

echo -e "${PURPLE}${BOLD}"
echo "  ████████╗██████╗ ██╗███╗   ███╗██╗███╗   ██╗██████╗ "
echo "  ╚══██╔══╝██╔══██╗██║████╗ ████║██║████╗  ██║██╔══██╗"
echo "     ██║   ██████╔╝██║██╔████╔██║██║██╔██╗ ██║██║  ██║"
echo "     ██║   ██╔══██╗██║██║╚██╔╝██║██║██║╚██╗██║██║  ██║"
echo "     ██║   ██║  ██║██║██║ ╚═╝ ██║██║██║ ╚████║██████╔╝"
echo "     ╚═╝   ╚═╝  ╚═╝╚═╝╚═╝     ╚═╝╚═╝╚═╝  ╚═══╝╚═════╝ "
echo -e "${RESET}"
echo -e "${CYAN}  3 AI Minds in Symbiosis${RESET}"
echo ""

# ─── Helper: check if command exists ───
has_cmd() { command -v "$1" &>/dev/null; }

# ─── Step 0: Auto-install prerequisites ───
echo -e "${BLUE}[0/5]${RESET} Checking prerequisites..."

# Python3
if ! has_cmd python3; then
    echo -e "  ${RED}✗${RESET} python3 not found. Please install Python 3.10+ first."
    echo -e "    sudo apt install python3 python3-pip python3-venv"
    exit 1
fi
echo -e "  ${GREEN}✓${RESET} Python3 $(python3 --version 2>&1 | awk '{print $2}')"

# pip
if ! has_cmd pip3 && ! has_cmd pip; then
    echo -e "  ${YELLOW}!${RESET} pip not found, installing..."
    sudo apt-get update -qq && sudo apt-get install -y -qq python3-pip >/dev/null 2>&1
fi

# python3-venv (needed for venv creation)
if ! python3 -m venv --help &>/dev/null; then
    PY_VER=$(python3 -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
    echo -e "  ${YELLOW}!${RESET} python3-venv not found, installing python${PY_VER}-venv..."
    sudo apt-get update -qq
    sudo apt-get install -y -qq "python${PY_VER}-venv" python3-venv >/dev/null 2>&1 || \
    sudo apt-get install -y -qq python3-venv >/dev/null 2>&1
fi
echo -e "  ${GREEN}✓${RESET} pip / venv ready"

# Node.js & npm
if ! has_cmd node || ! has_cmd npm; then
    echo -e "  ${YELLOW}!${RESET} Node.js/npm not found, installing..."
    if has_cmd curl; then
        curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - >/dev/null 2>&1
        sudo apt-get install -y -qq nodejs >/dev/null 2>&1
    else
        sudo apt-get update -qq && sudo apt-get install -y -qq nodejs npm >/dev/null 2>&1
    fi
    if ! has_cmd node; then
        echo -e "  ${RED}✗${RESET} Node.js installation failed. Install manually:"
        echo -e "    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -"
        echo -e "    sudo apt-get install -y nodejs"
        exit 1
    fi
    echo -e "  ${GREEN}✓${RESET} Node.js installed"
else
    echo -e "  ${GREEN}✓${RESET} Node.js $(node --version) / npm $(npm --version)"
fi

# PyYAML for config parsing
python3 -c "import yaml" 2>/dev/null || pip3 install pyyaml -q 2>/dev/null || pip install pyyaml -q 2>/dev/null

# ─── Step 1: Ask for ports ───
echo ""

# Read defaults from config.yaml
DEFAULT_BACKEND_PORT=8000
DEFAULT_FRONTEND_PORT=5173

if [ -f "$CONFIG_FILE" ]; then
    DEFAULT_BACKEND_PORT=$(python3 -c "
import yaml
with open('$CONFIG_FILE') as f:
    c = yaml.safe_load(f)
print(c.get('server', {}).get('port', 8000))
" 2>/dev/null || echo 8000)
    DEFAULT_FRONTEND_PORT=$(python3 -c "
import yaml
with open('$CONFIG_FILE') as f:
    c = yaml.safe_load(f)
print(c.get('server', {}).get('frontend_port', 5173))
" 2>/dev/null || echo 5173)
fi

echo -e "${CYAN}Configuration des ports${RESET}"
echo -e "  (Appuyez sur Entree pour garder la valeur par defaut)"
echo ""

read -rp "  Port backend  [$DEFAULT_BACKEND_PORT]: " INPUT_BACKEND_PORT
BACKEND_PORT="${INPUT_BACKEND_PORT:-$DEFAULT_BACKEND_PORT}"

read -rp "  Port frontend [$DEFAULT_FRONTEND_PORT]: " INPUT_FRONTEND_PORT
FRONTEND_PORT="${INPUT_FRONTEND_PORT:-$DEFAULT_FRONTEND_PORT}"

echo ""
echo -e "  ${GREEN}✓${RESET} Backend  -> 0.0.0.0:${BACKEND_PORT}"
echo -e "  ${GREEN}✓${RESET} Frontend -> 0.0.0.0:${FRONTEND_PORT}"

# Get local IP for display
LOCAL_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "localhost")

# Ensure data & workspace directories exist
mkdir -p "$SCRIPT_DIR/data" "$SCRIPT_DIR/workspace"

# ─── Step 2: Check Ollama ───
echo ""
echo -e "${BLUE}[1/4]${RESET} Checking Ollama..."
OLLAMA_URL="http://localhost:11434"
if [ -f "$CONFIG_FILE" ]; then
    OLLAMA_URL=$(python3 -c "
import yaml
with open('$CONFIG_FILE') as f:
    c = yaml.safe_load(f)
print(c.get('ollama', {}).get('url', 'http://localhost:11434'))
" 2>/dev/null || echo "http://localhost:11434")
fi

if curl -s "$OLLAMA_URL/api/tags" > /dev/null 2>&1; then
    MODEL_COUNT=$(curl -s "$OLLAMA_URL/api/tags" | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('models',[])))" 2>/dev/null || echo "?")
    echo -e "  ${GREEN}✓${RESET} Ollama is running at $OLLAMA_URL ($MODEL_COUNT models available)"
else
    echo -e "  ${YELLOW}!${RESET} Ollama not detected at $OLLAMA_URL"
    echo -e "  ${YELLOW}!${RESET} Install: curl -fsSL https://ollama.com/install.sh | sh"
    echo -e "  ${YELLOW}!${RESET} Then pull a model: ollama pull qwen2.5-coder:14b"
    echo -e "  ${YELLOW}!${RESET} Continuing anyway — configure Ollama URL in settings"
fi

# Parse arguments
RUN_BACKEND=true
RUN_FRONTEND=true
if [ "$1" = "--backend-only" ]; then
    RUN_FRONTEND=false
elif [ "$1" = "--frontend-only" ]; then
    RUN_BACKEND=false
fi

# Cleanup function
cleanup() {
    echo ""
    echo -e "${BLUE}Shutting down TriMind Agent...${RESET}"
    kill $BACKEND_PID 2>/dev/null || true
    kill $FRONTEND_PID 2>/dev/null || true
    wait 2>/dev/null
    echo -e "${GREEN}Done.${RESET}"
}
trap cleanup EXIT INT TERM

# ─── Step 3: Start backend ───
if [ "$RUN_BACKEND" = true ]; then
    echo -e "${BLUE}[2/4]${RESET} Installing backend dependencies..."
    cd "$SCRIPT_DIR/backend"

    # Create venv if it doesn't exist or is broken
    if [ ! -f ".venv/bin/activate" ]; then
        echo -e "  ${CYAN}i${RESET} Creating virtual environment..."
        rm -rf .venv 2>/dev/null
        python3 -m venv .venv
        if [ ! -f ".venv/bin/activate" ]; then
            echo -e "  ${RED}✗${RESET} Failed to create virtual environment."
            echo -e "    Try: sudo apt install python3.12-venv"
            exit 1
        fi
    fi

    # Activate venv and install deps
    source .venv/bin/activate
    echo -e "  ${CYAN}i${RESET} Installing packages (first time may take 1-2 min)..."
    pip install -r requirements.txt -q 2>&1 | tail -3
    echo -e "  ${GREEN}✓${RESET} Backend dependencies installed"

    echo -e "${BLUE}[3/4]${RESET} Starting backend on 0.0.0.0:$BACKEND_PORT..."
    TRIMIND_CONFIG="$CONFIG_FILE" .venv/bin/python -m fastapi run app/main.py --host 0.0.0.0 --port "$BACKEND_PORT" &
    BACKEND_PID=$!
    sleep 2
fi

# ─── Step 4: Start frontend ───
if [ "$RUN_FRONTEND" = true ]; then
    echo -e "${BLUE}[4/4]${RESET} Starting frontend on 0.0.0.0:$FRONTEND_PORT..."
    cd "$SCRIPT_DIR/frontend"
    npm install --silent 2>/dev/null || npm install

    # Write .env with backend port (frontend auto-detects hostname)
    echo "VITE_BACKEND_PORT=$BACKEND_PORT" > .env

    npx vite --port "$FRONTEND_PORT" --host 0.0.0.0 &
    FRONTEND_PID=$!
fi

echo ""
echo -e "${GREEN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "${GREEN}${BOLD}  TriMind Agent is running!${RESET}"
echo -e "${GREEN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo ""
echo -e "  ${CYAN}Frontend (local):${RESET}   http://localhost:$FRONTEND_PORT"
echo -e "  ${CYAN}Frontend (network):${RESET} http://${LOCAL_IP}:$FRONTEND_PORT"
echo -e "  ${CYAN}Backend  (local):${RESET}   http://localhost:$BACKEND_PORT"
echo -e "  ${CYAN}Backend  (network):${RESET} http://${LOCAL_IP}:$BACKEND_PORT"
echo -e "  ${CYAN}API Docs:${RESET}           http://${LOCAL_IP}:$BACKEND_PORT/docs"
echo ""
echo -e "${PURPLE}Press Ctrl+C to stop${RESET}"

# Wait for processes
wait
