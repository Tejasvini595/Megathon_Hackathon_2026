import { confirmSampleHome, expect, test } from "./fixtures";

// Needs the engine (ENGINE_URL) to answer.
test.skip(!process.env.ENGINE_URL, "engine not configured");

test("ask: chats are saved, a question can be edited, chats can be reopened and deleted", async ({ app }) => {
  await confirmSampleHome(app);
  await app.goto("/ask");
  await app.getByPlaceholder("What if I…").fill("Why this score?");
  await app.getByRole("button", { name: "Send" }).click();
  await app.getByText("How we got this answer").click({ timeout: 60_000 });
  await expect(app.getByText("We answered from your home as it is today.")).toBeVisible();
  await expect(app).toHaveURL(/\/ask\/[^/]+\/[^/]+$/);
  const chatUrl = app.url();

  // Saved: a reload reopens the same chat.
  await app.reload();
  await expect(app.getByText("Why this score?")).toBeVisible();

  // Editing replaces the question and its answer.
  await app.getByRole("button", { name: "Edit" }).click();
  await app.getByLabel("Edit your question").fill("What if I add solar?");
  await app.getByRole("button", { name: "Ask again" }).click();
  await app.getByText("How we got this answer").click({ timeout: 60_000 });
  await expect(app.getByText(/We read your question as a what-if/)).toBeVisible();
  await expect(app.getByText("Why this score?")).toHaveCount(0);
  await expect(app).toHaveURL(chatUrl);

  // New chat, then reopen the old one from the list (renamed after its edited first question).
  await app.getByRole("button", { name: "New chat" }).click();
  await expect(app.getByText("Ask your home anything.")).toBeVisible();
  await expect(app).toHaveURL(/\/ask\/[^/]+$/);
  await app.getByRole("button", { name: "Your chats" }).click();
  await app.getByRole("dialog", { name: "Your chats" }).getByText("What if I add solar?").click();
  await expect(app).toHaveURL(chatUrl);
  await app.getByText("How we got this answer").click();
  await expect(app.getByText(/We read your question as a what-if/)).toBeVisible();

  // Deleting the open chat starts a new one, and its link stops working.
  await app.getByRole("button", { name: "Your chats" }).click();
  await app.getByRole("button", { name: 'Delete "What if I add solar?"' }).click();
  await app.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(app.getByText("Ask your home anything.")).toBeVisible();
  await app.getByRole("button", { name: "Your chats" }).click();
  await expect(app.getByText("No saved chats yet.", { exact: false })).toBeVisible();
  const res = await app.goto(chatUrl);
  expect(res?.status()).toBe(404);
});
