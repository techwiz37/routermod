import os, re, sys, time, logging, json

logging.basicConfig(
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
    level=logging.INFO,
    stream=sys.stderr,
)
log = logging.getLogger("ag")

GOOGLE_PASSWORD = "qwertyui"


def make_driver():
    import platform
    from selenium import webdriver
    opts = webdriver.ChromeOptions()
    opts.add_argument("--headless=new")
    opts.add_argument("--disable-blink-features=AutomationControlled")
    opts.add_argument("--window-size=1366,900")
    opts.add_argument("--disable-features=ProfileSigninInterceptBubble,SigninInterceptBubble")
    opts.add_argument("--no-first-run")
    # VPS / Linux extras
    if platform.system() != "Windows":
        opts.add_argument("--no-sandbox")
        opts.add_argument("--disable-dev-shm-usage")
        opts.add_argument("--disable-gpu")
        opts.add_argument("--remote-debugging-port=0")
    opts.add_argument(
        "user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36"
    )
    opts.add_experimental_option("excludeSwitches", ["enable-automation"])
    opts.add_experimental_option("useAutomationExtension", False)
    driver = webdriver.Chrome(options=opts)
    driver.execute_cdp_cmd("Page.addScriptToEvaluateOnNewDocument", {
        "source": "Object.defineProperty(navigator,'webdriver',{get:()=>undefined})"
    })
    return driver


def click_el(driver, el):
    try:
        el.click()
    except Exception:
        driver.execute_script("arguments[0].click();", el)


def click_xpath(driver, wait, xpath):
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support import expected_conditions as EC
    click_el(driver, wait.until(EC.element_to_be_clickable((By.XPATH, xpath))))


def login_9router(driver, wait, page_url, password):
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support import expected_conditions as EC
    driver.get(page_url)
    if "/login" in driver.current_url:
        wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, 'input[type="password"]'))).send_keys(password)
        click_xpath(driver, wait, "//button[normalize-space(.)='Login']")
        wait.until(EC.url_contains("/dashboard"))
    driver.get(page_url)
    log.info("GET %s OK", page_url)


def open_connect_modal(driver, wait):
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support import expected_conditions as EC
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.common.exceptions import TimeoutException
    wait.until(EC.url_contains("/providers/antigravity"))
    click_xpath(driver, wait, "//button[contains(.,'Add')]")
    try:
        click_xpath(driver, WebDriverWait(driver, 3), "//button[contains(.,'I Understand')]")
    except TimeoutException:
        pass
    wait.until(EC.visibility_of_element_located((By.XPATH, "//h2[contains(.,'Connect Antigravity')]")))


def get_oauth_url(driver):
    from selenium.common.exceptions import TimeoutException
    from selenium.webdriver.common.by import By
    end = time.time() + 10
    while time.time() < end:
        for e in driver.find_elements(By.TAG_NAME, "input"):
            val = e.get_attribute("value") or ""
            if "accounts.google.com" in val:
                return val
        time.sleep(0.2)
    raise TimeoutException("OAuth URL timeout")


def google_login(driver, wait, email, oauth_url):
    from selenium.webdriver.common.by import By
    from selenium.webdriver.common.keys import Keys
    from selenium.common.exceptions import TimeoutException
    main = driver.current_window_handle
    driver.switch_to.new_window("tab")
    driver.get(oauth_url)
    log.info("Memproses OAuth Google untuk %s ...", email)

    chooser = []
    try:
        chooser = driver.find_elements(By.XPATH, f"//button[contains(.,'{email}')]")
    except Exception:
        pass

    if chooser:
        click_el(driver, chooser[0])
    else:
        from selenium.webdriver.support.ui import WebDriverWait
        from selenium.webdriver.support import expected_conditions as EC
        email_in = wait.until(EC.element_to_be_clickable(
            (By.CSS_SELECTOR, 'input[name="identifier"], input[type="email"]')
        ))
        email_in.clear()
        email_in.send_keys(email)
        time.sleep(0.3)
        email_in.send_keys(Keys.ENTER)
        try:
            from selenium.webdriver.support.ui import WebDriverWait
            click_xpath(driver, WebDriverWait(driver, 2),
                        "//button[.//span[text()='Next'] or normalize-space(.)='Next']")
        except Exception:
            pass

    from selenium.webdriver.support import expected_conditions as EC
    pwd = wait.until(EC.element_to_be_clickable(
        (By.CSS_SELECTOR, 'input[type="password"], input[name="Passwd"]')
    ))
    pwd.send_keys(GOOGLE_PASSWORD)
    pwd.send_keys(Keys.ENTER)

    end = time.time() + 45
    while time.time() < end:
        try:
            curr_url = driver.current_url
            if "/callback?" in curr_url:
                callback = curr_url
                driver.close()
                driver.switch_to.window(main)
                log.info("Callback diterima untuk %s", email)
                return callback
            for text in ("Sign in", "Continue", "Allow", "I understand", "I Understand",
                         "Next", "Lanjut", "Saya mengerti"):
                try:
                    btns = driver.find_elements(By.XPATH, f"//button[contains(.,'{text}')]")
                    if btns:
                        click_el(driver, btns[0])
                        break
                except Exception:
                    pass
        except Exception:
            pass
        time.sleep(0.5)
    raise TimeoutException("Google OAuth timeout")


def submit_callback(driver, wait, callback):
    from selenium.webdriver.common.by import By

    def find_box(d):
        return next((
            i for i in d.find_elements(By.TAG_NAME, "input")
            if i.is_displayed() and "accounts.google.com" not in (i.get_attribute("value") or "")
        ), None)

    box = wait.until(find_box)
    box.clear()
    box.send_keys(callback)
    time.sleep(0.3)
    click_xpath(driver, wait, "//button[contains(.,'Connect')]")


def wait_connected(driver):
    from selenium.webdriver.common.by import By
    end = time.time() + 15
    while time.time() < end:
        modals = driver.find_elements(By.XPATH, "//h2[contains(.,'Connect Antigravity')]")
        if not modals:
            return
        time.sleep(0.5)


def process_account(email, page_url, password):
    from selenium.webdriver.support.ui import WebDriverWait
    log.info("Memulai proses untuk: %s", email)
    driver = make_driver()
    wait = WebDriverWait(driver, 15)
    try:
        login_9router(driver, wait, page_url, password)
        open_connect_modal(driver, wait)
        oauth_url = get_oauth_url(driver)
        callback = google_login(driver, wait, email, oauth_url)
        submit_callback(driver, wait, callback)
        wait_connected(driver)
        log.info("SUKSES - %s berhasil ditambahkan", email)
        return True
    except Exception as e:
        log.error("GAGAL - %s: %s", email, str(e)[:120])
        return False
    finally:
        driver.quit()


def main():
    # Args: page_url password email1 email2 ...
    if len(sys.argv) < 4:
        print("Usage: ag_runner.py <page_url> <password> <email1> [email2 ...]", file=sys.stderr)
        sys.exit(1)

    page_url = sys.argv[1]
    password = sys.argv[2]
    emails = sys.argv[3:]

    log.info("=== Memulai bulk add %d akun ===", len(emails))

    added = 0
    failed = 0
    for i, email in enumerate(emails, 1):
        log.info("--- Akun %d/%d: %s ---", i, len(emails), email)
        ok = process_account(email, page_url, password)
        if ok:
            added += 1
        else:
            failed += 1

    log.info("=== Selesai: %d sukses, %d gagal ===", added, failed)
    # JSON summary to stdout (parsed by route.js)
    print(json.dumps({"added": added, "failed": failed, "total": len(emails)}), flush=True)


if __name__ == "__main__":
    main()
