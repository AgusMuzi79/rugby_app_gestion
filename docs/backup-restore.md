# Supabase backup: setup and restore

The workflow `.github/workflows/backup-supabase.yml` dumps the database every day at 03:00
(Argentina), encrypts it with [age](https://github.com/FiloSottile/age) and uploads it to a
private Cloudflare R2 bucket. Each backup is one file: `supabase/<UTC timestamp>.tar.gz.age`.

It covers the same as `scripts/backup-supabase.mjs`: `schema.sql`, `data.sql` (schema
`public`), `auth.sql` and `storage.sql` (metadata only). It does NOT include Storage files
(photos), database roles, Edge Function secrets or function code (that lives in
`supabase/functions/`).

The dump contains DNIs, emails, password hashes and data of minors. The repository is public:
never upload a backup unencrypted, and never commit the age private key.

## One-time setup

1. **age key pair** (on your machine, not in the repo):
   ```
   age-keygen -o ~/.config/uncas-backup/age-key.txt
   ```
   The command prints the public key (`age1...`). Keep the private key file in a password
   manager as well: without it, no backup can be restored.
2. **R2 bucket** (Cloudflare dashboard > R2): create a private bucket and an R2 API token with
   *Object Read & Write* scoped to that bucket. Do NOT add a lifecycle rule: the workflow keeps
   the last 90 days of backups itself (`KEEP_DAYS` in the workflow; update this line if it
   changes), deletes older ones only after a new backup is verified, and never goes below
   14 backups (`KEEP_MIN`) whatever their age. So neither a stopped workflow nor the first run
   after a long stop can leave the bucket with fewer than 14 backups.
3. **Supabase connection string**: Dashboard > Connect > *Session pooler* (port 5432). GitHub
   runners are IPv4-only and the direct host is IPv6 on the Free plan. URL-encode the password
   if it has special characters.
4. **Freshness alert** ([healthchecks.io](https://healthchecks.io), free plan): create a check
   with period 1 day and grace 2 hours, and add your email as its integration. Copy its ping
   URL. If no successful ping arrives on time (the workflow failed, was disabled, or the
   secrets broke), healthchecks.io emails you. This is the only alert that does not depend
   on GitHub.
5. **GitHub secrets** (repo Settings > Secrets and variables > Actions): `SUPABASE_DB_URL`,
   `BACKUP_AGE_RECIPIENT` (the `age1...` public key), `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
   `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, and `HEALTHCHECK_URL` (the ping URL; optional, but
   without it a silent stop goes unnoticed).
6. Run it once by hand: Actions > *Supabase backup* > *Run workflow*, and check the file
   appears in the bucket and the check turns green. Then do a trial restore into staging
   (below).

When a run fails, the workflow pings healthchecks.io as failed, and GitHub notifies the
person who last changed the `cron` line of the workflow (not necessarily the repository
owner), according to their notification settings. GitHub disables scheduled workflows in
public repositories after 60 days without commits; each run re-enables the workflow through
the API to avoid that, and if it still happens, healthchecks.io alerts after a day.

Each run checks that the dumps contain the `socios` table and rows of `public.socios`,
`auth.users` and `storage.buckets`, and that the uploaded file matches the local size. That
does not prove a backup restores: do a trial restore into staging every 3 months.

The Supabase CLI version and the `supabase/setup-cli` action are pinned in the workflow.
Bump them on purpose, and run the workflow by hand after a bump.

## Restore

Decrypt and unpack:

```
age -d -i ~/.config/uncas-backup/age-key.txt 2026-10-22-06-00-00.tar.gz.age | tar -xzf -
```

This creates a folder with the four `.sql` files. Always restore into a staging project
first, never straight into production.

**Into a new, empty Supabase project** (full restore). Load everything in one transaction,
with triggers and foreign-key checks off for the data files, so `public` rows that point to
`auth.users` load regardless of order:

```
psql "$TARGET_DB_URL" --single-transaction --variable ON_ERROR_STOP=1 \
  --file schema.sql \
  --command 'SET session_replication_role = replica' \
  --file auth.sql \
  --file storage.sql \
  --file data.sql
```

**Into an existing project** (public data only; its users and Storage stay as they are). The
`public` tables must exist and be empty, otherwise the load stops on duplicate keys and rolls
back. Load `schema.sql` first only if the schema is missing:

```
psql "$TARGET_DB_URL" --single-transaction --variable ON_ERROR_STOP=1 \
  --command 'SET session_replication_role = replica' \
  --file data.sql
```

With `session_replication_role = replica`, foreign keys are not checked: any `public` row that
points to a user missing from that project's `auth.users` loads but is left dangling. Without
it, the load stops on the first such row.

If the command stops on an error, the transaction rolls back and nothing is written.
