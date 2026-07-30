// TEMPORÁRIO — apontar a suite ao servidor de produção que já está a correr em
// :3231 (a porta 3000 está ocupada por outro processo). Apagar depois de correr.
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3231",
    trace: "off",
    launchOptions: { executablePath: "/opt/pw-browsers/chromium" },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
