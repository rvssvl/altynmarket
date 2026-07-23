// Aggregates e2e artifacts into a static report published to GitHub Pages.
// Usage: node e2e/scripts/build-report.mjs <artifactsDir> <outDir>
// Env: RUN_NUMBER, RUN_URL, WEB_RESULT, MOBILE_RESULT, COMMIT_SHA, PREVIOUS_DIR
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const [artifactsDir = "artifacts", outDir = "report-out"] = process.argv.slice(2);
const runNumber = process.env.RUN_NUMBER ?? "local";
const runUrl = process.env.RUN_URL ?? "";
const commitSha = (process.env.COMMIT_SHA ?? "").slice(0, 8);
const previousDir = process.env.PREVIOUS_DIR ?? "previous";
const runDirName = `run-${runNumber}`;
const runOut = path.join(outDir, "runs", runDirName);
mkdirSync(runOut, { recursive: true });

const readJson = (file) => {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return undefined;
  }
};

// --- Web: parse the Playwright JSON report -------------------------------
const webTests = [];
const playwrightJson = readJson(
  path.join(artifactsDir, "web-results", "results.json"),
);
const collectSpecs = (suite, breadcrumb) => {
  for (const spec of suite.specs ?? []) {
    const status =
      spec.tests?.some((t) =>
        t.results?.some((r) => r.status === "passed"),
      ) && spec.ok
        ? "passed"
        : spec.ok
          ? "passed"
          : "failed";
    webTests.push({ title: [...breadcrumb, spec.title].join(" › "), status });
  }
  for (const child of suite.suites ?? []) {
    collectSpecs(child, [...breadcrumb, child.title].filter(Boolean));
  }
};
for (const suite of playwrightJson?.suites ?? []) {
  collectSpecs(suite, [suite.title].filter(Boolean));
}

const webReportSrc = path.join(artifactsDir, "web-results", "report");
const hasWebReport = existsSync(webReportSrc);
if (hasWebReport) {
  cpSync(webReportSrc, path.join(runOut, "web", "report"), { recursive: true });
}

