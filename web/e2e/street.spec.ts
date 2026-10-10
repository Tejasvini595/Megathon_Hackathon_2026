import { expect, test } from "./fixtures";

test("street picker: select a building, see its card, prefill the description", async ({ app }) => {
  await app.goto("/new");
  await app.getByRole("button", { name: "Postcode", exact: true }).click();
  await app.locator("input[autocomplete=postal-code]").fill("M14 4AJ");
  await app.getByRole("button", { name: "Find on map" }).click();

  const canvas = app.locator("canvas");
  await expect(canvas).toBeVisible({ timeout: 30_000 });
  const mine = app.getByRole("button", { name: "This is my home" });
  const box = (await canvas.boundingBox())!;
  await expect(async () => {
    for (const [fx, fy] of [[0.5, 0.5], [0.45, 0.55], [0.55, 0.45], [0.5, 0.6], [0.4, 0.4], [0.6, 0.6]]) {
      await app.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
      if (await mine.isVisible()) return;
    }
    throw new Error("no building selected yet");
  }).toPass({ timeout: 30_000 });

  await expect(app.getByText("Footprint")).toBeVisible();
  await expect(app.getByText("Type", { exact: true })).toBeVisible();
  await mine.click();

  await expect(app.getByLabel("Describe your home")).not.toBeEmpty();
  await app.getByRole("button", { name: "Analyse my home" }).click();
  await expect(app.getByRole("navigation", { name: "Review steps" })).toBeVisible({ timeout: 60_000 });
});
