# Deploy runbook

How `mindorajournal.com` actually gets updated. `docker-compose.prod.yml` has
referred to this document since production first went up; this is it.

Nothing here is automated. CI (`.github/workflows/ci-cd.yml`) builds, tests, and
pushes images to Docker Hub, and stops there — it has no deploy step and no
credentials for the server. Every deploy is manual and runs from your machine
over SSH.

## Production layout

| | |
|---|---|
| Host | `169.58.202.46` — single VPS, IBM Cloud/SoftLayer range |
| OS / web server | Ubuntu, nginx 1.24 installed **on the host**, not in a container |
| TLS | Let's Encrypt via certbot, for `mindorajournal.com` and `www.` |
| Compose project | `/opt/mindora`, using `docker-compose.prod.yml` |
| Containers | 17 — the 12 Java services, `python-ai-service`, frontend, MySQL, Elasticsearch, RabbitMQ, Redis |
| SSH | `root@169.58.202.46` with the key `~/.ssh/mindora_prod` |

Host nginx terminates TLS on 80/443 and reverse-proxies to `127.0.0.1:3001`,
which is the `journal-frontend-prod` container. That container runs its own
nginx serving the built SPA, and proxies `/api/**` on to the gateway. This is
why `docker-compose.prod.yml` binds the frontend to `127.0.0.1` rather than
`0.0.0.0` — the container must not claim the public port that host nginx owns.

The nginx site config lives at `/etc/nginx/sites-enabled/`. The server is
authoritative, but a reference copy is kept at
[nginx/mindorajournal.com.conf](nginx/mindorajournal.com.conf) — re-copy it in
the same commit whenever you change the live one, or it goes stale. See
[nginx/README.md](nginx/README.md) for what the blocks do and how to apply a
change without taking the site down.

`/opt/mindora/.env` is **not** in this repo and must not be — it holds every
production secret.

## Before your first deploy

### SSH key permissions on Windows

OpenSSH refuses to use a private key that other principals can read, and
Windows inherits an AppContainer ACE into your user folder that trips this.
Fixing it by name can silently fail: if your PC name and username are the same,
`icacls` resolves the bare name to the **machine** SID, not your account. Grant
by SID instead, in PowerShell:

```powershell
icacls "$env:USERPROFILE\.ssh\mindora_prod" /reset
$sid=([System.Security.Principal.WindowsIdentity]::GetCurrent()).User.Value
icacls "$env:USERPROFILE\.ssh\mindora_prod" /inheritance:r /grant:r "*${sid}:R"
```

Confirm ssh can read it before involving the server — this needs no network:

```powershell
ssh-keygen -y -f "$env:USERPROFILE\.ssh\mindora_prod"
```

An `ssh-ed25519 AAAA…` line means you are good. A password prompt *after* this
succeeds means the username is wrong, not the key.

### Building jars locally needs JDK 21, not your default

Lombok 1.18.34 cannot read JDK 26's compiler internals and the build dies with
`java.lang.ExceptionInInitializerError: com.sun.tools.javac.code.TypeTag ::
UNKNOWN`. The project targets Java 21 and CI pins 21, so 21 is the correct
toolchain, not a workaround:

```bash
export JAVA_HOME="/c/Program Files/Java/jdk-21.0.11"
```

The service Dockerfiles do `COPY target/*.jar`, so `mvn install` must succeed
**before** `docker compose build`, or the image build fails with
`lstat /target: no such file or directory`.

## Deploying a frontend-only change

By far the most common case, and the safest: the API never goes down, because
no backend container is touched.

`/opt/mindora` is **not a git checkout** — the source was copied up from
Windows, and the directory is owned by `197609:197121`. `git pull` does not
work there. Ship a tarball instead.

**1. Package the changed source, on your machine:**

```bash
cd frontend && tar -czf frontend-src.tgz src public
```

**2. Upload:**

```bash
scp -i ~/.ssh/mindora_prod frontend/frontend-src.tgz root@169.58.202.46:/tmp/
```

**3. Back up what is live, then replace it:**

```bash
ssh -i ~/.ssh/mindora_prod root@169.58.202.46 \
  'set -e; cd /opt/mindora/frontend; S=$(date +%F-%H%M);
   cp -r src "src.bak-$S"; cp -r public "public.bak-$S"; echo "backup: $S";
   rm -rf src public node_modules dist; tar -xzf /tmp/frontend-src.tgz'
```

`node_modules` and `dist` are removed deliberately — see *Traps* below.