// --- Mobile: EAS workflow run metadata -----------------------------------
const mobileRuns = [];
for (const app of ["customer-mobile", "staff-mobile"]) {
  const file = path.join(artifactsDir, `eas-run-${app}`, `eas-run-${app}.json`);
  if (!existsSync(file)) {
    continue;
  }
  const raw = readFileSync(file, "utf8");
  const json = readJson(file);
  const findUrl = raw.match(/https:\/\/expo\.dev\/[^\s"']+/);
  mobileRuns.push({
    app,
    status: json?.status ?? "see run",
    url: json?.url ?? findUrl?.[0] ?? "https://expo.dev/",
    jobs: Array.isArray(json?.jobs)
      ? json.jobs.map((job) => ({
          name: job.name ?? job.type ?? "job",
          status: job.status ?? "unknown",
        }))
      : [],
  });
}

const webResult = process.env.WEB_RESULT ?? (webTests.length ? "success" : "skipped");
const mobileResult = process.env.MOBILE_RESULT ?? (mobileRuns.length ? "success" : "skipped");
const overall =
  [webResult, mobileResult].includes("failure") ? "failure"
  : [webResult, mobileResult].every((r) => r === "skipped") ? "skipped"
  : "success";

// --- HTML ----------------------------------------------------------------
const esc = (value) =>
  String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const pill = (status) => {
  const ok = ["passed", "success", "finished", "completed"].includes(status);
  const skip = ["skipped", "cancelled", "see run"].includes(status);
  const color = ok ? "#1a7f37" : skip ? "#9a6700" : "#cf222e";
  return `<span style="display:inline-block;padding:2px 10px;border-radius:999px;background:${color}1a;color:${color};font-weight:600;">${esc(status)}</span>`;
};

const style = `
  <style>
    body { font-family: -apple-system, system-ui, sans-serif; margin: 2rem auto; max-width: 900px; padding: 0 1rem; color: #1f2328; }
    table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
    th, td { text-align: left; padding: 8px 12px; border-bottom: 1px solid #d0d7de; }
    h1 { font-size: 1.5rem; } h2 { font-size: 1.15rem; margin-top: 2rem; }
    a { color: #0969da; } .muted { color: #656d76; }
    @media (prefers-color-scheme: dark) { body { background: #0d1117; color: #e6edf3; } th, td { border-color: #30363d; } a { color: #58a6ff; } .muted { color: #8b949e; } }
  </style>`;

const webRows = webTests
  .map((t) => `<tr><td>${esc(t.title)}</td><td>${pill(t.status)}</td></tr>`)
  .join("\n");
const mobileRows = mobileRuns
  .map((run) => {
    const jobRows = run.jobs
      .map((job) => `<tr><td class="muted" style="padding-left:2rem;">${esc(job.name)}</td><td>${pill(job.status)}</td></tr>`)
      .join("\n");
    return `<tr><td><a href="${esc(run.url)}">${esc(run.app)}</a> <span class="muted">(видео и логи — на expo.dev)</span></td><td>${pill(run.status)}</td></tr>${jobRows}`;
  })
  .join("\n");

const runPage = `<!doctype html><meta charset="utf-8"><title>E2E run ${esc(runNumber)}</title>${style}
<h1>E2E прогон #${esc(runNumber)} — ${pill(overall)}</h1>
<p class="muted">commit ${esc(commitSha)}${runUrl ? ` · <a href="${esc(runUrl)}">GitHub Actions run</a>` : ""} · ${new Date().toISOString()}</p>
<h2>Web · backoffice (Playwright) — ${pill(webResult)}</h2>
${hasWebReport ? `<p><a href="web/report/index.html">Полный отчёт: видео, трейсы, скриншоты</a></p>` : ""}
<table><tr><th>Сценарий</th><th>Статус</th></tr>${webRows || `<tr><td class="muted" colspan="2">нет результатов</td></tr>`}</table>
<h2>Mobile · iOS + Android (Maestro на EAS) — ${pill(mobileResult)}</h2>
<table><tr><th>Приложение / джоба</th><th>Статус</th></tr>${mobileRows || `<tr><td class="muted" colspan="2">нет результатов</td></tr>`}</table>
<p><a href="../../index.html">← Все прогоны</a></p>`;
writeFileSync(path.join(runOut, "index.html"), runPage);

const summary = {
  run: runNumber,
  overall,
  web: webResult,
  mobile: mobileResult,
  commit: commitSha,
  date: new Date().toISOString(),
};
writeFileSync(path.join(runOut, "summary.json"), JSON.stringify(summary, null, 2));

// --- History index (merges summaries already published to gh-pages) ------
const history = [summary];
const prevRuns = path.join(previousDir, "runs");
if (existsSync(prevRuns)) {
  for (const dir of readdirSync(prevRuns)) {
    if (dir === runDirName) continue;
    const prev = readJson(path.join(prevRuns, dir, "summary.json"));
    if (prev) history.push(prev);
  }
}
history.sort((a, b) => String(b.date).localeCompare(String(a.date)));

const historyRows = history
  .map(
    (h) =>
      `<tr><td><a href="runs/run-${esc(h.run)}/index.html">#${esc(h.run)}</a></td><td>${pill(h.overall)}</td><td>${pill(h.web)}</td><td>${pill(h.mobile)}</td><td class="muted">${esc(h.commit ?? "")}</td><td class="muted">${esc(h.date ?? "")}</td></tr>`,
  )
  .join("\n");
const indexPage = `<!doctype html><meta charset="utf-8"><title>Altyn Market E2E</title>${style}
<h1>Altyn Market — E2E прогоны</h1>
<p class="muted">web (Playwright) + iOS/Android (Maestro на EAS Workflows), окружение: staging</p>
<table><tr><th>Прогон</th><th>Итог</th><th>Web</th><th>Mobile</th><th>Commit</th><th>Дата</th></tr>${historyRows}</table>`;
writeFileSync(path.join(outDir, "index.html"), indexPage);

console.log(`Report written to ${outDir} (${runDirName}); overall: ${overall}`);
