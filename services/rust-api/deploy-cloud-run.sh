#!/usr/bin/env sh
set -eu

: "${GCP_PROJECT_ID:?Define GCP_PROJECT_ID}"
: "${GCP_REGION:=southamerica-east1}"
: "${SERVICE_NAME:=mis-finanzas-api}"
: "${IMAGE:=gcr.io/${GCP_PROJECT_ID}/${SERVICE_NAME}}"

gcloud builds submit --project "$GCP_PROJECT_ID" --config cloudbuild.yaml --substitutions "_IMAGE=$IMAGE" .
gcloud run deploy "$SERVICE_NAME" --project "$GCP_PROJECT_ID" --region "$GCP_REGION" --image "$IMAGE" --platform managed --port 8080 --min-instances 0 --max-instances 2 --memory 256Mi --cpu 1 --set-secrets DATABASE_URL=DATABASE_URL:latest,ALLOWED_ORIGIN=ALLOWED_ORIGIN:latest,R2_ENDPOINT=R2_ENDPOINT:latest,R2_BUCKET=R2_BUCKET:latest,AWS_ACCESS_KEY_ID=AWS_ACCESS_KEY_ID:latest,AWS_SECRET_ACCESS_KEY=AWS_SECRET_ACCESS_KEY:latest
