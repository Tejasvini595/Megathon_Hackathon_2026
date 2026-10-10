import { confirmSampleHome, expect, test } from "./fixtures";

test("home: thermal toggle and heat bar focus", async ({ app }) => {
  await confirmSampleHome(app);
  const home = app.getByRole("tab", { name: "Home", exact: true });
  const thermal = app.getByRole("tab", { name: "Thermal" });
  await expect(home).toHaveAttribute("aria-selected", "true");
  await thermal.click();
  await expect(thermal).toHaveAttribute("aria-selected", "true");
  await home.click();
  await expect(home).toHaveAttribute("aria-selected", "true");

  const bar = app.getByRole("button", { name: /^Roof/ }).first();
  await bar.scrollIntoViewIfNeeded();
  await bar.click();
  await expect(bar).toHaveAttribute("aria-pressed", "true");
  await bar.click();
  await expect(bar).toHaveAttribute("aria-pressed", "false");
});

test("plan: after-plan toggle", async ({ app }) => {
  await confirmSampleHome(app);
  await app.goto("/plan");
  const today = app.getByRole("tab", { name: "Today" });
  const after = app.getByRole("tab", { name: "After plan" });
  await expect(today).toHaveAttribute("aria-selected", "true");
  await after.click();
  await expect(after).toHaveAttribute("aria-selected", "true");
  await today.click();
  await expect(today).toHaveAttribute("aria-selected", "true");
});

test("ask page renders and accepts a question", async ({ app }) => {
  await confirmSampleHome(app);
  await app.goto("/ask");
  await expect(app.getByRole("heading", { level: 1 })).not.toHaveText("");
  const input = app.getByPlaceholder("What if I…");
  await expect(input).toBeVisible();
  const send = app.getByRole("button", { name: "Send" });
  await expect(send).toBeDisabled();
  await input.fill("What if I add loft insulation?");
  await expect(send).toBeEnabled();
});
