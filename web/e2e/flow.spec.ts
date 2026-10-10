import { analyseSample, expect, openField, reviewStep, test } from "./fixtures";

test("capture, analysing, review, then confirm lands on /home", async ({ app }) => {
  await app.goto("/new");
  const analyse = app.getByRole("button", { name: "Analyse my home" });
  await expect(analyse).toBeDisabled();
  await app.getByRole("button", { name: "Try a sample home" }).click();
  await expect(app.getByLabel("Describe your home")).not.toBeEmpty();
  await analyse.click();

  const nav = app.getByRole("navigation", { name: "Review steps" });
  await expect(nav).toBeVisible({ timeout: 60_000 });
  await expect(reviewStep(app, "Shape")).toHaveAttribute("aria-current", "step");

  for (const step of ["Walls", "Roof", "Windows", "Heating", "Power", "Done"]) {
    await reviewStep(app, step).click();
    await expect(reviewStep(app, step)).toHaveAttribute("aria-current", "step");
  }
  await expect(app.getByRole("heading", { name: "Looking good." })).toBeVisible();
  await reviewStep(app, "Shape").click();
  await app.getByRole("button", { name: "Walls", exact: true }).last().click();
  await expect(reviewStep(app, "Walls")).toHaveAttribute("aria-current", "step");

  await reviewStep(app, "Done").click();
  await app.getByRole("button", { name: "Looks right. Build my twin" }).click();
  await app.waitForURL(/\/home\?homeId=/, { timeout: 60_000 });
  await expect(app.getByRole("tab", { name: "Thermal" })).toBeVisible();
});

test("review: markers toggle, editing a field, multi-select other heating", async ({ app }) => {
  await analyseSample(app);

  const markers = app.getByRole("button", { name: "Markers" });
  await expect(markers).toHaveAttribute("aria-pressed", "true");
  await markers.click();
  await expect(markers).toHaveAttribute("aria-pressed", "false");
  await markers.click();
  await expect(markers).toHaveAttribute("aria-pressed", "true");

  await reviewStep(app, "Walls").click();
  await (await openField(app, /^Wall insulation/, "Insulated")).click();
  await expect(app.getByRole("button", { name: /^Wall insulation/ })).toContainText("Insulated");
  await expect(app.getByRole("button", { name: /^Wall insulation/ })).toContainText("You");

  await reviewStep(app, "Heating").click();
  const stove = await openField(app, /^Other heating/, "Wood or multi-fuel stove");
  const gasFire = app.getByRole("button", { name: "Gas fire", exact: true });
  await stove.click();
  await gasFire.click();
  await expect(stove).toHaveAttribute("aria-pressed", "true");
  await expect(gasFire).toHaveAttribute("aria-pressed", "true");
  await expect(app.getByRole("button", { name: /^Other heating/ })).toContainText("Wood or multi-fuel stove, Gas fire");
  await stove.click();
  await expect(stove).toHaveAttribute("aria-pressed", "false");
  await expect(gasFire).toHaveAttribute("aria-pressed", "true");
});

test("a flat's description shows flat-only fields and hides the roof", async ({ app }) => {
  await app.goto("/new");
  await app.getByLabel("Describe your home").fill("Second floor flat in a 6 storey block, electric storage heaters, double glazed, solar panels, and a wood burner and gas fire");
  await app.getByRole("button", { name: "Analyse my home" }).click();
  await expect(app.getByRole("navigation", { name: "Review steps" })).toBeVisible({ timeout: 60_000 });
  await expect(app.getByRole("button", { name: /^Which floor/ })).toBeVisible();
  await expect(app.getByRole("button", { name: /^Floors in the building/ })).toContainText("6");
  await reviewStep(app, "Roof").click();
  await expect(app.getByText("Another home sits above yours")).toBeVisible();
  await reviewStep(app, "Heating").click();
  await expect(app.getByRole("button", { name: /^Main heating/ })).toContainText("Storage heaters");
  await expect(app.getByRole("button", { name: /^Other heating/ })).toContainText("Wood or multi-fuel stove, Gas fire");
});

test("discard a draft from the review", async ({ app }) => {
  await analyseSample(app);
  await app.getByRole("button", { name: "Close" }).click();
  await expect(app.getByRole("heading", { name: "Discard this home?" })).toBeVisible();
  await app.getByRole("button", { name: "Keep editing" }).click();
  await expect(app).toHaveURL(/\/new/);

  await app.getByRole("button", { name: "Close" }).click();
  await app.getByRole("button", { name: "Discard", exact: true }).click();
  await app.waitForURL(/\/home/);

  await app.goto("/you");
  await expect(app.getByRole("heading", { name: "Your homes" })).toBeVisible();
  await expect(app.getByRole("button", { name: /^Manage / })).toHaveCount(0);
});
