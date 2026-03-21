/**
 * Blomp Dashboard Login Automation
 * ---------------------------------
 * Reads credentials from accounts.json, logs into https://dashboard.blomp.com/
 * for each account in an isolated browser session with anti-detection measures,
 * simulates brief human-like activity, then cleanly tears down the session.
 *
 * Usage:  node index.js
 */

const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

// ─── Configuration ───────────────────────────────────────────────────────────

const CONFIG = {
  loginUrl: "https://dashboard.blomp.com/",
  selectors: {
    emailInput: 'input[name="email"]',
    passwordInput: 'input[name="password"]',
    loginButton: "button.login",
  },
  // Timing ranges (ms) — randomised within each range
  typing: { min: 80, max: 220 },          // per-keystroke delay
  actionPause: { min: 500, max: 2000 },    // pause between UI actions
  activityDuration: { min: 4000, max: 6000 }, // total "stay active" time
  interAccountDelay: { min: 2000, max: 5000 },
  navigationTimeout: 30_000,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Inclusive random integer between min and max. */
const randomBetween = (min, max) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

/** Promise-based sleep. */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Pick a random element from an array. */
const pickRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];

/** Timestamped console log. */
const log = (msg) =>
  console.log(`[${new Date().toISOString()}]  ${msg}`);

// ─── Anti-Detection Data ─────────────────────────────────────────────────────

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36 Edg/123.0.0.0",
];

const VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1536, height: 864 },
  { width: 1280, height: 720 },
];

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Berlin",
  "Asia/Tokyo",
];

const LOCALES = ["en-US", "en-GB", "en-CA", "en-AU", "de-DE", "fr-FR"];

// ─── Core Functions ──────────────────────────────────────────────────────────

/**
 * Launch an isolated Chromium browser context with randomised fingerprint.
 * Returns { browser, context, page }.
 */
async function launchSession() {
  const userAgent = pickRandom(USER_AGENTS);
  const viewport = pickRandom(VIEWPORTS);
  const locale = pickRandom(LOCALES);
  const timezoneId = pickRandom(TIMEZONES);

  const browser = await chromium.launch({
    headless: true,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-sandbox",
      "--disable-dev-shm-usage",
    ],
  });

  const context = await browser.newContext({
    userAgent,
    viewport,
    locale,
    timezoneId,
    // Mask automation signals
    javaScriptEnabled: true,
    bypassCSP: false,
    ignoreHTTPSErrors: false,
  });

  // Remove the navigator.webdriver flag
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", {
      get: () => undefined,
    });
  });

  const page = await context.newPage();

  log(
    `  Session: UA=${userAgent.slice(0, 50)}…  viewport=${viewport.width}x${viewport.height}  locale=${locale}  tz=${timezoneId}`
  );

  return { browser, context, page };
}

/**
 * Navigate to the login page and authenticate.
 * Throws on failure or timeout.
 */
async function performLogin(page, account) {
  log(`  Navigating to login page…`);
  await page.goto(CONFIG.loginUrl, {
    waitUntil: "domcontentloaded",
    timeout: CONFIG.navigationTimeout,
  });

  // Small pause to let any lazy scripts initialise
  await sleep(randomBetween(800, 1500));

  // ── Type email ──
  const emailField = page.locator(CONFIG.selectors.emailInput);
  await emailField.click();
  await sleep(randomBetween(200, 500));
  await emailField.pressSequentially(account.email, {
    delay: randomBetween(CONFIG.typing.min, CONFIG.typing.max),
  });

  // ── Pause between fields (human-like) ──
  await sleep(randomBetween(CONFIG.actionPause.min, CONFIG.actionPause.max));

  // ── Type password ──
  const passwordField = page.locator(CONFIG.selectors.passwordInput);
  await passwordField.click();
  await sleep(randomBetween(200, 500));
  await passwordField.pressSequentially(account.password, {
    delay: randomBetween(CONFIG.typing.min, CONFIG.typing.max),
  });

  // ── Pause, then click login ──
  await sleep(randomBetween(CONFIG.actionPause.min, CONFIG.actionPause.max));
  const loginBtn = page.locator(CONFIG.selectors.loginButton);
  await loginBtn.scrollIntoViewIfNeeded();
  await loginBtn.hover();
  await sleep(randomBetween(200, 400));
  await loginBtn.click();

  // ── Wait for navigation or error ──
  log(`  Waiting for post-login response…`);
  try {
    await page.waitForURL((url) => !url.toString().includes("/authorize"), {
      timeout: CONFIG.navigationTimeout,
    });
  } catch {
    // Navigation didn't change URL — check for on-page errors
  }

  // Detect common error messages on the page
  const pageContent = await page.content();
  const errorPatterns = [
    "invalid credentials",
    "these credentials do not match",
    "login failed",
    "too many attempts",
    "account has been locked",
    "verify your email",
  ];
  const lowerContent = pageContent.toLowerCase();
  for (const pattern of errorPatterns) {
    if (lowerContent.includes(pattern)) {
      throw new Error(`Login rejected: "${pattern}" detected on page`);
    }
  }

  // If still on the login page, flag as failure
  const currentUrl = page.url();
  if (
    currentUrl === CONFIG.loginUrl ||
    currentUrl.includes("/authorize") ||
    currentUrl.includes("dashboard.blomp.com/#")
  ) {
    // Grab any visible alert text for diagnostics
    const alertText = await page
      .locator(".alert, .error, .notification")
      .first()
      .textContent()
      .catch(() => null);
    throw new Error(
      `Still on login page after submit${alertText ? `: ${alertText.trim()}` : ""}`
    );
  }

  log(`  ✓ Login successful — redirected to ${currentUrl}`);
}

