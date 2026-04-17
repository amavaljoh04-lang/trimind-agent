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

# Read config values
BACKEND_PORT=8000
FRONTEND_PORT=5173

if command -v python3 &>/dev/null && [ -f "$CONFIG_FILE" ]; then
    BACKEND_PORT=$(python3 -c "
import yaml
with open('$CONFIG_FILE') as f:
    c = yaml.safe_load(f)
print(c.get('server', {}).get('port', 8000))
" 2>/dev/null || echo 8000)
    FRONTEND_PORT=$(python3 -c "
import yaml
with open('$CONFIG_FILE') as f:
    c = yaml.safe_load(f)
print(c.get('server', {}).get('frontend_port', 5173))
" 2>/dev/null || echo 5173)
fi

# Ensure data & workspace directories exist
mkdir -p "$SCRIPT_DIR/data" "$SCRIPT_DIR/workspace"

# Check Ollama
echo -e "${BLUE}[1/4]${RESET} Checking Ollama..."
if curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
    MODEL_COUNT=$(curl -s http://localhost:11434/api/tags | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('models',[])))" 2>/dev/null || echo "?")
    echo -e "  ${GREEN}✓${RESET} Ollama is running ($MODEL_COUNT models available)"
else
    echo -e "  ${PURPLE}!${RESET} Ollama not detected at localhost:11434"
    echo -e "  ${PURPLE}!${RESET} Install: curl -fsSL https://ollama.com/install.sh | sh"
    echo -e "  ${PURPLE}!${RESET} Continuing anyway — configure Ollama URL in settings"
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

# Start backend
if [ "$RUN_BACKEND" = true ]; then
    echo -e "${BLUE}[2/4]${RESET} Installing backend dependencies..."
    cd "$SCRIPT_DIR/backend"
    poetry install --quiet 2>/dev/null || poetry install

    echo -e "${BLUE}[3/4]${RESET} Starting backend on port $BACKEND_PORT..."
    TRIMIND_CONFIG="$CONFIG_FILE" poetry run fastapi run app/main.py --port "$BACKEND_PORT" &
    BACKEND_PID=$!
    sleep 2
fi

# Start frontend
if [ "$RUN_FRONTEND" = true ]; then
    echo -e "${BLUE}[4/4]${RESET} Starting frontend on port $FRONTEND_PORT..."
    cd "$SCRIPT_DIR/frontend"
    npm install --silent 2>/dev/null || npm install

    # Write .env with correct backend URL
    echo "VITE_API_URL=http://localhost:$BACKEND_PORT" > .env
    echo "VITE_WS_URL=ws://localhost:$BACKEND_PORT" >> .env

    npx vite --port "$FRONTEND_PORT" --host &
    FRONTEND_PID=$!
fi

echo ""
echo -e "${GREEN}${BOLD}TriMind Agent is running!${RESET}"
echo -e "  ${CYAN}Frontend:${RESET}  http://localhost:$FRONTEND_PORT"
echo -e "  ${CYAN}Backend:${RESET}   http://localhost:$BACKEND_PORT"
echo -e "  ${CYAN}API Docs:${RESET}  http://localhost:$BACKEND_PORT/docs"
echo ""
echo -e "${PURPLE}Press Ctrl+C to stop${RESET}"

# Wait for processes
wait
