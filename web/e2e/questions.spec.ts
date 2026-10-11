import { existsSync, readFileSync } from "node:fs";
import { analyseSample, expect, reviewStep, test } from "./fixtures";

// The dev server reads the worktree's .env itself, so look there too.
const engine = Boolean(process.env.ENGINE_URL || /^ENGINE_URL=\S/m.test(existsSync(".env") ? readFileSync(".env", "utf8") : ""));

test("review: questions are ranked by what matters when the engine is up, and unchanged without it", async ({ app }) => {
  await analyseSample(app);
  const card = app.getByRole("region", { name: "What matters for your home" });

  if (!engine) {
    // Nothing to rank with: the review is the plain one and still walks through.
    await app.waitForTimeout(2500);
    await expect(card).toHaveCount(0);
    await expect(app.getByText("Quick confirms")).toHaveCount(0);
    await reviewStep(app, "Walls").click();
    await expect(app.getByRole("button", { name: /^Walls/ }).first()).toBeVisible();
    return;
  }

  await expect(card).toBeVisible({ timeout: 60_000 });
  const items = card.getByRole("listitem");
  expect(await items.count()).toBeGreaterThan(0);
  // Each reason is an estimate built from engine numbers.
  await expect(items.first()).toContainText(/could change your plan|score point|\/yr/i);

  // Tapping a question jumps to its step and opens the field.
  const label = (await items.first().getByRole("button").locator("span span").first().innerText()).trim();
  await items.first().getByRole("button").click();
  const row = app.getByRole("button", { name: new RegExp(`^${label}`) }).first();
  await expect(row).toHaveAttribute("aria-expanded", "true");

  // A pre-filled quick confirm needs one tap, and the answer is kept.
  await app.getByRole("button", { name: "Shape" }).first().click();
  const confirms = app.getByRole("button", { name: "Confirm" });
  if (await confirms.count()) {
    const before = await confirms.count();
    await confirms.first().click();
    await expect(confirms).toHaveCount(before - 1);
  }
});
