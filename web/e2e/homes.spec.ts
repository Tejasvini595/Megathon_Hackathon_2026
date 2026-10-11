import { confirmSampleHome, expect, openField, test } from "./fixtures";

test("share link: create, open logged out, revoke", async ({ app, guest, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await confirmSampleHome(app);

  await app.getByRole("button", { name: "Share your twin" }).click();
  await app.getByRole("button", { name: "Create link" }).click();
  await app.getByRole("button", { name: "Copy link" }).click();
  const url = await app.evaluate(() => navigator.clipboard.readText());
  expect(url).toMatch(/\/t\/[\w-]+$/);

  await guest.goto(url);
  await expect(guest.getByText("This twin card isn't available")).toHaveCount(0);
  await expect(guest.getByRole("link", { name: /build your own twin/i })).toBeVisible();

  await app.goto("/you");
  await expect(app.getByText("twin card is public")).toBeVisible();
  await app.getByRole("button", { name: "Stop sharing" }).click();
  await expect(app.getByText("twin card is public")).toHaveCount(0);

  await guest.goto(url);
  await expect(guest.getByText("This twin card isn't available")).toBeVisible();
});

test("rename, edit and delete a home from /you", async ({ app }) => {
  const id = await confirmSampleHome(app);

  await app.goto(`/edit/${id}`);
  const nav = app.getByRole("navigation", { name: "Review steps" });
  await expect(nav).toBeVisible({ timeout: 60_000 });
  await nav.getByRole("button", { name: "Walls", exact: true }).click();
  await (await openField(app, /^Wall insulation/, "Insulated")).click();
  await nav.getByRole("button", { name: "Done", exact: true }).click();
  await app.getByRole("button", { name: "Looks right. Build my twin" }).click();
  await app.waitForURL(`**/home/${id}`, { timeout: 60_000 });

  await app.goto(`/edit/${id}`);
  await expect(nav).toBeVisible({ timeout: 60_000 });
  await nav.getByRole("button", { name: "Walls", exact: true }).click();
  await expect(app.getByRole("button", { name: /^Wall insulation/ })).toContainText("Insulated");

  await app.goto("/you");
  await app.getByRole("button", { name: /^Manage / }).click();
  await app.getByRole("menuitem", { name: "Rename" }).click();
  await app.getByLabel("Home name").fill("Renamed home");
  await app.getByRole("button", { name: "Save" }).click();
  await expect(app.getByText("Renamed home").first()).toBeVisible();

  await app.getByRole("button", { name: "Manage Renamed home" }).click();
  await app.getByRole("menuitem", { name: "Delete" }).click();
  await app.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(app.getByRole("button", { name: /^Manage / })).toHaveCount(0);
});
