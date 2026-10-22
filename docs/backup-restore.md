# Supabase backup: setup and restore

The workflow `.github/workflows/backup-supabase.yml` dumps the database every day at 03:00
(Argentina), encrypts it with [age](https://github.com/FiloSottile/age) and uploads it to a
private Cloudflare R2 bucket. Each backup is one file: `supabase/<UTC timestamp>.tar.gz.age`.

It covers the same as `scripts/backup-supabase.mjs`: `schema.sql`, `data.sql` (schema
`public`), `auth.sql` and `storage.sql` (metadata only). It does NOT include Storage files
(photos), Edge Function secrets or function code (that lives in `supabase/functions/`).

The dump contains DNIs, emails, password hashes and data of minors. The repository is public:
never upload a backup unencrypted, and never commit the age private key.

## One-time setup

1. **age key pair** (on your machine, not in the repo):
   ```
   age-keygen -o ~/.config/uncas-backup/age-key.txt
   ```
   The command prints the public key (`age1...`). Keep the private key file in a password
   manager as well: without it, no backup can be restored.
2. **R2 bucket** (Cloudflare dashboard > R2): create a private bucket, add a lifecycle rule
   that deletes objects after 90 days, and create an R2 API token with *Object Read & Write*
   scoped to that bucket.
3. **Supabase connection string**: Dashboard > Connect > *Session pooler* (port 5432). GitHub
   runners are IPv4-only and the direct host is IPv6 on the Free plan. URL-encode the password
   if it has special characters.
4. **GitHub secrets** (repo Settings > Secrets and variables > Actions): `SUPABASE_DB_URL`,
   `BACKUP_AGE_RECIPIENT` (the `age1...` public key), `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
   `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`.
5. Run it once by hand: Actions > *Supabase backup* > *Run workflow*, and check the file
   appears in the bucket.

GitHub emails the repository owner when a scheduled run fails. GitHub also disables scheduled
workflows in public repositories after 60 days without commits; re-enable it from the
Actions tab if that happens.

## Restore

```
age -d -i ~/.config/uncas-backup/age-key.txt 2026-10-22-06-00-00.tar.gz.age | tar -xzf -
```

This creates a folder with the four `.sql` files. Load `schema.sql` first and then
`data.sql` into the target database with `psql`; `auth.sql` and `storage.sql` only when
restoring into an empty project. Restore into a staging project first, never straight into
production.
