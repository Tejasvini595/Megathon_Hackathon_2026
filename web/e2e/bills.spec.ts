import "dotenv/config";
import type { Page } from "@playwright/test";
import { analyseSample, expect, reviewStep, test } from "./fixtures";

const bill = "e2e/fixtures/bills/monthly-both.png";
const ELEC = [318, 281, 262, 236, 214, 198, 203, 211, 229, 262, 297, 331];
const GAS = [1840, 1630, 1210, 790, 410, 240, 205, 198, 360, 810, 1420, 1930];

const usage = {
  months: ELEC.map((e, i) => ({ month: `2025-${String(i + 1).padStart(2, "0")}`, elecKwh: e, gasKwh: GAS[i] })),
};

/** Answers the readBill server function with a canned result, so the preview can be tested without a model. */
async function stubBill(page: Page, result: unknown) {
  await page.route("**/new", async (route) => {
    if (!route.request().headers()["next-action"]) return route.fallback();
    await route.fulfill({ contentType: "text/x-component", body: `0:{"a":"$@1","q":"","i":false}\n1:${JSON.stringify(result)}\n` });
  });
}

async function openUsage(page: Page) {
  await analyseSample(page);
  await reviewStep(page, "Usage").click();
  await expect(page.getByRole("heading", { name: /Don't know your kWh/ })).toBeVisible();
}

test("bill upload without a model key says reading isn't set up", async ({ app }) => {
  test.skip(Boolean(process.env.OPENROUTER_API_KEY), "a key is configured, so the server would really read the bill");
  await openUsage(app);
  await app.getByLabel("Upload bills").setInputFiles(bill);
  await expect(app.getByText("Bill reading isn't set up")).toBeVisible();
  await expect(app.getByRole("button", { name: "Snap a bill" })).toBeVisible();
});

test("bill preview shows findings and fills the months", async ({ app }) => {
  await openUsage(app);
  await stubBill(app, {
    status: "ok",
    usage,
    source: "1 bill",
    findings: [
      { level: "ok", message: "Read 12 monthly electricity bills." },
      { level: "check", message: "Gas is billed in m³ so it was converted." },
    ],
  });
  await app.getByLabel("Upload bills").setInputFiles(bill);
  await expect(app.getByText("What we read from your 1 bill")).toBeVisible();
  await expect(app.locator("[data-level=ok]")).toContainText("Read 12 monthly");
  await expect(app.locator("[data-level=check]")).toContainText("converted");
  await expect(app.getByRole("img", { name: /Energy use by month/ }).first()).toBeVisible();

  await app.getByRole("button", { name: "Use these readings" }).click();
  await expect(app.getByLabel("Electricity kWh, 2025-01")).toHaveValue("318");
  await expect(app.getByLabel("Gas kWh, 2025-12")).toHaveValue("1930");
  await expect(app.getByText("12 months, including a winter month.")).toBeVisible();
});

test("a rejected bill cannot be used", async ({ app }) => {
  await openUsage(app);
  await stubBill(app, { status: "ok", usage: null, source: "1 bill", findings: [{ level: "reject", message: "The electricity bills overlap." }] });
  await app.getByLabel("Upload bills").setInputFiles(bill);
  await expect(app.locator("[data-level=reject]")).toContainText("overlap");
  await expect(app.getByRole("button", { name: "Use these readings" })).toBeDisabled();
  await app.getByRole("button", { name: "Start over" }).click();
  await expect(app.getByRole("button", { name: "Snap a bill" })).toBeVisible();
});
