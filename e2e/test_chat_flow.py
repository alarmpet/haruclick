"""
Calendar chat E2E (two-user realtime scenario).

Prerequisite example:
python C:\\Users\\petbl\\skills\\webapp-testing\\scripts\\with_server.py \
  --server "npm run web" --port 8090 -- \
  python e2e/test_chat_flow.py --base-url http://localhost:8090

Required environment variables:
- HC_E2E_OWNER_EMAIL
- HC_E2E_OWNER_PASSWORD
- HC_E2E_GUEST_EMAIL
- HC_E2E_GUEST_PASSWORD
"""

import argparse
import os
import time
from pathlib import Path
from playwright.sync_api import Page, TimeoutError as PlaywrightTimeoutError, expect, sync_playwright


def by_test_id(test_id: str) -> str:
    return f'[data-testid="{test_id}"]'


def goto_with_retry(page: Page, url: str, attempts: int = 8) -> None:
    for idx in range(attempts):
        try:
            page.goto(url, wait_until="domcontentloaded", timeout=20000)
            return
        except PlaywrightTimeoutError:
            if idx == attempts - 1:
                raise
            page.wait_for_timeout(5000)


def settle(page: Page) -> None:
    try:
        page.wait_for_load_state("networkidle", timeout=60000)
    except PlaywrightTimeoutError:
        pass


def wait_for_login_ui(page: Page, timeout_ms: int = 20000) -> bool:
    email = page.locator(by_test_id("login-email-input"))
    password = page.locator(by_test_id("login-password-input"))
    submit = page.locator(by_test_id("login-submit-button"))
    try:
        expect(email).to_be_visible(timeout=timeout_ms)
        expect(password).to_be_visible(timeout=timeout_ms)
        expect(submit).to_be_visible(timeout=timeout_ms)
        return True
    except (PlaywrightTimeoutError, AssertionError):
        return False


def attach_dialog_autoclose(page: Page) -> None:
    page.on("dialog", lambda dialog: dialog.accept())


def warmup_web_app(browser, base_url: str) -> None:
    context = browser.new_context()
    page = context.new_page()
    page.set_default_timeout(60000)
    try:
        for _ in range(20):
            goto_with_retry(page, f"{base_url}/auth/login")
            settle(page)
            if wait_for_login_ui(page, timeout_ms=5000):
                return
            if page.locator("input").count() >= 2:
                return
            page.wait_for_timeout(3000)
        screenshot_path = Path("e2e/screenshots/warmup_not_ready.png")
        html_path = Path("e2e/screenshots/warmup_not_ready.html")
        screenshot_path.parent.mkdir(parents=True, exist_ok=True)
        page.screenshot(path=str(screenshot_path), full_page=True)
        html_path.write_text(page.content(), encoding="utf-8")
        print(f"WARN: warmup not ready. screenshot={screenshot_path} html={html_path}")
    finally:
        context.close()


def login(page: Page, base_url: str, email: str, password: str) -> None:
    goto_with_retry(page, f"{base_url}/")
    settle(page)
    goto_with_retry(page, f"{base_url}/auth/login")
    settle(page)

    # If already logged in, skip credential input.
    if page.locator(by_test_id("calendar-open-manage-button")).count() > 0:
        return

    login_ready = False
    for attempt in range(18):
        if wait_for_login_ui(page, timeout_ms=3000):
            login_ready = True
            break
        if page.locator("input").count() >= 2:
            login_ready = True
            break

        if attempt % 6 == 5:
            goto_with_retry(page, f"{base_url}/")
            settle(page)
            goto_with_retry(page, f"{base_url}/auth/login")
            settle(page)
        else:
            try:
                page.reload(wait_until="domcontentloaded", timeout=30000)
            except PlaywrightTimeoutError:
                pass
            settle(page)
        page.wait_for_timeout(3000)

    if login_ready and wait_for_login_ui(page, timeout_ms=5000):
        page.locator(by_test_id("login-email-input")).fill(email)
        page.locator(by_test_id("login-password-input")).fill(password)
        page.locator(by_test_id("login-submit-button")).click(force=True)
    else:
        # Fallback selectors for RN-web DOM differences.
        inputs = page.locator("input")
        if inputs.count() >= 2:
            inputs.nth(0).fill(email)
            inputs.nth(1).fill(password)
            buttons = page.locator("button")
            if buttons.count() > 0:
                buttons.nth(0).click(force=True)
            else:
                raise RuntimeError("Login button not found after fallback selector search")
        else:
            screenshot_path = Path("e2e/screenshots/login_not_ready.png")
            html_path = Path("e2e/screenshots/login_not_ready.html")
            screenshot_path.parent.mkdir(parents=True, exist_ok=True)
            page.screenshot(path=str(screenshot_path), full_page=True)
            html_path.write_text(page.content(), encoding="utf-8")
            raise RuntimeError(
                f"Login UI not ready. url={page.url} screenshot={screenshot_path} html={html_path}"
            )

    settle(page)
    goto_with_retry(page, f"{base_url}/calendar/manage")
    settle(page)
    expect(page.locator(by_test_id("calendar-manage-create-button"))).to_be_visible(timeout=20000)


def open_manage(page: Page, base_url: str) -> None:
    goto_with_retry(page, f"{base_url}/calendar/manage")
    settle(page)
    expect(page.locator(by_test_id("calendar-manage-create-button"))).to_be_visible(timeout=20000)


