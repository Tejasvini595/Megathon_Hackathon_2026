import path from "node:path";
import { confirmSampleHome, expect, test } from "./fixtures";

// A fake microphone plays a recorded question; the audio LLM (LLM_TRANSCRIBE_MODEL) transcribes it.
test.skip(!process.env.ENGINE_URL || !process.env.OPENROUTER_API_KEY, "engine or OpenRouter not configured");

const clip = path.join(__dirname, "fixtures/ask-solar.wav");
test.use({
  permissions: ["microphone"],
  launchOptions: { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", `--use-file-for-fake-audio-capture=${clip}%noloop`] },
});

test("ask: a spoken question is transcribed by the audio model and answered", async ({ app }) => {
  await confirmSampleHome(app);
  await app.goto("/ask");
  await app.getByRole("button", { name: "Speak" }).click();
  await expect(app.getByText(/Listening…/)).toBeVisible();
  await app.waitForTimeout(8_000); // the clip is ~7 s
  await app.getByRole("button", { name: "Stop" }).click();
  // "What if I add solar panels and cavity wall insulation to my semi-detached house?"
  await expect(app.getByText(/solar panels and cavity wall insulation/i)).toBeVisible({ timeout: 30_000 });
  await app.getByText("How we got this answer").click({ timeout: 60_000 });
  await expect(app.getByText(/what-if: your home with cavity wall insulation and solar pv/i)).toBeVisible();
});
