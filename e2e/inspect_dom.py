"""
DOM inspector for login page reconnaissance.
"""

import argparse
from pathlib import Path
from playwright.sync_api import TimeoutError as PlaywrightTimeoutError, sync_playwright


def goto_with_retry(page, url: str, attempts: int = 6) -> None:
    for idx in range(attempts):
        try:
            page.goto(url, wait_until="domcontentloaded", timeout=20000)
            return
        except PlaywrightTimeoutError:
            if idx == attempts - 1:
                raise
            page.wait_for_timeout(5000)


def inspect_dom(base_url: str, path: str) -> None:
    screenshots_dir = Path("e2e/screenshots")
    screenshots_dir.mkdir(parents=True, exist_ok=True)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.set_default_timeout(60000)

        target_url = f"{base_url}{path}"
        goto_with_retry(page, target_url)
        try:
            page.wait_for_load_state("networkidle", timeout=60000)
        except PlaywrightTimeoutError:
            # Expo web can keep network active; continue after initial DOM load.
            pass

        # Wait for login screen input if route is auth/login.
        if path == "/auth/login":
            try:
                page.locator('[data-testid="login-email-input"]').wait_for(timeout=20000)
            except PlaywrightTimeoutError:
                # Fallback for transient render timing on Expo web.
                ready = False
                for _ in range(12):
                    if "/auth/login" not in page.url:
                        goto_with_retry(page, target_url)
                        settle_timeout = 15000
                        try:
                            page.wait_for_load_state("networkidle", timeout=settle_timeout)
                        except PlaywrightTimeoutError:
                            pass
                    if page.locator("input").count() > 0 or "login-email-input" in page.content():
                        ready = True
                        break
                    page.wait_for_timeout(5000)
                if not ready:
                    print("warn=login_dom_not_ready")

        page.screenshot(path=str(screenshots_dir / "login_page.png"), full_page=True)
        html_path = screenshots_dir / "login_page.html"
        html_path.write_text(page.content(), encoding="utf-8")

        inputs = page.locator("input").all()
        buttons = page.locator("button").all()
        links = page.locator("a").all()

        print(f"inputs={len(inputs)}")
        print(f"buttons={len(buttons)}")
        print(f"links={len(links)}")
        print(f"saved={html_path}")
        if len(inputs) == 0:
            print("warn=no_input_elements_found")

        browser.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Inspect login DOM for selector discovery")
    parser.add_argument("--base-url", default="http://localhost:8090", help="Web app base URL")
    parser.add_argument("--path", default="/auth/login", help="Path to inspect")
    args = parser.parse_args()
    inspect_dom(args.base_url, args.path)
