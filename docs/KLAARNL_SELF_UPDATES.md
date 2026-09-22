# KlaarNL automatic self-updates

KlaarNL follows the latest stable OpenSEO GitHub release once per day. The
workflow is `.github/workflows/daily-self-update.yml`.

The updater deliberately has no preview environment, updater Worker, queue,
cache, or build artifacts:

1. Fetch the latest published `vX.Y.Z` release from `every-app/open-seo`.
2. Exit before installing dependencies when that release is already present.
3. Merge the release in the ephemeral runner. The one known conflict the fork
   can hit — upstream edits to `src/server.ts` colliding with the
   read-gateway export — resolves deterministically via
   `scripts/resolve-klaarnl-gateway-conflict.mjs` (upstream side kept, export
   re-appended) and is proven by the validation gate. Any other conflict
   stops the update and files the failure issue.
4. Install the lockfile, run upstream CI/tests, and build in self-host mode.
5. Verify D1 integrity and reject an unexpected non-empty `DROP TABLE`.
6. Let Alchemy apply pending migrations and atomically replace the Worker.
7. Verify D1 again and confirm the Cloudflare Access boundary still responds.
8. Push the tested merge to `KlaarNL/open-seo` only after production succeeds.

The D1 database, both KV namespaces, R2 bucket, and Worker use Alchemy's retain
policy in the `selfhost` stage. A mistaken destroy or resource refactor cannot
delete them. Preview stages remain disposable.

Required GitHub Actions secrets:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`
- `ENV_SELFHOST` (the complete ignored `.env.selfhost` file)

The repository is public because it contains only the public OpenSEO source and
KlaarNL's non-secret deployment policy. Standard GitHub-hosted runners are then
free. The workflow never runs for pull requests, and checkout credentials are
withheld until the final post-deployment push. GitHub disables public scheduled
workflows after 60 days without a commit, so a quiet repository receives one
empty keepalive commit after 45 days. It creates no file, branch, artifact,
cache, deployment, or Cloudflare resource.

Use **Run workflow** with `force` only to rehearse the complete deployment path
when no new OpenSEO release is available.

## Why the fork stays a fork

Running vanilla upstream was evaluated on 2026-09-22 and rejected on evidence:
vanilla self-host `/mcp` authenticates only Cloudflare Access JWTs that carry a
human `email` claim, so no machine-consumable surface exists without the
compiled read-gateway entrypoint the content factory binds to. Until the
gateway is accepted upstream (which would make this fork truly vanilla), the
conflict surface is one export line and the updater resolves it itself.
