Here is the security audit:

Security Audit: Brick Builder
CRITICAL
1. Migration 001 leaves RLS wide-open for anon role

supabase/migrations/001_rooms_and_bricks.sql:75-87:

create policy "rooms_anon_all" on public.rooms for all to anon using (true) with check (true);
create policy "bricks_anon_all" on public.bricks for all to anon using (true) with check (true);
Anyone can read/write all rooms and bricks without authentication. If migration 002 is never applied, the entire database is public. The README even states: "Production deployments should bolt on auth."

2. Supabase anon key is committed to the repo

.gitignore explicitly allows .env (line 14: .env.local only is ignored). The anon key in apps/web/.env is a publishable key — while RLS should gate access, if RLS is misconfigured or migration 002 is not applied, anyone can read/write all data. The key itself is safe by design but the migration ordering risk is real.

3. Room IDs are the only access control for unprotected rooms

roomSync.ts:108: Rooms without passwords have no membership gate. Anyone who guesses or obtains a room ID can read, modify, and delete all bricks. The newRoomId() function generates 8 characters from a 29-character alphabet (~47 bits of entropy), which is "unguessable" but not cryptographically random — and for unprotected rooms, it's the sole security boundary.

HIGH
4. No rate limiting on password attempts

roomPassword.ts and 002_room_passwords.sql:218-259: The join_room RPC accepts unlimited password attempts. No account lockout, no throttling. An attacker can brute-force password-protected rooms. The 8-character room ID (~47 bits) plus an unbolted password creates a double weak point.

5. set_room_password RPC kicks all members — denial of service vector

002_room_passwords.sql:250-256: Any member can set a new password, which removes all other members and forces re-authentication. A malicious member can exile everyone else. No admin-only restriction.

6. Room deletion is unrestricted

001_rooms_and_bricks.sql:30: The rooms table has no soft-delete mechanism. Any authenticated user with access can delete rooms via the bricks cascade. No ownership model exists — "first creator" is not enforced.

7. No content moderation on chat messages

005_chat.sql:10-17: Messages are limited to 500 chars with a check constraint, but there is no moderation, filtering, or reporting mechanism. No rate limiting on message creation. A malicious user can spam messages in any room they join.

8. Fire-and-forget writes with no error recovery

roomWrites.ts:51-121: All writes use void client.from(...).then(...). Failed writes are silently logged to console with no retry, no user notification, and no conflict resolution. In a network partition scenario, local state diverges permanently.

9. Realtime events are filtered by room_id but not re-validated against RLS

roomSync.ts:154-175: Inbound realtime payloads are validated against the Brick schema (rowToBrickSafe) but the validation does not check room_id on the payload. A malicious peer that bypasses the client and writes directly to the DB could inject bricks into another room if RLS fails.

MEDIUM
10. author_name field in chat is user-controlled with no sanitization

005_chat.sql:14: author_name defaults to 'anon' but the insert policy allows any 1-64 character string from the client. No sanitization or escaping is applied before rendering. XSS risk if the author name is rendered as HTML in the chat UI.

11. No CSRF protection

The app is a SPA served from Netlify with no custom server. Supabase REST API calls use the anon key in the Authorization header. There is no CSRF token mechanism, though this is mitigated by the browser's same-origin policy for the Supabase domain. Still, any XSS vulnerability would expose the key and allow arbitrary requests.

12. search_path pinning in RPCs could be bypassed

004_fix_password_rpc_search_path.sql:21: The search_path is set to public, extensions, pg_temp. If an attacker can create objects in public or extensions with the same name as pgcrypto functions, they could intercept calls. This is mitigated by the order (pg_temp is first), but the pattern is fragile.

13. No data retention policy

Rooms and messages accumulate indefinitely. No cleanup of abandoned rooms, no TTL on messages. This is a data governance and compliance concern (GDPR, right to be forgotten).

14. Client-side UUIDs for bricks — collision risk

editorStore.ts:36-42: Brick IDs are 10 base36 characters from crypto.getRandomValues (~60 bits). The birthday paradox means collision probability is negligible at 10k bricks per room, but across all rooms, the risk grows. No server-side ID generation means a race condition between two clients placing bricks at the same moment could produce duplicates.

LOW
15. LocalStorage autosave bypasses validation on read

persistence.ts:30-31: localStorage.getItem(STORAGE_KEY) is parsed and validated, which is good. However, if the stored JSON is corrupted mid-write (e.g., Safari private mode quota error), the partially-written data could be read on the next load. The try/catch handles this but silently discards the data.

16. URL hash contains full creation data — privacy leak

urlCodec.ts:37-40: Shareable URLs embed the entire creation in the URL hash. These URLs may be logged in browser history, server access logs (if shared via referer), or browser extensions. No encryption on the URL-encoded data.

17. Server app is a placeholder with no security controls

apps/server/src/index.ts: The Fastify server is unused but still present. It has no authentication, rate limiting, or CORS configuration. If deployed, the /health endpoint leaks the service name.

18. No Content-Security-Policy

netlify.toml does not configure CSP headers. Without CSP, the app is more vulnerable to XSS and data injection attacks.