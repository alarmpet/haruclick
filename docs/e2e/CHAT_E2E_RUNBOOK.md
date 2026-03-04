# Calendar Chat E2E Runbook

## Goal
Validate shared calendar chat end-to-end on web with two real users:
create calendar, generate invite code, join, and realtime message exchange.

## Prerequisites
1. Two test accounts in Supabase Auth.
2. App `.env` is configured for the target Supabase project.
3. Python + Playwright installed.
4. Skill helper exists at `C:\Users\petbl\skills\webapp-testing\scripts\with_server.py`.

## Environment Variables
You can set values in your shell or place them in a local env loader.
Example values are provided in `e2e/.env.chat.example`.

```powershell
$env:HC_E2E_OWNER_EMAIL="owner@example.com"
$env:HC_E2E_OWNER_PASSWORD="owner-password"
$env:HC_E2E_GUEST_EMAIL="guest@example.com"
$env:HC_E2E_GUEST_PASSWORD="guest-password"
```

## Run (Recommended)
```powershell
npm run e2e:chat:web
```

One-pass local validation (typecheck + script checks + optional E2E):
```powershell
npm run chat:finalize
```

Include E2E in one-pass validation:
```powershell
npm run chat:finalize:e2e
```

Optional direct command:
```powershell
powershell -ExecutionPolicy Bypass -File e2e/run_chat_flow.ps1 -BaseUrl "http://localhost:8090" -Port 8090
```

## Pass Criteria
1. Console prints `PASS: two-user realtime chat flow completed`.
2. `e2e/screenshots/chat_owner_success.png` is created.
3. `e2e/screenshots/chat_guest_success.png` is created.

## Failure Triage
1. Verify test account credentials and email confirmation status.
2. Verify chat migrations/policies via `docs/sql/verify_calendar_chat.sql`.
3. Verify required `testID` selectors still exist in screens.
