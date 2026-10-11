import { analyseSample, enterYearlyUsage, expect, openField, openRow, reviewStep, test } from "./fixtures";

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

  for (const step of ["Walls", "Roof", "Windows", "Heating", "Power", "Usage", "Rating", "Done"]) {
    await reviewStep(app, step).click();
    await expect(reviewStep(app, step)).toHaveAttribute("aria-current", "step");
  }
  // Energy use is required: the review can't finish until it is given.
  await expect(app.getByRole("heading", { name: "Almost there." })).toBeVisible();
  await expect(app.getByRole("button", { name: /to finish first/ })).toBeDisabled();
  await enterYearlyUsage(app);
  await reviewStep(app, "Done").click();
  await expect(app.getByRole("heading", { name: "Looking good." })).toBeVisible();
  await reviewStep(app, "Shape").click();
  await app.getByRole("button", { name: "Walls", exact: true }).last().click();
  await expect(reviewStep(app, "Walls")).toHaveAttribute("aria-current", "step");

  await reviewStep(app, "Done").click();
  await app.getByRole("button", { name: "Looks right. Build my twin" }).click();
  await app.waitForURL(/\/home\?homeId=/, { timeout: 60_000 });
  await expect(app.getByRole("tab", { name: "Thermal" })).toBeVisible();
});

test("review: markers toggle, editing a field, the custom controls", async ({ app }) => {
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

  await reviewStep(app, "Shape").click();
  // Rows holding a guess start open.
  const timeline = app.getByRole("slider", { name: "Year built" });
  await expect(timeline).toHaveAttribute("aria-valuetext", "1930–1949");
  await timeline.focus();
  await timeline.press("ArrowLeft");
  await expect(timeline).toHaveAttribute("aria-valuetext", "1900–1929");
  await expect(app.getByRole("button", { name: /^Built/ })).toContainText("1900–1929");

  await reviewStep(app, "Roof").click();
  await (await openRow(app, /^Loft insulation/, app.getByRole("radio", { name: "Thick, 200 mm or more" }))).click();
  await expect(app.getByRole("button", { name: /^Loft insulation/ })).toContainText("Thick, 200 mm or more");

  await reviewStep(app, "Heating").click();
  await (await openRow(app, /^Boiler fitted/, app.getByRole("radio", { name: "2005 or later" }))).click();
  await expect(app.getByRole("button", { name: /^Boiler fitted/ })).toContainText("2005 or later");

  await reviewStep(app, "Power").click();
  await (await openField(app, /^Solar panels/, "Yes")).click();
  await (await openRow(app, /^Solar size/, app.getByRole("switch", { name: "Count panels instead" }))).click();
  await app.getByRole("button", { name: "Increase" }).click();
  await expect(app.getByText(/^≈ \d\.\d kW$/)).toBeVisible();

  await reviewStep(app, "Rating").click();
  await (await openRow(app, /^EPC rating/, app.getByRole("radio", { name: /^Band C/ }))).click();
  const score = await openRow(app, /^EPC score/, app.getByLabel("EPC score"));
  await score.fill("47");
  await expect(app.getByText(/Check the number or the letter/)).toBeVisible();
  await score.fill("72");
  await expect(app.getByText(/Check the number or the letter/)).toHaveCount(0);
  await expect(app.getByRole("link", { name: /Find your EPC rating/ })).toHaveAttribute("href", "https://find-energy-certificate.service.gov.uk/");
  const dial = await openRow(app, /^Usual heating temperature/, app.getByRole("slider", { name: "Usual heating temperature" }));
  await dial.focus();
  await dial.press("ArrowRight");
  await expect(app.getByRole("button", { name: /^Usual heating temperature/ })).toContainText("19.5 °C");
});

test("usage: monthly readings need a winter month, a CSV fills the grid", async ({ app }) => {
  await analyseSample(app);
  await reviewStep(app, "Usage").click();
  await expect(app.getByRole("heading", { name: "Upload or enter your monthly readings" })).toBeVisible();

  const csv = ["Month,Electricity (kWh),Gas (kWh)", ...["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"].map((m) => `${m},300,100`)].join("\n");
  await app.getByLabel("Upload readings CSV").setInputFiles({ name: "readings.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await app.getByRole("button", { name: "Use these readings" }).click();
  await expect(app.getByText(/Include at least one month from December to February/)).toBeVisible();

  await app.getByLabel("Electricity kWh, 2025-12").fill("500");
  await app.getByLabel("Gas kWh, 2025-12").fill("2500");
  await expect(app.getByText(/7 months, including a winter month/)).toBeVisible();

  await reviewStep(app, "Done").click();
  await expect(app.getByRole("heading", { name: "Looking good." })).toBeVisible();
});

test("a flat's description shows flat-only fields and hides the roof", async ({ app }) => {
  await app.goto("/new");
  await app.getByLabel("Describe your home").fill("Second floor flat in a 6 storey block, electric storage heaters, double glazed, solar panels");
  await app.getByRole("button", { name: "Analyse my home" }).click();
  await expect(app.getByRole("navigation", { name: "Review steps" })).toBeVisible({ timeout: 60_000 });
  await expect(app.getByRole("button", { name: /^Which floor/ })).toBeVisible();
  await expect(app.getByRole("button", { name: /^Floors in the building/ })).toContainText("6");
  await reviewStep(app, "Roof").click();
  await expect(app.getByText("Another home sits above yours")).toBeVisible();
  await reviewStep(app, "Heating").click();
  await expect(app.getByRole("button", { name: /^Main heating/ })).toContainText("Storage heaters");
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
