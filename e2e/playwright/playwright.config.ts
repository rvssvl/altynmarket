import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";
import { e2eConfig } from "../config.js";

export const adminStorageState = fileURLToPath(
  new URL("./.auth/admin.json", import.meta.url),
);

export default defineConfig({
  testDir: "./tests",
  outputDir: "./test-results",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 90_000,
  reporter: [
    ["list"],
    ["html", { outputFolder: "report", open: "never" }],
    ["json", { outputFile: "results.json" }],
  ],
  use: {
    baseURL: e2eConfig.adminUrl,
    video: "on",
    trace: "on",
    screenshot: "on",
    viewport: { width: 1440, height: 900 },
  },
  projects: [
    {
      name: "setup",
      testDir: "./setup",
      testMatch: /.*\.setup\.ts/,
    },
    {
      name: "chromium",
      dependencies: ["setup"],
      use: { storageState: adminStorageState },
    },
  ],
});
