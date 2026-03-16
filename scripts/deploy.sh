# Deploy Sous Chef backend to Google Cloud Run (Gemini Live Agent Challenge).
# Requires: gcloud CLI, authenticated and project set.
#
# Before first run:
#   gcloud auth login
#   gcloud config set project YOUR_PROJECT_ID
#
# Set your project and optionally region/service name:
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

PROJECT_ID="${GOOGLE_CLOUD_PROJECT:-your-project-id}"
SERVICE_NAME="${SERVICE_NAME:-sous-chef-api}"
REGION="${REGION:-us-central1}"

# Backend env vars (required for Gemini Live on Vertex AI)
# GOOGLE_CLOUD_PROJECT and GOOGLE_CLOUD_LOCATION are required.
# Set GOOGLE_MAPS_API_KEY for place search and photos (required for Stores feature).
# GEMINI_* have defaults in code (assistant name, language, voice, etc.).
export GOOGLE_CLOUD_PROJECT="$PROJECT_ID"
export GOOGLE_CLOUD_LOCATION="${GOOGLE_CLOUD_LOCATION:-$REGION}"
export GEMINI_LIVE_MODEL="${GEMINI_LIVE_MODEL:-gemini-live-2.5-flash-native-audio}"

echo "Deploying $SERVICE_NAME to Cloud Run (project: $PROJECT_ID, region: $REGION)..."

cd "$REPO_ROOT/backend"

# Build env vars list (required + optional)
ENV_VARS="GOOGLE_CLOUD_PROJECT=$GOOGLE_CLOUD_PROJECT,GOOGLE_CLOUD_LOCATION=$GOOGLE_CLOUD_LOCATION,GEMINI_LIVE_MODEL=$GEMINI_LIVE_MODEL"
if [ -n "${GOOGLE_MAPS_API_KEY:-}" ]; then
  ENV_VARS="$ENV_VARS,GOOGLE_MAPS_API_KEY=$GOOGLE_MAPS_API_KEY"
else
  echo "Warning: GOOGLE_MAPS_API_KEY not set. Place search and photos will not work. Set it and re-run to include it in the deployment."
fi

gcloud run deploy "$SERVICE_NAME" \
  --source . \
  --region "$REGION" \
  --allow-unauthenticated \
  --project "$PROJECT_ID" \
  --set-env-vars "$ENV_VARS" \
  --quiet

echo "Done. Backend deployed."

