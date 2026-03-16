# Sous Chef — one-time setup after cloning the repo.
# Installs backend (Python venv + deps) and frontend (npm) so you can run the app.
#
# Run from repo root: ./setup-project.sh
# Requires: Bash (macOS/Linux, or Git Bash / WSL on Windows)

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

echo "Sous Chef — project setup"
echo "   Repo root: $REPO_ROOT"
echo ""

# --- Prerequisites (warn only) ---
check_cmd() {
  if command -v "$1" >/dev/null 2>&1; then
    echo "   [ok] $1 found"
    return 0
  else
    echo "   [missing] $1 not found (install it and re-run this script)"
    return 1
  fi
}

# Prefer python3, then py -3 (Windows), then python
PYTHON_CMD=""
find_python() {
  if command -v python3 >/dev/null 2>&1; then
    PYTHON_CMD="python3"
    echo "   [ok] python3 found"
    return 0
  elif command -v py >/dev/null 2>&1; then
    PYTHON_CMD="py -3"
    echo "   [ok] py -3 found"
    return 0
  elif command -v python >/dev/null 2>&1; then
    PYTHON_CMD="python"
    echo "   [ok] python found"
    return 0
  else
    echo "   [missing] Python 3 not found (install it and re-run this script)"
    return 1
  fi
}

MISSING=0
find_python || MISSING=1
check_cmd node   || MISSING=1
check_cmd npm    || MISSING=1
if [ "$MISSING" -ne 0 ]; then
  echo ""
  echo "Install Node.js 18+ and Python 3.12+ then run ./setup-project.sh again."
  exit 1
fi
echo ""

# --- Backend ---
echo "Backend (Python)"
cd "$REPO_ROOT/backend"

if [ ! -d ".venv" ]; then
  echo "   Creating virtualenv .venv ..."
  $PYTHON_CMD -m venv .venv
fi

echo "   Activating venv and installing dependencies ..."
. .venv/bin/activate 2>/dev/null || . .venv/Scripts/activate 2>/dev/null || true
$PYTHON_CMD -m pip install --quiet --upgrade pip
$PYTHON_CMD -m pip install --quiet -r requirements.txt

if [ ! -f ".env" ]; then
  if [ -f ".env.example" ]; then
    cp .env.example .env
    echo "Created .env from .env.example — edit backend/.env and set GOOGLE_CLOUD_PROJECT and GOOGLE_MAPS_API_KEY."
  else
    echo "No .env.example found; create backend/.env with GOOGLE_CLOUD_PROJECT and GOOGLE_CLOUD_LOCATION."
  fi
else
  echo ".env already exists; skipping."
fi

echo "Backend setup done."
echo ""

# --- Frontend ---
echo "Frontend (Node/npm)"
cd "$REPO_ROOT/frontend"

if [ -f "package.json" ]; then
  npm install
  echo "   Frontend setup done."
else
  echo "   No package.json in frontend/ — skipping npm install."
fi

echo ""
echo "Setup complete."
echo ""
echo "Next steps:"
echo "  1.Edit backend/.env and set:"
echo "       GOOGLE_CLOUD_PROJECT=your-gcp-project-id"
echo "       GOOGLE_CLOUD_LOCATION=us-central1"
echo "       GOOGLE_MAPS_API_KEY=your-maps-places-api-key"
echo ""
echo "  2.Start the backend (in one terminal):"
echo "       cd backend"
echo "       source .venv/bin/activate   # or .venv\Scripts\activate on Windows"
echo "       uvicorn main:app --reload --host 0.0.0.0 --port 8000" or python main.py
echo ""
echo "  3.Start the frontend (in another terminal):"
echo "       cd frontend"
echo "       npm start   # or: ng serve"
echo ""
echo "  4. Open http://localhost:4200 in your browser."
echo ""
