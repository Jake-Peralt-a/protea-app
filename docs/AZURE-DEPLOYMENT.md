# Deploying Future Protea to Azure

A runbook for deploying this app to Azure Container Apps, backed by Azure Database for
PostgreSQL and Azure Files.

Everything below was checked against this repository's actual `Dockerfile`,
`next.config.ts`, `src/lib/db.ts`, `src/lib/storage.ts` and `src/lib/session.ts` — the
"gotchas" in the next section are real properties of this codebase, not generic Azure
advice.

**CLI commands verified against Microsoft Learn on 14 August 2026** (`az containerapp
env storage set`, `az containerapp hostname add`/`bind`, `az postgres flexible-server
create`, and the Azure Files volume-mount tutorial). Azure CLI moves quickly — if a
command is rejected, check `az <command> --help` first; the shape of the runbook will
still hold.

---

## Read this first — five things that will bite you

**1. `APP_URL` must be the exact public `https://` URL.**
[`src/lib/session.ts:57`](../src/lib/session.ts) sets the session cookie's `Secure`
flag from `config.appUrl.startsWith("https://")`. If `APP_URL` is left as
`http://localhost:3000` while the site is served over HTTPS, the cookie is issued
without `Secure`; if it is `https://` while served over plain HTTP, the browser
discards the cookie and **nobody can sign in, with no error message**. Set it to the
real FQDN, and update it again if you later add a custom domain.

**2. Uploaded identity documents live on the container filesystem.**
`STORAGE_DRIVER=local` writes to `/app/.storage`
([`src/lib/storage.ts`](../src/lib/storage.ts)). A container filesystem is ephemeral —
without the Azure Files mount in step 6, **every uploaded ID document is destroyed on
each restart, scale event, or new revision**. The `s3` driver is an unimplemented stub
that throws on first use, so Azure Files is the only working persistence option today.

**3. The production image cannot run database migrations.**
`prisma.config.ts` does `import "dotenv/config"`, but `dotenv` and `c12` arrive only
transitively via the `prisma` package and are **not** traced into
`.next/standalone/node_modules` (verified). The runtime image therefore has the Prisma
CLI but not its config dependencies. Migrations are run from your machine or from CI
instead — step 8. (A fix is sketched in "Optional hardening".)

**4. Status-change emails will not send.**
`EMAIL_DRIVER=smtp` is an unimplemented seam that throws
([`src/lib/notify.ts`](../src/lib/notify.ts)). Keep `EMAIL_DRIVER=log`. In-app
notifications on the status page are fully built and unaffected — registrants just
won't get email until an SMTP or Azure Communication Services driver is written.

**5. The Dockerfile's Node version is past end-of-life.**
All three stages use `node:20-alpine`. **Node 20 stopped receiving security patches on
30 April 2026** — over three months ago. Deploying identity-document handling on an
unpatched runtime is not defensible; bump all three `FROM` lines before going live:

```dockerfile
FROM node:22-alpine AS deps      # Active LTS, security support to April 2027
FROM node:22-alpine AS builder
FROM node:22-alpine AS runner
```

Node 24 (security support to April 2028) is the longer-lived option. Run `npm test &&
npm run build` after changing it — this repo has no `engines` field pinning the
version, so nothing will warn you if something breaks.

---

## Architecture

| Component | Azure service | Why |
| --- | --- | --- |
| Web app | Container Apps | Runs the existing `Dockerfile` as-is; HTTPS and certs included |
| Database | Azure Database for PostgreSQL — Flexible Server | Prisma 7 + `@prisma/adapter-pg` targets standard Postgres |
| Identity documents | Storage Account → File Share, mounted at `/app/.storage` | Survives restarts; encrypted at rest by default |
| Image registry | Azure Container Registry | `az acr build` builds server-side, avoiding the arm64/amd64 mismatch when building from a Mac |
| Logs | Log Analytics | Created automatically with the Container Apps environment |

Rough cost at idle for a low-traffic deployment: **~$30–45/month** (B1ms Postgres is
the bulk of it; Container Apps has a free monthly grant that a small app largely fits
inside). Use `Standard_B2s` and a zone-redundant Postgres tier for real production.

---

## Running this on the Azure free trial

Everything in this runbook fits inside a free account, but there are four constraints
that change how you should plan. *(Verified against Microsoft Learn, 14 August 2026.)*

### What the free account gives you

