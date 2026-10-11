import { confirmSampleHome, expect, test } from "./fixtures";

// Needs the engine (ENGINE_URL): the facts are read by its rules when no decision model is configured.
test.skip(!process.env.ENGINE_URL, "engine not configured");

test("ask: facts in a message are remembered after confirming, and the plan records them", async ({ app }) => {
  await confirmSampleHome(app);
  await app.goto("/ask");
  await app.getByPlaceholder("What if I…").fill("We already did the loft and we rent");
  await app.getByRole("button", { name: "Send" }).click();
  await expect(app.getByText("Remember this for your plan?")).toBeVisible({ timeout: 30_000 });
  await expect(app.getByText("loft insulation done")).toBeVisible();
  await expect(app.getByText("you rent")).toBeVisible();
  await app.getByRole("button", { name: "Remember", exact: true }).click();
  await expect(app.getByText("Remembered")).toBeVisible();
  await app.goto("/plan");
  await expect(app.getByText(/From Ask/).first()).toBeVisible();
});
