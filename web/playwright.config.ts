import { defineConfig, devices } from "@playwright/test";

const PORT = 3500;
const swiftshader = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"];
const phone = { ...devices["iPhone 14 Pro"], browserName: "chromium" as const };

export default defineConfig({
  testDir: "e2e",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  workers: 2,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [
    { name: "mobile", testIgnore: /webgl\.spec/, use: { ...phone, launchOptions: { args: swiftshader } } },
    { name: "no-webgl", testMatch: /webgl\.spec/, use: { ...phone, launchOptions: { args: ["--disable-webgl", "--disable-3d-apis"] } } },
  ],
  webServer: {
    command: `bun run dev -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { BETTER_AUTH_URL: `http://localhost:${PORT}` },
  },
});