| Service | Free allowance | Duration |
| --- | --- | --- |
| Credit | **$200**, any service | **30 days** |
| Container Apps | 180,000 vCPU-seconds, 360,000 GiB-seconds, 2M requests **per month** | Always free |
| PostgreSQL Flexible Server | **750 hours of B1MS**, 32 GB storage | 12 months |
| Container Registry | 1 **Standard** registry, 100 GB | 12 months |

750 hours covers one always-on B1ms server (a month is 744 hours), so the database in
step 3 is free for a year — provided you run exactly one.

> **On the registry:** the free-account offer page lists a Standard registry free for
> 12 months, so use `--sku Standard` in step 4 while on the trial. Note that ACR has no
> *standing* free tier outside that offer — once the 12 months end, a Basic registry is
> about **$5.07/month** and is billed daily even when empty. The free-services page is
> JavaScript-rendered and couldn't be captured as a primary source, so **confirm the
> registry entry on the portal's Free Services page** before relying on it.
>
> If you'd rather avoid the line item entirely, Container Apps can pull from **GitHub
> Container Registry** — public GHCR images are free and need no credentials. Microsoft
> warns against Docker Hub specifically (pull rate limits break app startup), but not
> GHCR.

### What it actually costs

The free grant sounds generous but is small next to an always-on container: 180,000
vCPU-seconds is about **100 of the ~730 hours** in a month at 0.5 vCPU. The rest is
billable.

`--min-replicas 1` in step 7 is deliberate. Beyond keeping the app warm, it qualifies
the replica for the **idle rate — an 8× discount on vCPU** (billed at idle when it is
scaled to minimum and not serving requests). Dropping to `--min-replicas 0` would
*raise* your bill for a low-traffic app, not lower it.

| Component (East US, low traffic) | Monthly |
| --- | --- |
| Container Apps — 1 replica, 0.5 vCPU / 1 GiB, idle rate | ~$10.21 |
| PostgreSQL B1ms + 32 GB storage | ~$16.09 |
| Container Registry (Basic) | ~$5.07 |
| Azure Files, pay-as-you-go, under 1 GiB stored | ~$0.06 |
| **Total once fully billable** | **≈ $31/month** |

Swapping ACR for GHCR brings that to about **$26/month**.

**Timeline on a free account:**

| Period | What you pay |
| --- | --- |
| Days 1–30 | **$0** — roughly $31 of consumption against the $200 credit (~16%) |
| Months 2–12 | **≈ $15/month** — Postgres still free under the 12-month offer; Container Apps, ACR and Files bill normally |
| Month 13 onward | **≈ $31/month** — the Postgres offer expires, the server keeps running and silently starts billing |

Set a calendar reminder for month 13. The database does not stop or warn you; the bill
just goes up by about $16.

### Three ways to accidentally spend much more

**Don't switch Azure Files to "provisioned v2".** Microsoft's storage documentation now
recommends provisioned v2 for new deployments. For this workload that advice is
expensive: provisioned v2 bills on provisioned **IOPS and throughput**, not data used,
so a 100 GiB share holding under 1 GiB costs roughly **$45/month** instead of $0.06.
The `az storage account create` command in step 6 gives you pay-as-you-go, where
`--quota` does not affect the bill at all. Leave it that way.

**Watch Log Analytics ingestion.** The Container Apps environment creates a workspace
by default; ingestion past the free allowance is **$2.30/GB**. A chatty app can run
this up quietly. Check it under Cost Management if your bill looks wrong.

**Never add a private endpoint on a Consumption app.** Doing so activates the Dedicated
Plan Management meter at **$0.10/hour — about $73/month** — on an app that is otherwise
paying cents.

### 1. There is a hard 30-day cliff

At day 30 Azure **disables the subscription** — regardless of how much of the $200 is
left. Unused credit does not roll over. This is a deadline, not a soft limit, so don't
plan a client demo for day 31.

### 2. The spending limit is on by default

It's set to $200 and **cannot be changed**. When credit runs out, per Microsoft:

> "Azure resources that you deployed are removed from production and your Azure virtual
> machines are stopped and de-allocated. The data in your storage accounts are
> available as read-only."

So resources are **stopped and de-allocated — not deleted**. Your Postgres data and the
uploaded documents in Azure Files survive. What you lose is runtime networking state,
which in practice means **the app's public FQDN can change**. If that happens, update
`APP_URL` to the new hostname or nobody can sign in (gotcha 1).

