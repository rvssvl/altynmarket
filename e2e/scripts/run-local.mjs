// Runs the e2e suite locally and builds one HTML report with per-platform
// results and screen recordings — the local counterpart of the GitHub Pages
// dashboard. Cloud/EAS is not touched; everything runs against staging.
//
// Usage: node scripts/run-local.mjs [--web] [--ios] [--android]
//        (no flags = --web --ios)
//
// Prerequisites for --ios: a booted iOS simulator with both apps installed
// (`npx expo run:ios` once in each apps/*-mobile) and the maestro CLI.
import { spawn, spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const e2eDir = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const repoRoot = path.resolve(e2eDir, "..");
const outDir = path.join(e2eDir, "local-report");

const CUSTOMER_APP_ID = "kz.altynmarket.customer.demo";
const STAFF_APP_ID = "kz.altynmarket.staff.demo";

const MOBILE_SUITES = (platform) => [
  {
    app: "customer-mobile",
    appId: CUSTOMER_APP_ID,
    flows: ["login.yaml", "browse-catalog.yaml", `checkout-${platform}.yaml`],
  },
  {
    app: "staff-mobile",
    appId: STAFF_APP_ID,
    flows: [`picker-${platform}.yaml`, `courier-${platform}.yaml`],
  },
];

const flags = new Set(process.argv.slice(2));
const runWeb = flags.size === 0 || flags.has("--web");
const runIos = flags.size === 0 || flags.has("--ios");
const runAndroid = flags.has("--android");

const sh = (cmd, cmdArgs, opts = {}) =>
  spawnSync(cmd, cmdArgs, { stdio: "inherit", cwd: repoRoot, ...opts });

const shQuiet = (cmd, cmdArgs, opts = {}) =>
  spawnSync(cmd, cmdArgs, { encoding: "utf8", cwd: repoRoot, ...opts });

const fail = (message) => {
  console.error(`\n✖ ${message}`);
  process.exit(1);
};

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

// --- Preflight ------------------------------------------------------------
if (runIos || runAndroid) {
  if (shQuiet("maestro", ["--version"]).status !== 0) {
    fail(
      "maestro CLI not found. Install it: curl -Ls https://get.maestro.mobile.dev | bash",
    );
  }
}
if (runIos) {
  const booted = shQuiet("xcrun", ["simctl", "list", "devices", "booted"]);
  if (!booted.stdout?.includes("Booted")) {
    fail(
      "No booted iOS simulator. Start one (open -a Simulator), then install the apps once: npx expo run:ios in apps/customer-mobile and apps/staff-mobile.",
    );
  }
  for (const appId of [CUSTOMER_APP_ID, STAFF_APP_ID]) {
    if (
      shQuiet("xcrun", ["simctl", "get_app_container", "booted", appId])
        .status !== 0
    ) {
      fail(
        `${appId} is not installed on the booted simulator. Run npx expo run:ios once in the matching apps/*-mobile directory.`,
      );
    }
  }
}
if (runAndroid) {
  const devices = shQuiet("adb", ["devices"]);
  if (!devices.stdout?.match(/^\S+\tdevice$/m)) {
    fail("No running Android emulator/device visible to adb.");
  }
}

// --- Seed + fixtures ------------------------------------------------------
console.log("\n▸ Seeding staging test data...");
if (sh("pnpm", ["--filter", "@altyn-market/e2e", "seed"]).status !== 0) {
  fail("Seed failed — is staging reachable?");
}
if (runIos || runAndroid) {
  console.log("▸ Preparing mobile fixtures (picker/courier tasks)...");
  if (
    sh("pnpm", ["--filter", "@altyn-market/e2e", "fixtures:mobile"]).status !==
    0
  ) {
    fail("Mobile fixtures failed.");
  }
}

// --- Web ------------------------------------------------------------------
let webResult = null;
if (runWeb) {
  console.log("\n▸ Web: Playwright against admin-staging...");
  const res = sh("pnpm", ["--filter", "@altyn-market/e2e", "test:web"]);
  webResult = res.status === 0 ? "passed" : "failed";
  const report = path.join(e2eDir, "playwright", "report");
  if (existsSync(report)) {
    cpSync(report, path.join(outDir, "web-report"), { recursive: true });
  }
}

// --- Mobile ---------------------------------------------------------------
const startRecording = (platform, file) => {
  if (platform === "ios") {
    return spawn(
      "xcrun",
      ["simctl", "io", "booted", "recordVideo", "--codec", "h264", "-f", file],
      { stdio: "ignore" },
    );
  }
  // adb screenrecord caps at 3 min — fine per-flow.
  return spawn(
    "sh",
    ["-c", `adb exec-out screenrecord --output-format=h264 - > "${file}.h264"`],
    { stdio: "ignore" },
  );
};

const stopRecording = async (platform, proc, file) => {
  proc.kill("SIGINT");
  await new Promise((resolve) => proc.on("exit", resolve));
  if (platform === "android" && existsSync(`${file}.h264`)) {
    // Wrap raw h264 into mp4 when ffmpeg is around; otherwise keep raw.
    const wrapped = spawnSync("ffmpeg", [
      "-y",
      "-i",
      `${file}.h264`,
      "-c",
      "copy",
      file,
    ]);
    if (wrapped.status === 0) rmSync(`${file}.h264`);
  }
};

const mobileResults = [];
const runMobilePlatform = async (platform) => {
  for (const suite of MOBILE_SUITES(platform)) {
    const flowDir = path.join(repoRoot, "apps", suite.app, ".maestro");
    for (const flow of suite.flows) {
      const label = `${platform}/${suite.app}/${flow.replace(".yaml", "")}`;
      const safe = label.replaceAll("/", "__");
      const debugDir = path.join(outDir, "mobile", safe);
      mkdirSync(debugDir, { recursive: true });
      const video = path.join(debugDir, "recording.mp4");

      console.log(`\n▸ Maestro: ${label}`);
      const recorder = startRecording(platform, video);
      const res = sh(
        "maestro",
        ["test", flow, "--debug-output", debugDir],
        { cwd: flowDir },
      );
      await stopRecording(platform, recorder, video);

      mobileResults.push({
        label,
        platform,
        app: suite.app,
        flow,
        status: res.status === 0 ? "passed" : "failed",
        dir: path.relative(outDir, debugDir),
        video: existsSync(video) ? path.relative(outDir, video) : null,
      });
    }
  }
};

if (runIos) await runMobilePlatform("ios");
if (runAndroid) await runMobilePlatform("android");

// --- Report ---------------------------------------------------------------
const esc = (v) =>
  String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const pill = (ok) =>
  `<span style="padding:2px 10px;border-radius:999px;font-weight:600;background:${ok ? "#1a7f371a" : "#cf222e1a"};color:${ok ? "#1a7f37" : "#cf222e"};">${ok ? "passed" : "failed"}</span>`;

const webSpecs = [];
try {
  const json = JSON.parse(
    readFileSync(path.join(e2eDir, "playwright", "results.json"), "utf8"),
  );
  const walk = (suite, crumbs) => {
    for (const spec of suite.specs ?? [])
      webSpecs.push({ title: [...crumbs, spec.title].join(" › "), ok: spec.ok });
    for (const child of suite.suites ?? [])
      walk(child, [...crumbs, child.title].filter(Boolean));
  };
  for (const suite of json.suites ?? []) walk(suite, [suite.title].filter(Boolean));
} catch {
  // web not run or results missing
}

const mobileRows = mobileResults
  .map(
    (r) =>
      `<tr><td>${esc(r.label)}</td><td>${pill(r.status === "passed")}</td><td>${
        r.video ? `<a href="${esc(r.video)}">видео</a>` : "—"
      } · <a href="${esc(r.dir)}/">артефакты</a></td></tr>`,
  )
  .join("\n");
const webRows = webSpecs
  .map((s) => `<tr><td>${esc(s.title)}</td><td>${pill(s.ok)}</td></tr>`)
  .join("\n");

const failedCount =
  mobileResults.filter((r) => r.status === "failed").length +
  webSpecs.filter((s) => !s.ok).length +
  (webResult === "failed" && webSpecs.length === 0 ? 1 : 0);

writeFileSync(
  path.join(outDir, "index.html"),
  `<!doctype html><meta charset="utf-8"><title>E2E local run</title>
<style>body{font-family:system-ui;max-width:900px;margin:2rem auto;padding:0 1rem;color:#1f2328}
table{border-collapse:collapse;width:100%;margin:1rem 0}th,td{text-align:left;padding:8px 12px;border-bottom:1px solid #d0d7de}
@media(prefers-color-scheme:dark){body{background:#0d1117;color:#e6edf3}th,td{border-color:#30363d}a{color:#58a6ff}}</style>
<h1>Локальный E2E-прогон — ${failedCount === 0 ? pill(true) : `${failedCount} failed`}</h1>
<p>${new Date().toISOString()} · окружение: staging</p>
${webSpecs.length || webResult ? `<h2>Web (Playwright)</h2>
<p><a href="web-report/index.html">Полный отчёт: видео, трейсы, скриншоты</a></p>
<table><tr><th>Сценарий</th><th>Статус</th></tr>${webRows}</table>` : ""}
${mobileResults.length ? `<h2>Mobile (Maestro, локальный симулятор)</h2>
<table><tr><th>Флоу</th><th>Статус</th><th>Записи</th></tr>${mobileRows}</table>` : ""}`,
);

console.log(`\n✔ Report: ${path.join(outDir, "index.html")}`);
if (process.platform === "darwin" && !process.env.CI) {
  spawnSync("open", [path.join(outDir, "index.html")]);
}
process.exit(failedCount === 0 ? 0 : 1);
