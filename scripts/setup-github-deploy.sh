#!/usr/bin/env bash
# Configuration unique du déploiement sans clé depuis GitHub Actions (Workload Identity Federation).
# À exécuter une seule fois dans Google Cloud Shell (https://shell.cloud.google.com), avec le compte
# propriétaire du projet Firebase. Idempotent : peut être relancé sans risque.
set -euo pipefail

PROJECT_ID="baudouinheren3"
REPO="CoherenceSolution/BaudouinH3"
SA_NAME="github-deploy"
POOL="github"
PROVIDER="github"

gcloud config set project "$PROJECT_ID"
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
SA="$SA_NAME@$PROJECT_ID.iam.gserviceaccount.com"

echo "▶ Activation des API nécessaires"
gcloud services enable iam.googleapis.com iamcredentials.googleapis.com sts.googleapis.com \
  cloudresourcemanager.googleapis.com firebase.googleapis.com firebasehosting.googleapis.com \
  firebaserules.googleapis.com serviceusage.googleapis.com

echo "▶ Compte de service de déploiement"
gcloud iam service-accounts describe "$SA" >/dev/null 2>&1 || \
  gcloud iam service-accounts create "$SA_NAME" --display-name="GitHub deploy"

for ROLE in roles/firebase.admin roles/serviceusage.serviceUsageConsumer roles/serviceusage.apiKeysViewer; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:$SA" --role="$ROLE" --quiet >/dev/null
done

echo "▶ Fédération d'identité GitHub"
gcloud iam workload-identity-pools describe "$POOL" --location=global >/dev/null 2>&1 || \
  gcloud iam workload-identity-pools create "$POOL" --location=global --display-name="GitHub Actions"

gcloud iam workload-identity-pools providers describe "$PROVIDER" --location=global --workload-identity-pool="$POOL" >/dev/null 2>&1 || \
  gcloud iam workload-identity-pools providers create-oidc "$PROVIDER" \
    --location=global --workload-identity-pool="$POOL" --display-name="GitHub" \
    --issuer-uri="https://token.actions.githubusercontent.com" \
    --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
    --attribute-condition="assertion.repository == '$REPO'"

gcloud iam service-accounts add-iam-policy-binding "$SA" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/$POOL/attribute.repository/$REPO" \
  --quiet >/dev/null

echo
echo "✅ Terminé."
echo "   Projet          : $PROJECT_ID (numéro $PROJECT_NUMBER)"
echo "   Compte de service: $SA"
echo "   Fournisseur      : projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/$POOL/providers/$PROVIDER"
echo "   Le dépôt GitHub $REPO peut maintenant déployer sans clé."