To keep running past day 30, upgrade to pay-as-you-go **before** it expires. You keep
any remaining credit for the full 30 days *and* keep the 12-months-free services:

```bash
# Portal: Subscriptions → your subscription → Upgrade
az account show --query "{name:name, state:state, id:id}" -o table
```

### 3. A free trial can never be granted a quota increase

This is the constraint most likely to stop you. From the official limits documentation:

> "Free Azure trial subscriptions are not eligible for limit or quota increases. If you
> have this type of subscription, you can upgrade to a Pay-as-you-go one."

There is no support ticket that fixes this — the only remedy is upgrading. For this
deployment that means: **keep to one Container Apps environment, one Postgres server,
and modest replica counts.** The `--max-replicas 3` in step 7 is comfortably safe;
don't raise it on a trial. If you exceed an environment's core quota you'll see:

```
Maximum Allowed Cores exceeded for the Managed Environment.
```

### 4. Probe your region before deploying, don't assume

Capacity for the Burstable Postgres tier is genuinely refused in some regions, and new
subscriptions are sometimes restricted to a subset of regions by Azure Policy. Check
first rather than discovering it halfway through:

```bash
# Does this region offer PostgreSQL Flexible Server at all?
az provider show --namespace Microsoft.DBforPostgreSQL \
  --query "resourceTypes[?resourceType=='flexibleServers'].locations" -o tsv | tr ',' '\n' | grep -i "$LOCATION"

# Is a region allowlist policy assigned to this subscription?
az policy assignment list --query "[?contains(displayName,'egion')].{name:displayName}" -o table
```

Known-problematic regions for Postgres Flexible Server under restricted offers include
Australia Central/Central 2/SouthEast, Brazil SouthEast, Canada East, France South,
Germany North, Japan West, Korea South, Norway West, South Africa West, South India,
Switzerland West, UAE Central, UK West, West Central US and West India. Prefer a large
primary region. Errors that indicate you picked a bad one:

```
Your subscription does not have access to create a server in the selected region.
```
```
Availability zone {ID} is not available for subscription {Sub ID} in this region
temporarily due to capacity constraints.
```

If you hit either, re-run step 3 with a different `LOCATION`.

> **One widely-repeated claim I could not verify:** that free trials are capped at 4
> vCPUs. It appears only in community forum posts, never in Microsoft's documentation.
> Don't plan around it either way — measure it with
> `az vm list-usage --location "$LOCATION" -o table`.

---

## Prerequisites

```bash
az --version          # use the current release; Microsoft only supports the latest
az login
az account set --subscription "<your-subscription-id>"
az extension add --name containerapp --upgrade

# Register every provider this runbook touches. A brand-new subscription has almost
# nothing registered, and "MissingSubscriptionRegistration" is the single most common
# first-deployment failure. Registration can take up to ~15 minutes to propagate.
az provider register --namespace Microsoft.App --wait
az provider register --namespace Microsoft.ContainerRegistry --wait
az provider register --namespace Microsoft.DBforPostgreSQL --wait
az provider register --namespace Microsoft.Storage --wait
az provider register --namespace Microsoft.OperationalInsights --wait
```

If you skip this you will see one of:

```
Code: MissingSubscriptionRegistration
Message: The subscription is not registered to use namespace {namespace}
```
```
Code: NoRegisteredProviderFound
Message: No registered resource provider found for location {location} ...
```

## 1. Set your variables

Run every subsequent step in the same shell. Registry and storage account names must
be globally unique and lowercase-alphanumeric only.

```bash
export LOCATION="westeurope"
export RG="rg-protea"
export ACR="acrprotea$RANDOM"
export PG_SERVER="psql-protea-$RANDOM"
export PG_ADMIN="proteaadmin"
export PG_PASSWORD="$(openssl rand -base64 24)"
export STORAGE_ACCT="stprotea$RANDOM"
export SHARE_NAME="protea-documents"
export ENVIRONMENT="cae-protea"
export APP_NAME="ca-protea-app"
export AUTH_SECRET="$(openssl rand -hex 32)"
export SEED_ADMIN_EMAIL="admin@yourdomain.com"
export SEED_ADMIN_PASSWORD="$(openssl rand -base64 18)"

echo "SAVE THESE NOW:"
echo "  PG_PASSWORD        = $PG_PASSWORD"
echo "  AUTH_SECRET        = $AUTH_SECRET"
echo "  SEED_ADMIN_PASSWORD= $SEED_ADMIN_PASSWORD"
```