def create_shared_calendar(page: Page, base_url: str, calendar_name: str) -> None:
    goto_with_retry(page, f"{base_url}/calendar/manage/create")
    settle(page)

    page.locator(by_test_id("create-calendar-name-input")).fill(calendar_name)
    page.locator(by_test_id("create-calendar-submit-button")).click(force=True)
    page.wait_for_timeout(1500)

    # Ensure we're on list screen then open created calendar.
    if "/calendar/manage/create" in page.url:
        goto_with_retry(page, f"{base_url}/calendar/manage")
        settle(page)

    expect(page.get_by_text(calendar_name)).to_be_visible(timeout=20000)
    page.get_by_text(calendar_name).first.click(force=True)
    settle(page)


def generate_invite_code(page: Page) -> str:
    expect(page.locator(by_test_id("calendar-generate-invite-button"))).to_be_visible(timeout=20000)
    page.locator(by_test_id("calendar-generate-invite-button")).click(force=True)
    expect(page.locator(by_test_id("calendar-invite-modal-confirm-button"))).to_be_visible(timeout=20000)
    page.locator(by_test_id("calendar-invite-modal-confirm-button")).click(force=True)
    expect(page.locator(by_test_id("calendar-invite-code-text"))).to_be_visible(timeout=20000)
    code = page.locator(by_test_id("calendar-invite-code-text")).inner_text().strip()
    if len(code) != 8:
        raise RuntimeError(f"Invalid invite code detected: {code}")
    return code


def join_by_code(page: Page, base_url: str, code: str) -> None:
    goto_with_retry(page, f"{base_url}/calendar/manage/join")
    settle(page)

    expect(page.locator(by_test_id("join-calendar-code-input"))).to_be_visible(timeout=20000)
    page.locator(by_test_id("join-calendar-code-input")).fill(code)
    page.locator(by_test_id("join-calendar-submit-button")).click(force=True)
    page.wait_for_timeout(1500)

    if "/calendar/manage/join" in page.url:
        goto_with_retry(page, f"{base_url}/calendar/manage")
        settle(page)


def open_calendar_detail(page: Page, base_url: str, calendar_name: str) -> None:
    goto_with_retry(page, f"{base_url}/calendar/manage")
    settle(page)
    expect(page.get_by_text(calendar_name)).to_be_visible(timeout=20000)
    page.get_by_text(calendar_name).first.click(force=True)
    settle(page)


def open_chat(page: Page) -> None:
    expect(page.locator(by_test_id("calendar-detail-open-chat-button"))).to_be_visible(timeout=20000)
    page.locator(by_test_id("calendar-detail-open-chat-button")).click(force=True)
    settle(page)
    expect(page.locator(by_test_id("chat-message-input"))).to_be_visible(timeout=20000)


def send_message(page: Page, message: str) -> None:
    page.locator(by_test_id("chat-message-input")).fill(message)
    page.locator(by_test_id("chat-send-button")).click(force=True)
    expect(page.get_by_text(message)).to_be_visible(timeout=20000)


def assert_message_visible(page: Page, message: str) -> None:
    expect(page.get_by_text(message)).to_be_visible(timeout=20000)


def require_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"Missing {name}")
    return value


def test_two_user_chat_flow(base_url: str) -> None:
    owner_email = require_env("HC_E2E_OWNER_EMAIL")
    owner_password = require_env("HC_E2E_OWNER_PASSWORD")
    guest_email = require_env("HC_E2E_GUEST_EMAIL")
    guest_password = require_env("HC_E2E_GUEST_PASSWORD")

    ts = int(time.time())
    calendar_name = f"E2E Shared Calendar {ts}"
    owner_msg = f"owner-msg-{ts}"
    guest_msg = f"guest-msg-{ts}"

    screenshots_dir = Path("e2e/screenshots")
    screenshots_dir.mkdir(parents=True, exist_ok=True)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        warmup_web_app(browser, base_url)
        owner_context = browser.new_context()
        guest_context = browser.new_context()
        owner_page = owner_context.new_page()
        guest_page = guest_context.new_page()
        owner_page.set_default_timeout(60000)
        guest_page.set_default_timeout(60000)
        attach_dialog_autoclose(owner_page)
        attach_dialog_autoclose(guest_page)

        try:
            login(owner_page, base_url, owner_email, owner_password)
            login(guest_page, base_url, guest_email, guest_password)

            create_shared_calendar(owner_page, base_url, calendar_name)
            invite_code = generate_invite_code(owner_page)

            join_by_code(guest_page, base_url, invite_code)

            open_chat(owner_page)
            open_calendar_detail(guest_page, base_url, calendar_name)
            open_chat(guest_page)

            send_message(owner_page, owner_msg)
            assert_message_visible(guest_page, owner_msg)

            send_message(guest_page, guest_msg)
            assert_message_visible(owner_page, guest_msg)

            owner_page.screenshot(path=str(screenshots_dir / "chat_owner_success.png"), full_page=True)
            guest_page.screenshot(path=str(screenshots_dir / "chat_guest_success.png"), full_page=True)
            print("PASS: two-user realtime chat flow completed")
        finally:
            browser.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run two-user calendar chat E2E test")
    parser.add_argument("--base-url", default="http://localhost:8090", help="Web app base URL")
    args = parser.parse_args()
    test_two_user_chat_flow(args.base_url)
