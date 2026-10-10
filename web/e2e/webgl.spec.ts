import { confirmSampleHome, expect, test } from "./fixtures";

test.describe("without WebGL", () => {
  test("landing, home and review show the friendly fallback", async ({ app, page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading").first()).toBeVisible();
    await expect(page.locator("canvas")).toHaveCount(0);

    await confirmSampleHome(app);
    await expect(app.getByText("3D view isn't available here").first()).toBeVisible();
    await expect(app.getByText("Everything else works as normal.").first()).toBeVisible();
    await expect(app.getByRole("tab", { name: "Thermal" })).toBeVisible();
  });
});
