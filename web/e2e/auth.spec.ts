import { PASSWORD, expect, test } from "./fixtures";

test("sign-up shows validation errors", async ({ page, email }) => {
  await page.goto("/sign-up", { waitUntil: "networkidle" });
  const password = page.getByLabel("Password");
  await page.getByLabel("Email").fill(email);
  await password.fill("short");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(password).toHaveJSProperty("validity.tooShort", true);
  await expect(page).toHaveURL(/sign-up/);

  // Past the browser's own checks, the server action still validates.
  await page.locator("form").evaluate((f: HTMLFormElement) => (f.noValidate = true));
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.locator("form [role=alert]")).toHaveText(/at least 8 characters/i);

  await page.getByLabel("Email").fill("not-an-email");
  await password.fill("long-enough-1");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.locator("form [role=alert]")).toHaveText(/valid email/i);
});

test("sign out, reject a wrong password, then sign in", async ({ app, email }) => {
  await app.goto("/you");
  await app.getByRole("button", { name: "Sign out" }).click();
  await expect(app).not.toHaveURL(/\/you/);

  await app.goto("/sign-in", { waitUntil: "networkidle" });
  await app.getByLabel("Email").fill(email);
  await app.getByLabel("Password").fill("wrong-password-1");
  await app.getByRole("button", { name: "Sign in" }).click();
  await expect(app.locator("form [role=alert]")).toBeVisible();

  await app.getByLabel("Email").fill(email);
  await app.getByLabel("Password").fill(PASSWORD);
  await app.getByRole("button", { name: "Sign in" }).click();
  await app.waitForURL("**/home");
});

test("signed-out visitors are sent to sign in", async ({ page }) => {
  await page.goto("/home");
  await expect(page).toHaveURL(/sign-in/);
});

test("a duplicate sign-up is refused", async ({ app, email, guest }) => {
  expect(app.url()).toContain("/new");
  await guest.goto("/sign-up", { waitUntil: "networkidle" });
  await guest.getByLabel("Email").fill(email);
  await guest.getByLabel("Password").fill(PASSWORD);
  await guest.getByRole("button", { name: "Create account" }).click();
  await expect(guest.locator("form [role=alert]")).toBeVisible();
});
