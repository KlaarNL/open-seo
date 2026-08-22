# Agent guidance

## Engineering principles

- Prefer simple, readable, flat code with minimal indirection.
- Search for existing implementations and installed libraries before creating new helpers or abstractions.
- Abstract when it prevents meaningful drift and makes the result simpler to maintain. Avoid speculative or one-use abstraction layers.
- Keep product data normalized and relationships explicit. Do not encode relational data in JSON or text merely to avoid joins.
- For new application-backed backend functionality, default to: TanStack server function → service → repository.
- Keep schema changes, queries, and mutations compatible with both SQLite and Postgres.
- Use idiomatic TypeScript. Use Zod to validate untrusted data and narrow runtime values at trust boundaries.
- Prefer established project helpers and libraries over hand-rolled implementations.
- Prefer idiomatic TanStack Query, Router, and Form patterns for server state, routing, and submitted forms.

## Log papercuts

When small, non-blocking repository friction occurs—a retried tool call, confusing setup step, flaky command, stale cache, misleading error, or non-obvious gotcha—use the `papercuts` skill and append it to `.agents/PAPERCUTS.md` in the moment. Continue the current task. Real bugs and tracked work are not papercuts, and sensitive data must never be logged.

Do not mine an entire session for papercuts or start a broad cleanup unless the user explicitly asks.

## Preserve review learnings

After a merge-ready or other code review verifies a finding, use `maintain-greptile-rules` only when the finding exposes a recurring or high-risk repository invariant that existing `.greptile/` context and automated checks do not capture. Do not promote one-off bugs or preferences into permanent review rules.

Changes to `.greptile/**`, `AGENTS.md`, `CLAUDE.md`, `.agents/skills/**`, and `.github/**` alter the review control plane and must receive explicit maintainer review. CODEOWNERS requests that review; where repository settings allow, enable GitHub's requirement for code-owner approval. Repository-specific rules live in `.greptile/`; maintainers should configure or retain a minimal org-enforced Greptile baseline for external-contribution, secret, authentication, billing, CI, and rule-tampering risks. Agents should report an unverified or missing baseline and must not mutate dashboard or organization rules without explicit user authorization.

## GitHub account and ownership

- **`ariaklaar`** is the authenticated GitHub user. **`KlaarNL`** is the organization that owns KlaarNL product repositories. Do not confuse actor and owner.
- KlaarNL forks, remotes, branches, pushes, pull requests, releases, and issues must target `KlaarNL/<repo>`.
- Before any GitHub write, verify `gh api user --jq .login` equals `ariaklaar` and the destination owner equals `KlaarNL`.
- Never write KlaarNL work to `AriaShishegaran` or another personal namespace.
- `every-app/open-seo` is a read-only upstream. KlaarNL changes belong on a `KlaarNL/open-seo` origin or local branch unless an upstream contribution is explicitly requested and authorized.
- Do not create, transfer, rename, or replace a repository or remote to bypass an ownership mismatch without explicit approval.

## GitHub safety

- Prefer read-only checks when authentication, ownership, or remote configuration is unclear.
- Treat GitHub pushes and Cloudflare deployments as separate operations; verify and report each one.

## Collaboration and branch safety

These apply to `KlaarNL/open-seo` (this fork), not to `every-app/open-seo`.

- `main` is this fork's integration branch.
- Start new work from an up-to-date `main` with `git pull --ff-only`. Continue a named branch the
  same way. If fast-forward is refused, stop and reconcile.
- Do work on named branches and land it on `main` with a pull request. Do not commit ordinary work
  directly on `main`.
- Do not force-push `main` or a shared branch unless everyone using it has agreed.
- Do not push KlaarNL work to `every-app/open-seo` unless that upstream contribution is explicitly
  requested and authorized.
