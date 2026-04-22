# Postmortem — security audit triage (2026-04-17)

Triage pass over `security-audit.md`. The audit listed 18 findings; the
app has shipped features since the audit was written, so several items
are stale. Below is the status of each plus the rationale for what got
fixed, what got deferred, and what was rejected.

## Outcome

- **Fixed this pass (migration 009_rate_limits.sql):** #4 join_room
  brute-force floor · #7 chat rate limit.
- **Deliberately deferred:** #5 + #6 ownership model. Reason below.
- **Already resolved / not actually issues:** 7 items.
- **Design tradeoffs accepted:** 7 items.

## Per-finding status

| # | Title | Status | Note |
|---|---|---|---|
| 1 | RLS wide-open for anon in migration 001 | Resolved | Migration 002 drops the `*_anon_all` policies and switches to membership-gated `authenticated` ones. |
| 2 | Supabase anon key in repo | Accepted | Publishable by design; risk is RLS misconfig, mitigated by 002. |
| 3 | Room IDs as sole access control for unprotected rooms | Accepted | Capability-URL model; password option exists for anything sensitive. |
| 4 | No rate limit on join_room | **Fixed** | Migration 009 adds `pg_sleep(0.5 + random()*0.2)` in the password branch. Public rooms skip the sleep — nothing to brute force. |
| 5 | set_room_password kicks all other members | Deferred | Needs ownership model. User decision: out of scope — "not handling bank accounts." |
| 6 | Room deletion unrestricted | Deferred | Same ownership-model dependency as #5. |
| 7 | No chat rate limit | **Fixed** | Migration 009 tightens `messages_insert` RLS: reject when caller has ≥ 10 messages in the last 10s for that room. Cheap — served by `messages_room_time_idx`. |
| 8 | Fire-and-forget writes, no retry | Accepted | Reliability concern, not security. |
| 9 | Realtime payloads not re-validated against RLS | Rejected | Misread. RLS is server-enforced; a malicious peer can't bypass it. |
| 10 | author_name XSS risk | Rejected | `ChatPanel.tsx:106` renders via `{m.authorName}` — React escapes by default. |
| 11 | No CSRF protection | Rejected | Supabase uses Bearer tokens in `Authorization` header, not cookies. CSRF doesn't apply. |
| 12 | `search_path` pinning fragility | Accepted | Standard Supabase pattern (`public, extensions, pg_temp`). |
| 13 | No data retention policy | Accepted | Pre-v1 concern. |
| 14 | Client-side brick ID collisions | Accepted | 60 bits, acknowledged in `editorStore.ts` comment. |
| 15 | localStorage corruption on read | Resolved | `persistence.ts` already guards with try/catch. |
| 16 | URL-hash creation-data privacy | Accepted | Intended share mechanism; user controls distribution. |
| 17 | apps/server has no security controls | Accepted | Not deployed. Will be revisited when server goes live (Phase 6+). |
| 18 | No CSP headers | Stale | Referenced `netlify.toml`; deployment moved to GitHub Pages since the audit. GitHub Pages can't send server headers. Could add a meta-CSP but coverage is limited (no `frame-ancestors`). Framebusting in `main.tsx` already mitigates clickjacking. |

## Why #5 + #6 were deferred

Both require a `rooms.created_by uuid` column + an RLS rule that
restricts `set_room_password` and `delete` to the creator (or a
trusted-admin set). Cost: one migration, one code path through
`create_room`, one UI branch for "you're not the creator."

The tradeoff: the existing password mechanism already covers the
intended threat model — a room is a shared capability, and anyone who
has the password is trusted enough to manage it. Locking down
member-driven rotation would mostly prevent social griefing, which the
user explicitly accepted. Revisit if room sharing widens (public
listings, onboarding paths that hand out room URLs without the
accompanying context).

## Other changes observed in this pass

These aren't audit items but are worth noting for the record:

- `.gitignore` tightened to block all `.env` files in an earlier
  session (the audit was written against the older permissive policy).
  Anon key remains committed in `apps/web/.env` — still safe by design.
- Admin panel (`?admin=1`) landed with its own hardened surface
  (`supabase/migrations/006_admin.sql` through `008_admin_overrides.sql`):
  bcrypt creds, `pg_sleep` verify floor, SECURITY DEFINER RPCs with
  pinned search_path, server-side sessions. The admin surface does
  not inherit audit findings from the room surface.

## Revisit triggers

Re-run the audit (or a subset) when:

- The app moves from hobby-scale to anything multi-tenant with value
  at stake (paid users, SSO, user-uploaded art). Items #5, #6, #13
  become load-bearing.
- `apps/server` is deployed (Phase 6). #17 becomes active.
- Chat grows beyond a single author-name string (emoji, markdown,
  mentions). #10 should be re-verified against any new rendering
  paths.
- `netlify.toml` is removed or a server-side edge function is added
  (Cloudflare Pages Functions, a Supabase Edge Function). #18 becomes
  actionable — add a proper CSP.
