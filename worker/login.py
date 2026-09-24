"""One-off: open Chromium with the persistent profile and log in to Facebook by hand.

    python -m worker.login

Log in, dismiss any prompts, then close the window. The session stays in the
profile directory and every later capture reuses it.
"""

from playwright.sync_api import sync_playwright

from . import config


def _browser_channel() -> dict:
    """Use installed Google Chrome (plays Facebook video); fall back to bundled Chromium."""
    import os
    ch = os.environ.get("BROWSER_CHANNEL", "chrome").strip()
    if ch and os.path.exists("/Applications/Google Chrome.app"):
        return {"channel": ch}
    return {}


def main() -> None:
    with sync_playwright() as p:
        context = p.chromium.launch_persistent_context(
            **_browser_channel(),
            user_data_dir=str(config.PROFILE_DIR),
            headless=False,
            viewport={"width": 1280, "height": 1600},
        )
        page = context.pages[0] if context.pages else context.new_page()
        page.goto("https://www.facebook.com/", wait_until="domcontentloaded")
        print("Log in in the browser window, then close it to save the session.")
        page.wait_for_event("close", timeout=0)
        context.close()


if __name__ == "__main__":
    main()