**4. Rebuild and restart only the frontend:**

```bash
ssh -i ~/.ssh/mindora_prod root@169.58.202.46 \
  'cd /opt/mindora && docker compose -f docker-compose.prod.yml build frontend && docker compose -f docker-compose.prod.yml up -d frontend'
```

Roughly one second of 502 on the page while the container swaps. The gateway
and every service keep running.

## Deploying a backend change

Same shape, but the jars have to be built first and the affected services
restarted. Package whatever modules changed rather than the whole tree.

```bash
export JAVA_HOME="/c/Program Files/Java/jdk-21.0.11"
mvn -B clean install -DskipTests
```

Upload the module source the same way, then on the server:

```bash
cd /opt/mindora && docker compose -f docker-compose.prod.yml build <service> \
  && docker compose -f docker-compose.prod.yml up -d <service>
```

Restarting `gateway-service` **is** user-visible downtime — every request goes
through it. Restarting a single business service degrades only its own feature.

A migration-bearing change deserves a MySQL dump first:

```bash
cd /opt/mindora && set -a && . ./.env && set +a && docker exec journal-mysql-prod mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --all-databases > /root/backup-$(date +%F).sql
```

`MYSQL_ROOT_PASSWORD` is not in your shell by default — it lives in
`/opt/mindora/.env`, which is why the dump sources it first.

## Verifying

Check something that could only exist after this deploy — a new asset, a new
endpoint. A `200` on `/` proves nothing.

```bash
curl -sI https://mindorajournal.com/screens/01-dashboard.webp | head -1
curl -s -o /dev/null -w "%{http_code}\n" https://mindorajournal.com/actuator/health   # 200
curl -s -o /dev/null -w "%{http_code}\n" https://mindorajournal.com/api/v1/auth/me    # 401
```

`401` on `/api/v1/auth/me` is the healthy answer: it proves the gateway is up
*and* its JWT filter is enforcing. A `502` means the gateway is down; a `200`
would mean authentication is broken.

**The frontend is a client-rendered SPA, so `index.html` is byte-identical
whether or not your change shipped.** To prove a UI change is actually live,
grep the deployed bundle for a string only the new code contains:

```bash
JS=$(curl -s https://mindorajournal.com/ | grep -o '/assets/index-[A-Za-z0-9_-]*\.js' | head -1)
curl -s "https://mindorajournal.com$JS" | grep -c "some new string"
```

Finally, check in a **private window**. Logged in, `/` redirects to
`/dashboard`, so an existing session hides any change to the landing page.

## Rollback

Frontend, using the backup from step 3:

```bash
ssh -i ~/.ssh/mindora_prod root@169.58.202.46 \
  'set -e; cd /opt/mindora/frontend; rm -rf src public;
   mv src.bak-<STAMP> src; mv public.bak-<STAMP> public;
   cd /opt/mindora && docker compose -f docker-compose.prod.yml build frontend && docker compose -f docker-compose.prod.yml up -d frontend'
```

Delete stale `*.bak-*` directories once a deploy has proven itself; they
accumulate otherwise.

## Traps

**Never run compose from a different directory.** Compose derives the project
name from the folder, and MySQL and Elasticsearch data live in project-scoped
volumes (`mysql_data_prod`, `elasticsearch_data_prod`). Cloning fresh into
`/opt/mindora-new` and running compose there creates *empty* volumes — every
account and journal appears to be gone. The data is still on disk under the old
project, but this is an easy panic to cause and an easy one to avoid: deploy in
place, always.

**`frontend/` has no `.dockerignore`.** Its Dockerfile runs `npm install` and
*then* `COPY . .`, so a `node_modules/` left on the host overwrites the
container's Linux modules with whatever was built elsewhere, and the Vite build
fails or emits a broken bundle. Step 3 deletes both `node_modules` and `dist`
for this reason.

**`.env` is not in the repo and not in any backup you take of the source.** It
holds `JWT_SECRET`, `TOTP_ENCRYPTION_KEY`, `JOURNAL_ENCRYPTION_KEY`,
`MYSQL_ROOT_PASSWORD` and the rest. Losing it means every existing session is
invalid, every stored TOTP secret is undecryptable, and every encrypted journal
entry is unrecoverable. Back it up somewhere outside the server.

**A `git pull` on the server does nothing.** There is no git checkout there.
This is worth fixing eventually — a real clone would make deploys one command —
but it must be done in place at `/opt/mindora`, keeping the directory name, and
`.env` must survive the change.