> Record those three values somewhere safe before continuing. `AUTH_SECRET` in
> particular: changing it later invalidates every active session.

## 2. Resource group

```bash
az group create --name "$RG" --location "$LOCATION"
```

## 3. PostgreSQL Flexible Server

```bash
az postgres flexible-server create \
  --resource-group "$RG" \
  --name "$PG_SERVER" \
  --location "$LOCATION" \
  --admin-user "$PG_ADMIN" \
  --admin-password "$PG_PASSWORD" \
  --tier Burstable \
  --sku-name Standard_B1ms \
  --storage-size 32 \
  --version 17 \
  --public-access 0.0.0.0 \
  --yes

az postgres flexible-server db create \
  --resource-group "$RG" \
  --server-name "$PG_SERVER" \
  --database-name protea
```

Azure currently offers PostgreSQL 14 through 18. **17** is the recommendation here: it
is current, well-proven, and squarely inside what Prisma 7 targets. 16 is equally fine
if you prefer to match local development, which runs `postgres:16-alpine` via
`docker-compose.yml`. 18 is available but is newer than this stack has been tested
against — verify before choosing it.

`--public-access 0.0.0.0` opens the server to Azure-deployed resources only, not the
public internet. You also need your own IP temporarily, to run migrations in step 8:

```bash
MY_IP="$(curl -s https://api.ipify.org)"
az postgres flexible-server firewall-rule create \
  --resource-group "$RG" --name "$PG_SERVER" \
  --rule-name allow-my-workstation \
  --start-ip-address "$MY_IP" --end-ip-address "$MY_IP"
```

Build the connection string. `sslmode=require` is mandatory — Azure Postgres rejects
unencrypted connections:

```bash
export DATABASE_URL="postgresql://${PG_ADMIN}:${PG_PASSWORD}@${PG_SERVER}.postgres.database.azure.com:5432/protea?sslmode=require"
```

> If you hit a certificate-verification error at step 8, use `sslmode=no-verify`
> instead. That still encrypts the connection but skips CA validation — acceptable
> short-term, worth fixing properly before go-live.

## 4. Container registry

```bash
az acr create --resource-group "$RG" --name "$ACR" --sku Basic --admin-enabled true
```

## 5. Build the image

`az acr build` builds inside Azure, which matters if you're on an Apple Silicon Mac —
a local `docker build` would produce an arm64 image that will not start on Azure.

```bash
az acr build --registry "$ACR" --image protea-app:v1 .
```

Takes ~3–5 minutes. It uses the repo's existing `Dockerfile` unchanged.

## 6. Storage for identity documents

```bash
az storage account create \
  --name "$STORAGE_ACCT" --resource-group "$RG" \
  --location "$LOCATION" --sku Standard_LRS --kind StorageV2 \
  --enable-large-file-share \
  --min-tls-version TLS1_2 --allow-blob-public-access false

az storage share-rm create \
  --resource-group "$RG" --storage-account "$STORAGE_ACCT" \
  --name "$SHARE_NAME" --quota 100 --enabled-protocols SMB
```

Container Apps does **not** support identity-based access to Azure file shares, so the
storage account key is required below. That is a platform limitation, not a shortcut.

## 7. Container Apps environment + app

```bash
az containerapp env create \
  --name "$ENVIRONMENT" --resource-group "$RG" --location "$LOCATION"
```

Register the file share with the environment:

```bash
STORAGE_KEY="$(az storage account keys list -g "$RG" -n "$STORAGE_ACCT" --query '[0].value' -o tsv)"

az containerapp env storage set \
  --name "$ENVIRONMENT" --resource-group "$RG" \
  --storage-name proteadocs \
  --azure-file-account-name "$STORAGE_ACCT" \
  --azure-file-account-key "$STORAGE_KEY" \
  --azure-file-share-name "$SHARE_NAME" \
  --access-mode ReadWrite
```

Create the app. `APP_URL` is a placeholder here — step 7b corrects it once Azure has
assigned the real FQDN (see gotcha 1):