/**
 * Simulate ~5 seconds of random human-like activity.
 */
async function simulateActivity(page) {
  log(`  Simulating human activity…`);
  const totalTime = randomBetween(
    CONFIG.activityDuration.min,
    CONFIG.activityDuration.max
  );
  const start = Date.now();

  while (Date.now() - start < totalTime) {
    const action = randomBetween(1, 3);

    switch (action) {
      case 1: {
        // Random scroll
        const scrollY = randomBetween(100, 500);
        const direction = Math.random() > 0.5 ? scrollY : -scrollY;
        await page.evaluate((dy) => window.scrollBy(0, dy), direction);
        log(`    ↕ Scrolled ${direction > 0 ? "down" : "up"} ${Math.abs(direction)}px`);
        break;
      }
      case 2: {
        // Random mouse move
        const vp = page.viewportSize() || { width: 1280, height: 720 };
        const x = randomBetween(50, vp.width - 50);
        const y = randomBetween(50, vp.height - 50);
        await page.mouse.move(x, y, {
          steps: randomBetween(5, 15),
        });
        log(`    🖱 Mouse moved to (${x}, ${y})`);
        break;
      }
      case 3: {
        // Just wait (idle moment)
        log(`    ⏳ Idle pause`);
        break;
      }
    }

    await sleep(randomBetween(600, 1800));
  }

  log(`  Activity simulation complete (${((Date.now() - start) / 1000).toFixed(1)}s)`);
}

/**
 * Orchestrate a single account: launch → login → activity → cleanup.
 * Returns a result object for the summary.
 */
async function processAccount(account, index, total) {
  log(`━━━ Account ${index + 1}/${total}: ${account.email} ━━━`);

  let browser;
  try {
    const session = await launchSession();
    browser = session.browser;

    await performLogin(session.page, account);
    await simulateActivity(session.page);

    log(`  ✓ Done — closing session.\n`);
    return { email: account.email, status: "✅ SUCCESS", error: null };
  } catch (err) {
    log(`  ✗ Failed: ${err.message}\n`);
    return { email: account.email, status: "❌ FAILED", error: err.message };
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  // Read accounts
  const accountsPath = path.resolve(__dirname, "accounts.json");
  if (!fs.existsSync(accountsPath)) {
    console.error(`❌  accounts.json not found at ${accountsPath}`);
    process.exit(1);
  }

  let accounts;
  try {
    accounts = JSON.parse(fs.readFileSync(accountsPath, "utf-8"));
  } catch (err) {
    console.error(`❌  Failed to parse accounts.json: ${err.message}`);
    process.exit(1);
  }

  if (!Array.isArray(accounts) || accounts.length === 0) {
    console.error("❌  accounts.json must contain a non-empty array of { email, password }");
    process.exit(1);
  }

  log(`Loaded ${accounts.length} account(s) from accounts.json\n`);

  // Process accounts sequentially
  const results = [];
  for (let i = 0; i < accounts.length; i++) {
    const result = await processAccount(accounts[i], i, accounts.length);
    results.push(result);

    // Random delay between accounts (skip after last)
    if (i < accounts.length - 1) {
      const delay = randomBetween(
        CONFIG.interAccountDelay.min,
        CONFIG.interAccountDelay.max
      );
      log(`Waiting ${(delay / 1000).toFixed(1)}s before next account…\n`);
      await sleep(delay);
    }
  }

  // ── Summary ──
  console.log("\n" + "═".repeat(60));
  console.log("  RESULTS SUMMARY");
  console.log("═".repeat(60));
  console.log(
    `${"Email".padEnd(35)} ${"Status".padEnd(12)} Error`
  );
  console.log("─".repeat(60));
  for (const r of results) {
    console.log(
      `${r.email.padEnd(35)} ${r.status.padEnd(12)} ${r.error || ""}`
    );
  }
  console.log("═".repeat(60));

  const successes = results.filter((r) => r.status.includes("SUCCESS")).length;
  console.log(`\nTotal: ${results.length}  |  Success: ${successes}  |  Failed: ${results.length - successes}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
