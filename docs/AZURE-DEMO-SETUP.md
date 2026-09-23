# Azure Demo Setup — Fast Path

A condensed path to get a live, client-shareable URL on Azure, sized for a demo call
rather than production. ~20 minutes of `az` commands plus provisioning wait time.

This trims the full runbook in [`AZURE-DEPLOYMENT.md`](AZURE-DEPLOYMENT.md) — skips the
custom domain, managed identity, Key Vault, and HA sections, which don't matter for a
call you're driving yourself. Once you're on the URL, drive the walkthrough from
[`DEMO-SCRIPT.md`](DEMO-SCRIPT.md).

**Read the two callouts below before running anything** — they're the two ways this
goes wrong mid-call.

---

## Before you start

- You're on the **Azure free trial**: $200 credit, 30 days, and Container Apps /
  PostgreSQL B1ms / a Standard registry are free for the durations in the full
  runbook's ["Running this on the Azure free trial"](AZURE-DEPLOYMENT.md#running-this-on-the-azure-free-trial)
  section. Nothing below costs anything if the trial hasn't expired.
- **Schedule the demo for well before day 30.** At day 30 Azure disables the
  subscription outright — not a soft warning, the app goes down. Leave a buffer.
- `az login` with the account the trial is on, and confirm you're on the right
  subscription: `az account show -o table`.

```bash
az extension add --name containerapp --upgrade
az provider register --namespace Microsoft.App --wait
az provider register --namespace Microsoft.ContainerRegistry --wait
az provider register --namespace Microsoft.DBforPostgreSQL --wait
az provider register --namespace Microsoft.Storage --wait
az provider register --namespace Microsoft.OperationalInsights --wait
```

## 1. Variables

```bash
export LOCATION="eastus"      # or westeurope — see region note below
export RG="rg-protea-demo"
export ACR="acrproteademo$RANDOM"
export PG_SERVER="psql-protea-demo-$RANDOM"
export PG_ADMIN="proteaadmin"
export PG_PASSWORD="$(openssl rand -base64 24)"
export STORAGE_ACCT="stproteademo$RANDOM"
export SHARE_NAME="protea-documents"
export ENVIRONMENT="cae-protea-demo"
export APP_NAME="ca-protea-demo"
export AUTH_SECRET="$(openssl rand -hex 32)"

echo "PG_PASSWORD=$PG_PASSWORD"
echo "AUTH_SECRET=$AUTH_SECRET"
```

> If a command below fails with a region or capacity error, it's a free-trial
> constraint, not a mistake — switch `LOCATION` and re-run from step 2. Don't try to
> request a quota increase; the trial isn't eligible for one (see the full runbook).

## 2. Resource group, database, registry

```bash
az group create --name "$RG" --location "$LOCATION"

az postgres flexible-server create \
  --resource-group "$RG" --name "$PG_SERVER" --location "$LOCATION" \
  --admin-user "$PG_ADMIN" --admin-password "$PG_PASSWORD" \
  --tier Burstable --sku-name Standard_B1ms --storage-size 32 --version 17 \
  --public-access 0.0.0.0 --yes

az postgres flexible-server db create \
  --resource-group "$RG" --server-name "$PG_SERVER" --database-name protea

MY_IP="$(curl -s https://api.ipify.org)"
az postgres flexible-server firewall-rule create \
  --resource-group "$RG" --name "$PG_SERVER" --rule-name allow-my-workstation \
  --start-ip-address "$MY_IP" --end-ip-address "$MY_IP"

export DATABASE_URL="postgresql://${PG_ADMIN}:${PG_PASSWORD}@${PG_SERVER}.postgres.database.azure.com:5432/protea?sslmode=require"

# Standard tier — free for 12 months under the trial offer.
az acr create --resource-group "$RG" --name "$ACR" --sku Standard --admin-enabled true
```

## 3. Build and push the image

Builds server-side in Azure — this matters if you're on Apple Silicon, where a local
`docker build` produces an arm64 image that won't start on Container Apps.

```bash
az acr build --registry "$ACR" --image protea-app:demo .
```

## 4. Storage for uploaded documents

```bash
az storage account create \
  --name "$STORAGE_ACCT" --resource-group "$RG" --location "$LOCATION" \
  --sku Standard_LRS --kind StorageV2 --enable-large-file-share \
  --min-tls-version TLS1_2 --allow-blob-public-access false

az storage share-rm create \
  --resource-group "$RG" --storage-account "$STORAGE_ACCT" \
  --name "$SHARE_NAME" --quota 100 --enabled-protocols SMB
```

> Leave this as pay-as-you-go (the default above), not "provisioned v2" — see the cost
> note in the full runbook. It's fractions of a cent either way at demo scale, but
> provisioned v2 has a real minimum bill.

## 5. Container Apps environment + app