```bash
ACR_SERVER="$(az acr show -n "$ACR" --query loginServer -o tsv)"
ACR_PASSWORD="$(az acr credential show -n "$ACR" --query 'passwords[0].value' -o tsv)"

az containerapp create \
  --name "$APP_NAME" --resource-group "$RG" --environment "$ENVIRONMENT" \
  --image "${ACR_SERVER}/protea-app:v1" \
  --registry-server "$ACR_SERVER" \
  --registry-username "$ACR" \
  --registry-password "$ACR_PASSWORD" \
  --target-port 3000 --ingress external \
  --min-replicas 1 --max-replicas 3 \
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
    "EMAIL_FROM=no-reply@yourdomain.com" \
    "APP_URL=https://placeholder"
```

### 7b. Set the real `APP_URL` and mount the file share

Volume mounts cannot be expressed with CLI flags, so this step goes through YAML.

```bash
export FQDN="$(az containerapp show -n "$APP_NAME" -g "$RG" --query 'properties.configuration.ingress.fqdn' -o tsv)"
echo "Public URL: https://$FQDN"

az containerapp show -n "$APP_NAME" -g "$RG" -o yaml > app.yaml
```

> ### ⚠ Delete the `secrets:` section before you apply this file
>
> `az containerapp show` exports secret **names but not their values**. If you apply
> the file with that section still present, Azure treats the valueless entries as the
> new complete set and **wipes `db-url` and `auth-secret`** — the app then crash-loops
> with `DATABASE_URL is not set`.
>
> Removing the whole `secrets:` block leaves the existing secrets untouched. That is
> the documented behaviour and the safe path. Only keep the block if you are
> deliberately changing a secret, and then supply every secret's `name` *and* `value`.

Now edit `app.yaml`:

1. **Delete the entire `secrets:` section.**
2. Set the `APP_URL` env var to `https://<your FQDN>`.
3. Replace `volumes: null` under `properties.template` with a real volume, and add the
   matching `volumeMounts` to the container.

The exported file ships `volumes: null` — replace that line rather than appending a
second `volumes:` key. The result should look like this:

```yaml
properties:
  template:
    containers:
      - name: ca-protea-app
        # ...existing image and resources...
        env:
          # ...existing entries; correct this one:
          - name: APP_URL
            value: https://<paste-your-fqdn-here>
        volumeMounts:
          - volumeName: documents
            mountPath: /app/.storage
    volumes:
      - name: documents
        storageName: proteadocs
        storageType: AzureFile
```

`volumes[].name` is what `volumeMounts[].volumeName` refers to; `storageName` must
match the `--storage-name` from the previous command (`proteadocs`).

`mountPath` must be exactly `/app/.storage` — the Dockerfile's `WORKDIR` is `/app` and
`STORAGE_LOCAL_DIR` is `.storage`, and the driver resolves that relative to the working
directory. Then apply:

```bash
az containerapp update -n "$APP_NAME" -g "$RG" --yaml app.yaml
rm app.yaml   # contains resource metadata; don't commit it
```

Confirm the secrets survived and the mount is present before moving on:

```bash
az containerapp secret list -n "$APP_NAME" -g "$RG" -o table   # expect db-url, auth-secret
az containerapp show -n "$APP_NAME" -g "$RG" --query 'properties.template.volumes'
```

If the secret list came back empty, re-add them and restart:

```bash
az containerapp secret set -n "$APP_NAME" -g "$RG" \
  --secrets "db-url=$DATABASE_URL" "auth-secret=$AUTH_SECRET"
```

## 8. Run migrations

From your workstation, with `DATABASE_URL` still exported from step 3:

```bash
npx prisma migrate deploy
```

This applies both migrations — the original schema and
`20260813165352_cr_reg_002_workflow_completeness`. Expect "2 migrations found …
applied". Use `migrate deploy`, never `migrate dev`, against a live database.

## 9. Seed the administrator account

```bash
SEED_ADMIN_EMAIL="$SEED_ADMIN_EMAIL" \
SEED_ADMIN_PASSWORD="$SEED_ADMIN_PASSWORD" \
npm run db:seed
```

> The repo default is `admin@futureprotea.example` / `Admin123!`. **Do not deploy with
> that password.** The env vars above override it; confirm the command's output names
> your real address.

## 10. Verify

```bash
curl -sI "https://$FQDN" | head -1        # expect HTTP/2 200
az containerapp logs show -n "$APP_NAME" -g "$RG" --tail 50
```

Then in a browser, walk the workflow end to end:

