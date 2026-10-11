import { test as base, expect, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { Client } from "pg";

const DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://ght:ght@localhost:5432/ght";

export const PASSWORD = "e2e-pass-12345";

/** Collects console errors/warnings and uncaught page errors from every page in the context. */
export function watch(context: BrowserContext, ignore?: RegExp) {
  const problems: string[] = [];
  context.on("console", (m) => {
    if ((m.type() === "error" || m.type() === "warning") && !ignore?.test(m.text())) problems.push(`${m.type()}: ${m.text()}`);
  });
  context.on("weberror", (e) => problems.push(`pageerror: ${e.error().message}`));
  return problems;
}

async function deleteUser(email: string) {
  const db = new Client({ connectionString: DATABASE_URL });
  await db.connect();
  try {
    await db.query(`delete from "user" where email = $1`, [email]); // homes, sessions and accounts cascade
  } finally {
    await db.end();
  }
}

export async function signUp(page: Page, email: string) {
  await page.goto("/sign-up", { waitUntil: "networkidle" });
  await page.getByLabel("Name").fill("E2E Tester");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("**/new");
}

type Fixtures = {
  problems: string[];
  email: string;
  /** A page signed in as a fresh user (landed on /new). */
  app: Page;
  /** A second, signed-out context, for opening public links. */
  guest: Page;
};

export const test = base.extend<Fixtures>({
  problems: [
    async ({ context }, provide) => {
      const problems = watch(context);
      await provide(problems);
      expect(problems, "console errors or warnings").toEqual([]);
    },
    { auto: true },
  ],
  email: async ({}, provide) => {
    const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
    await provide(email);
    await deleteUser(email);
  },
  app: async ({ page, email }, provide) => {
    await signUp(page, email);
    await provide(page);
  },
  guest: async ({ browser, playwright, baseURL }, provide) => {
    const context = await browser.newContext({ ...playwright.devices["iPhone 14 Pro"], baseURL });
    // Browsers log the 404 for a revoked share link themselves; the test asserts the page instead.
    const problems = watch(context, /status of 404/);
    await provide(await context.newPage());
    await context.close();
    expect(problems, "guest console errors or warnings").toEqual([]);
  },
});

export { expect };

const stepNav = (page: Page) => page.getByRole("navigation", { name: "Review steps" });

export const reviewStep = (page: Page, name: string) => stepNav(page).getByRole("button", { name, exact: true });

/** Runs the sample description through capture and analysis until the review is open. */
export async function analyseSample(page: Page) {
  await page.goto("/new");
  await page.getByRole("button", { name: "Try a sample home" }).click();
  await page.getByRole("button", { name: "Analyse my home" }).click();
  await expect(stepNav(page)).toBeVisible({ timeout: 60_000 });
}

/** The review won't finish without energy use: yearly totals are the quickest way to give it. */
export async function enterYearlyUsage(page: Page) {
  await reviewStep(page, "Usage").click();
  await page.getByRole("button", { name: "I only have yearly totals" }).click();
  await page.getByLabel("Electricity kWh a year").fill("3200");
  await page.getByLabel("Gas kWh a year").fill("14000");
}

/** Sample home all the way to a confirmed twin; returns the new home's id. */
export async function confirmSampleHome(page: Page) {
  await analyseSample(page);
  await enterYearlyUsage(page);
  await reviewStep(page, "Done").click();
  await page.getByRole("button", { name: "Looks right. Build my twin" }).click();
  await page.waitForURL(/\/home\/[^/?]+$/, { timeout: 60_000 });
  return new URL(page.url()).searchParams.get("homeId")!;
}

/** Expands a review row unless it is already open (rows with guesses start open). */
export async function openField(page: Page, label: RegExp, option: string) {
  const choice = page.getByRole("button", { name: option, exact: true }).first();
  await page.getByRole("button", { name: label }).waitFor();
  if (!(await choice.isVisible())) await page.getByRole("button", { name: label }).click();
  await expect(choice).toBeVisible();
  return choice;
}

/** Expands a review row unless it already shows `probe` (rows with guesses start open). */
export async function openRow(page: Page, label: RegExp, probe: Locator) {
  await page.getByRole("button", { name: label }).waitFor();
  if (!(await probe.isVisible())) await page.getByRole("button", { name: label }).click();
  await expect(probe).toBeVisible();
  return probe;
}
