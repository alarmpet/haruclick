# Calendar Chat Remaining Plan (Updated 2026-03-02)

## Objective
Bring shared-calendar chat to production readiness with verified security, stable UX, repeatable E2E, and basic operations guardrails.

## Codebase Alignment (Verified)
1. Chat schema/policies/realtime migrations exist (`20260211`, `20260212`, `20260213`).
2. Chat data/realtime module exists (`services/supabase-modules/chat.ts`).
3. Chat screen is implemented (`app/calendar/chat/[id].tsx`):
   - older-message pagination button
   - day separators
   - realtime status banner
   - optimistic send + retry UI
4. Web two-user E2E exists (`e2e/test_chat_flow.py`, `e2e/run_chat_flow.ps1`) and npm scripts are wired (`e2e:chat:web`, `chat:finalize`, `chat:finalize:e2e`).

## Plan Drift / Gaps Found
1. Previous Phase B contained completed items (pagination/day separator/profile fallback) and needed cleanup.
2. Unread anchor/first-unread jump behavior is still not implemented.
3. CI does not run chat E2E yet (`.github/workflows/ci.yml` only lint/test).
4. RLS negative tests are documented but not automated as a repeatable test job.
5. Optimistic message reconciliation currently matches by message text, which can mis-match duplicated text sends.
6. Pagination cursor conversion uses JS `Date` re-serialization, risking timestamp precision loss on edge cases.
7. Chat observability, anti-spam rate limits, and retention policy are still undefined.
8. Some chat UI copy shows encoding corruption and needs text QA.

## Remaining Work (Prioritized)

### Phase A: Security and Correctness Closure
1. Apply chat migrations in staging (through `20260213`) and archive execution evidence.
2. Run `docs/sql/verify_calendar_chat.sql` in staging and save output snapshot.
3. Add repeatable RLS negative test script/runbook:
   - non-member cannot `select/insert/delete`
   - personal calendar cannot be used for chat
4. Decide chat write permission policy:
   - keep current `get_my_calendar_ids()` (viewer can send), or
   - switch to `get_my_editable_calendar_ids()` (editor/owner only)
5. Decide and document retention policy (keep forever vs rolling delete) and enforcement method.

### Phase B: Chat UX Hardening
1. Implement unread anchor behavior (first unread jump + badge/reset rule).
2. Replace blocking `Alert`-only error UX with non-blocking toast/banner strategy for send/reconnect.
3. Fix optimistic reconciliation collision risk:
   - adopt deterministic client message key strategy (recommended), or
   - add robust fallback matching rule.
4. Preserve raw DB timestamp in pagination cursor path (avoid precision-loss re-serialization).
5. Fix chat-related corrupted UI strings and validate Korean copy rendering.

### Phase C: E2E and CI Hardening
1. Add chat web E2E workflow in GitHub Actions:
   - nightly schedule (required)
   - optional manual dispatch
2. Add deterministic cleanup for E2E-created calendars/invites.
3. Add second E2E scenario:
   - removed member loses chat read/write access immediately.
4. Keep Detox scope as native smoke only (camera/voice/OCR critical paths).

### Phase D: Operations Readiness
1. Add chat telemetry events:
   - send fail
   - subscribe fail
   - reconnect count
   - average reconnect duration
2. Add message spam guardrails (DB or edge-layer rate limit).
3. Define push notification integration interface (implementation stays out of current scope).

## Exit Criteria
1. Staging DB verification artifacts are archived (`verify_calendar_chat.sql` + negative tests).
2. Chat permission decision (viewer vs editor-only send) is documented and reflected in SQL policies.
3. Chat E2E runs in CI and passes 5 consecutive runs.
4. No confirmed P1/P2 chat defects for one release cycle.