```bash
az containerapp env create \
  --name "$ENVIRONMENT" --resource-group "$RG" --location "$LOCATION"

STORAGE_KEY="$(az storage account keys list -g "$RG" -n "$STORAGE_ACCT" --query '[0].value' -o tsv)"
az containerapp env storage set \
  --name "$ENVIRONMENT" --resource-group "$RG" --storage-name proteadocs \
  --azure-file-account-name "$STORAGE_ACCT" --azure-file-account-key "$STORAGE_KEY" \
  --azure-file-share-name "$SHARE_NAME" --access-mode ReadWrite

ACR_SERVER="$(az acr show -n "$ACR" --query loginServer -o tsv)"
ACR_PASSWORD="$(az acr credential show -n "$ACR" --query 'passwords[0].value' -o tsv)"

az containerapp create \
  --name "$APP_NAME" --resource-group "$RG" --environment "$ENVIRONMENT" \
  --image "${ACR_SERVER}/protea-app:demo" \
  --registry-server "$ACR_SERVER" --registry-username "$ACR" --registry-password "$ACR_PASSWORD" \
  --target-port 3000 --ingress external \
  --min-replicas 1 --max-replicas 1 \
  --cpu 0.5 --memory 1.0Gi \
  --secrets "db-url=$DATABASE_URL" "auth-secret=$AUTH_SECRET" \
  --env-vars \
    "DATABASE_URL=secretref:db-url" \
    "AUTH_SECRET=secretref:auth-secret" \
    "NODE_ENV=production" \
    "STORAGE_DRIVER=local" \
    "STORAGE_LOCAL_DIR=.storage" \
    "MAX_UPLOAD_BYTES=10485760" \
    "ALLOWED_UPLOAD_TYPES=image/png,image/jpeg,image/webp,application/pdf" \
    "DOCUMENT_RETENTION_DAYS=365" \
    "EMAIL_DRIVER=log" \
    "EMAIL_FROM=no-reply@demo.example" \
    "APP_URL=https://placeholder"
```

`--max-replicas 1` on purpose — a demo has one user at a time and this keeps you well
inside the free trial's core quota, which cannot be raised (see the full runbook).

### 5b. Fix `APP_URL` and mount the file share

> ### ⚠ This is the step that breaks logins if rushed
>
> `APP_URL` must be **exactly** the app's real HTTPS URL, or the session cookie is
> issued without the `Secure` flag and sign-in silently fails — the login form just
> reloads with no error. Get the FQDN first, then edit the YAML; don't guess it.
>
> Also: `az containerapp show -o yaml` exports secret **names but not values**. If you
> apply the file with the `secrets:` section still in it, Azure wipes `db-url` and
> `auth-secret` and the app crash-loops. **Delete that whole section before applying.**

```bash
export FQDN="$(az containerapp show -n "$APP_NAME" -g "$RG" --query 'properties.configuration.ingress.fqdn' -o tsv)"
echo "Demo URL will be: https://$FQDN"

az containerapp show -n "$APP_NAME" -g "$RG" -o yaml > app.yaml
```

Edit `app.yaml`:

1. **Delete the entire `secrets:` section.**
2. Set the `APP_URL` env var to `https://<paste the FQDN printed above>`.
3. Replace `volumes: null` with:
   ```yaml
   volumes:
     - name: documents
       storageName: proteadocs
       storageType: AzureFile
   ```
4. Add to the container's config:
   ```yaml
   volumeMounts:
     - volumeName: documents
       mountPath: /app/.storage
   ```

```bash
az containerapp update -n "$APP_NAME" -g "$RG" --yaml app.yaml
rm app.yaml

# Confirm the secrets survived:
az containerapp secret list -n "$APP_NAME" -g "$RG" -o table
```

## 6. Migrate and seed

From your workstation (`DATABASE_URL` is still exported from step 2):

```bash
npx prisma migrate deploy
npx tsx scripts/seed-scenario.ts
```

`seed-scenario.ts` stages four demo registrants — the pending one, the flagged
duplicate, the "now 18+" case, and the attempt-cap case — exactly what
[`DEMO-SCRIPT.md`](DEMO-SCRIPT.md) walks through. Seed the real administrator account
too:

```bash
SEED_ADMIN_EMAIL="admin@yourdomain.com" \
SEED_ADMIN_PASSWORD="$(openssl rand -base64 18)" \
npm run db:seed
```

Note the printed password — you'll sign in with it live.

## 7. Verify before the call, not during it

```bash
curl -sI "https://$FQDN" | head -1     # expect HTTP/2 200
```

Then in a browser:

1. `https://$FQDN/login` with the seeded admin — **if the form reloads with no error,
   `APP_URL` is wrong.** Fix it and restart.
2. `/admin/queue` — should show 4 pending, including *Dupe Me* flagged as a duplicate.
3. Open a document from the queue, confirm it renders — proves the file share mounted.
4. Sign out, sign back in as admin, everything still there — confirms the DB is really
   the Azure Postgres server, not something local leaking through.

If all four pass, close the terminal and drive the rest from
[`DEMO-SCRIPT.md`](DEMO-SCRIPT.md).

## After the call

The free trial doesn't stop billing you for existing resources just because the call
ended — it's the 30-day/$200 limits that end it. If you're not demoing again soon:

```bash
az group delete --name "$RG" --yes --no-wait
```

That removes everything created above in one shot (it's all in `$RG`) and stops the
clock on your credit for anything else you want to try during the trial.