1. Sign in as your seeded admin at `https://$FQDN/login` — **if the login form
   reloads without an error, `APP_URL` is wrong.** Recheck gotcha 1.
2. Sign up as a new registrant, complete the wizard, upload a document.
3. As the admin, open the queue, view the uploaded document, and Request more
   information.
4. **Restart the app**, then reopen that document. If it still loads, the Azure Files
   mount is working. If you get "Document unavailable", the volume mount is
   misconfigured — recheck step 7b.

You can also confirm the mount directly from inside the running container:

```bash
az containerapp exec -n "$APP_NAME" -g "$RG" --command sh
# then, inside the container:
ls -la /app/.storage    # uploaded documents should be listed here
mount | grep .storage   # should show the Azure Files (cifs) mount
exit
```

Any file written to `/app/.storage` should also appear under **File shares →
protea-documents** in the storage account in the Azure portal. If it appears in the
container but not in the portal, you are writing to the container's own filesystem and
the mount did not take effect.

## 11. Custom domain (optional)

```bash
az containerapp hostname add \
  --hostname app.yourdomain.com --name "$APP_NAME" --resource-group "$RG"

az containerapp hostname bind \
  --hostname app.yourdomain.com --name "$APP_NAME" --resource-group "$RG" \
  --environment "$ENVIRONMENT" --validation-method CNAME
```

Then **update `APP_URL` to `https://app.yourdomain.com`** and restart. Forgetting this
breaks sign-in on the new domain for exactly the reason in gotcha 1.

## 12. Redeploying a new version

```bash
az acr build --registry "$ACR" --image protea-app:v2 .
az containerapp update -n "$APP_NAME" -g "$RG" --image "${ACR_SERVER}/protea-app:v2"
npx prisma migrate deploy      # only when the release adds migrations
```

Run migrations *before* routing traffic to the new revision if a release contains a
breaking schema change.

---

## Before this carries real people's identity documents

The gap analysis in [`CR-REG-001-gap-analysis.md`](CR-REG-001-gap-analysis.md) lists
items that are unresolved in the application regardless of where it is hosted. Three
matter most for a public deployment:

- **No malware scanning on uploads (gap S-01).** The system's core function is
  accepting files from the public that staff then open. Enable Microsoft Defender for
  Storage on the storage account as a partial compensating control — it scans blobs,
  though not the SMB file share, so an in-app scan is still the real fix.
- **No rate limiting (gap S-04).** Registration, login and signup are all unthrottled.
  Put Azure Front Door or Application Gateway with WAF in front before go-live.
- **No parental consent captured for minors (gap C-01).** A legal blocker for
  processing children's data under POPIA/GDPR, independent of hosting.

Also close the workstation firewall rule from step 3 once migrations are done:

```bash
az postgres flexible-server firewall-rule delete \
  --resource-group "$RG" --name "$PG_SERVER" \
  --rule-name allow-my-workstation --yes
```

## Optional hardening

**Run migrations in Azure instead of from a laptop.** Add a stage to the `Dockerfile`
that keeps the full dependency tree, then run it as a Container Apps Job:

```dockerfile
FROM node:22-alpine AS migrator
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY prisma ./prisma
COPY prisma.config.ts package.json ./
CMD ["npx", "prisma", "migrate", "deploy"]
```

This works because it carries the complete `node_modules` — including the transitive
`dotenv` that `prisma.config.ts` needs and that the standalone build omits (gotcha 3).

**Replace registry admin credentials with managed identity:**

```bash
az containerapp identity assign --name "$APP_NAME" --resource-group "$RG" --system-assigned
PRINCIPAL_ID="$(az containerapp show -n "$APP_NAME" -g "$RG" --query identity.principalId -o tsv)"
ACR_ID="$(az acr show -n "$ACR" --query id -o tsv)"
az role assignment create --assignee "$PRINCIPAL_ID" --role AcrPull --scope "$ACR_ID"
az containerapp registry set --name "$APP_NAME" --resource-group "$RG" \
  --server "$ACR_SERVER" --identity system
az acr update --name "$ACR" --admin-enabled false
```

**Move secrets to Key Vault** and reference them from the container app, rather than
holding `DATABASE_URL` and `AUTH_SECRET` as Container Apps secrets.

**Enable Postgres backups and high availability** — the Burstable tier used above has
neither zone redundancy nor a read replica. `--tier GeneralPurpose` with
`--high-availability ZoneRedundant` is the production shape.
