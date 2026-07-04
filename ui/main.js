"use strict";
// DT BP - AI Prompt — v2: custom DQL, custom dashboard description, auto dashboard

const PAGES = ["generator", "setup", "test"];
const PAGE_LABELS = { generator: "Prompt Generator", setup: "Setup Guide", test: "Test Prompt" };

// Auto-detect tenant URL from current hostname (works when running inside a DT tenant)
function detectTenantUrl() {
  const h = window.location.hostname;
  // DT app hostnames look like:
  //   "7z...--nnr75930.prod11.apps.dynatrace.com"            → https://nnr75930.apps.dynatrace.com
  //   "7z...--xpc7999h.hard1.sprint.apps.dynatracelabs.com"  → https://xpc7999h.sprint.apps.dynatracelabs.com
  //   "nnr75930.apps.dynatrace.com"                          → https://nnr75930.apps.dynatrace.com
  //   "xpc7999h.sprint.apps.dynatracelabs.com"               → https://xpc7999h.sprint.apps.dynatracelabs.com
  //
  // Hashed prefix: <hash>--<envid>.<cluster>(.extra)*.apps.<domain>
  // Rule: drop hash+envid prefix cluster segment, keep any extra segments (sprint etc)
  const hashMatch = h.match(/^[^-]+-+([a-z0-9]+)((?:\.[a-z0-9-]+)*)\.(apps\.dynatrace(?:labs)?\.com)$/);
  if (hashMatch) {
    const envId = hashMatch[1];
    const segs = hashMatch[2].split(".").filter(Boolean); // e.g. ["prod11"] or ["hard1","sprint"]
    const keep = segs.slice(1); // drop first (cluster/datacenter), keep rest (sprint, etc.)
    const middle = keep.length > 0 ? "." + keep.join(".") : "";
    return `https://${envId}${middle}.${hashMatch[3]}`;
  }
  // Direct access — use hostname as-is if it matches DT pattern
  if (/^[a-z0-9]+((?:\.[a-z0-9-]+)*)\.apps\.dynatrace(?:labs)?\.com$/.test(h)) return `https://${h}`;
  return "";
}

let state = {
  page: "generator",
  form: {
    // Env
    tenant: detectTenantUrl(),
    // Log source — three modes
    sourceMode: "sample",   // "sample" | "bucket_auto" | "bucket_custom_dql"
    bucket: "",             // only used in bucket_auto mode
    sampleLines: "",
    customDql: "",
    // Format
    logFormat: "Mixed / unknown",
    // Parser destination
    destination: "OpenPipeline (DPL)",
    // Dashboard
    dashMode: "tiles",      // "tiles" | "custom_desc" | "auto"
    dashParseMode: "pipeline", // "pipeline" | "historical" | "both"
    dashTiles: ["Error rate (timeseries)", "P95 latency (timeseries)", "Top errors by message"],
    dashCustomDesc: "",
    // Objective / context
    goal: "", extraContext: "",
    // Artefacts & context
    artifactSlug: "",
    parserContext: "",
    createNotebook: true,   // generate a documentation notebook on the tenant
    // Generated
    _prompt: "",
  },
};

// ─── DOM helpers ──────────────────────────────────────────────────────────
function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (k === "style" && typeof v === "object") Object.assign(el.style, v);
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "className") el.className = v;
    else el.setAttribute(k, v);
  }
  for (const c of children) {
    if (c == null || c === false) continue;
    if (typeof c === "string" || typeof c === "number") el.appendChild(document.createTextNode(String(c)));
    else if (c instanceof Node) el.appendChild(c);
  }
  return el;
}

const T = {
  bg:           "var(--dt-colors-background-base-default, #19192c)",
  surface:      "var(--dt-colors-background-surface-default, #111122)",
  card:         "var(--dt-colors-background-container-neutral-default, #212135)",
  cardSubdued:  "var(--dt-colors-background-container-neutral-subdued, #19192c)",
  fieldBg:      "var(--dt-colors-background-field-neutral-emphasized, #323248)",
  fieldHover:   "var(--dt-colors-background-field-neutral-emphasized-hover, #3b3b52)",
  border:       "var(--dt-colors-border-neutral-default, #3b3b52)",
  borderAccent: "var(--dt-colors-border-primary-accent, #adb0ff)",
  text:         "var(--dt-colors-text-neutral-default, #ebecff)",
  textSub:      "var(--dt-colors-text-neutral-subdued, #b1b2d2)",
  textMuted:    "var(--dt-colors-text-neutral-disabled, #b1b2d280)",
  primary:      "var(--dt-colors-text-primary-default, #adb0ff)",
  btnBg:        "var(--dt-colors-background-field-primary-accent, #474fcf)",
  success:      "var(--dt-colors-text-success-default, #6fc3ba)",
  successBg:    "var(--dt-colors-background-container-success-default, #1e2234)",
  warning:      "var(--dt-colors-text-warning-default, #eea746)",
  warningBg:    "var(--dt-colors-background-container-warning-default, #252230)",
  chipSel:      "var(--dt-colors-background-container-primary-default, #212138)",
  chipSelBord:  "var(--dt-colors-border-primary-accent, #adb0ff)",
  chipSelTxt:   "var(--dt-colors-text-primary-default, #adb0ff)",
  codeFamily:   "var(--dt-typography-code-base-default-family, 'Roboto Mono', monospace)",
  font:         "var(--dt-typography-text-base-default-family, 'DynatraceFlow', 'Roboto', sans-serif)",
  radius:       "var(--dt-borders-radius-container-subdued, 6px)",
  radiusSurf:   "var(--dt-borders-radius-surface-subdued, 9px)",
};

const S = {
  card: { background: T.card, border: `1px solid ${T.border}`, borderRadius: T.radiusSurf, padding: "18px 20px", marginBottom: "14px" },
  input: { width: "100%", padding: "8px 12px", borderRadius: T.radius, border: `1px solid ${T.border}`, background: T.fieldBg, color: T.text, fontSize: "13px", outline: "none", boxSizing: "border-box", fontFamily: T.font },
  label: { fontSize: "12px", fontWeight: "500", color: T.textSub, display: "block", marginBottom: "5px" },
  mono: { fontFamily: T.codeFamily, fontSize: "12px", background: T.fieldBg, border: `1px solid ${T.border}`, borderRadius: "4px", padding: "1px 5px", color: T.text },
  pre: { fontFamily: T.codeFamily, fontSize: "11px", background: T.cardSubdued, border: `1px solid ${T.border}`, borderRadius: T.radius, padding: "12px 14px", overflowX: "auto", whiteSpace: "pre-wrap", wordBreak: "break-all", lineHeight: "1.6", margin: "8px 0", color: T.text },
  sectionTitle: { fontSize: "15px", fontWeight: "500", color: T.text, marginBottom: "12px" },
  link: { color: T.primary, textDecoration: "none", borderBottom: `1px solid ${T.primary}` },
  textSm: { color: T.textSub, fontSize: "13px", lineHeight: "1.6" },
  textXs: { color: T.textMuted, fontSize: "11px" },
  radioCard: (active) => ({
    padding: "10px 14px", borderRadius: T.radius, cursor: "pointer", fontFamily: T.font,
    border: active ? `1.5px solid ${T.chipSelBord}` : `1px solid ${T.border}`,
    background: active ? T.chipSel : "transparent",
    color: active ? T.chipSelTxt : T.textSub,
  }),
};

function card(...children) { return h("div", { style: S.card }, ...children); }
function sectionTitle(txt) { return h("h3", { style: S.sectionTitle }, txt); }
function codeInline(txt) { return h("code", { style: S.mono }, txt); }
function pre(txt) { const el = h("pre", { style: S.pre }); el.textContent = txt; return el; }
function link(href, txt) { return h("a", { href, target: "_blank", style: S.link }, txt); }

function buildCopyButton(text) {
  const btn = h("button", { style: { padding: "7px 18px", borderRadius: T.radius, border: "none", background: T.btnBg, color: "#f4f4fb", fontWeight: "500", fontSize: "13px", cursor: "pointer", fontFamily: T.font } }, "Copy prompt");
  btn.addEventListener("click", () => {
    const done = () => { btn.textContent = "Copied ✓"; btn.style.background = "#1d6b5a"; setTimeout(() => { btn.textContent = "Copy prompt"; btn.style.background = ""; }, 2000); };
    navigator.clipboard?.writeText(text).then(done).catch(() => {
      const ta = document.createElement("textarea"); ta.value = text; ta.style.cssText = "position:fixed;opacity:0"; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); document.body.removeChild(ta); done();
    });
  });
  return btn;
}

function stepBadge(n, color) {
  const cols = { purple: ["#212138","#adb0ff"], blue: ["#212138","#80b3e8"], teal: ["#1e2234","#6fc3ba"], amber: ["#252230","#eea746"] };
  const [bg, fg] = cols[color] || cols.blue;
  return h("div", { style: { width: "24px", height: "24px", borderRadius: "50%", background: bg, color: fg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: "600", flexShrink: "0", border: `1px solid ${fg}40` } }, String(n));
}

function render() { const r = document.getElementById("root"); r.innerHTML = ""; r.appendChild(buildApp()); }

function buildApp() {
  return h("div", { style: { maxWidth: "820px", margin: "0 auto", padding: "0 16px 60px" } },
    buildHeader(), buildNav(),
    state.page === "generator" ? buildGenerator() :
    state.page === "setup"     ? buildSetup()     : buildTest()
  );
}

function buildHeader() {
  return h("div", { style: { padding: "20px 0 14px", borderBottom: `1px solid ${T.border}`, marginBottom: "22px" } },
    h("div", { style: { display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" } },
      h("div", { style: { width: "32px", height: "32px", borderRadius: "8px", background: T.chipSel, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px" } }, "⚡"),
      h("h1", { style: { fontSize: "18px", fontWeight: "500", color: T.text, margin: "0", fontFamily: T.font } }, "DT BP - AI Prompt")
    ),
    h("p", { style: { fontSize: "12px", color: T.textMuted, margin: "0" } }, "Generate Claude Code prompts · AI Skills DT + dtctl + Bindplane")
  );
}

function buildNav() {
  return h("div", { style: { display: "flex", gap: "4px", marginBottom: "22px", background: T.cardSubdued, padding: "4px", borderRadius: T.radiusSurf, border: `1px solid ${T.border}` } },
    ...PAGES.map(p => {
      const active = p === state.page;
      const btn = h("button", { style: { flex: "1", padding: "8px 4px", borderRadius: T.radius, border: "none", background: active ? T.card : "transparent", color: active ? T.text : T.textSub, fontWeight: active ? "500" : "400", fontSize: "13px", cursor: "pointer", fontFamily: T.font } }, PAGE_LABELS[p]);
      btn.addEventListener("click", () => { state.page = p; render(); });
      return btn;
    })
  );
}

// ─── Setup Page ───────────────────────────────────────────────────────────
const SKILLS = [
  ["dt-dql-essentials", "DQL syntax, common pitfalls, query patterns"],
  ["dt-obs-logs", "Log data model, log buckets, OpenPipeline DPL"],
  ["dt-dashboards", "Create/edit dashboards, tiles, variables, visualizations"],
  ["dt-notebooks", "Dynatrace notebooks, DQL analytics workflows"],
  ["dt-obs-services", "Service RED metrics, runtime telemetry"],
  ["dt-obs-frontends", "RUM, Web Vitals, user sessions, frontend errors"],
];

function buildSetup() {
  const steps = [
    buildStep(1, "purple", "Dynatrace AI Skills",
      h("p", { style: S.textSm }, "AI Skills teach Claude Code DQL syntax, log data model, dashboards. Repo: ", link("https://github.com/Dynatrace/dynatrace-for-ai", "github.com/Dynatrace/dynatrace-for-ai")),
      pre("# Install all DT skills in Claude Code\nclaude plugin marketplace add dynatrace/dynatrace-for-ai"),
      h("p", { style: { ...S.textXs, margin: "10px 0 6px" } }, "Relevant skills for log analysis:"),
      ...SKILLS.map(([name, desc]) =>
        h("div", { style: { display: "flex", gap: "10px", padding: "5px 0", borderBottom: `1px solid ${T.border}`, alignItems: "flex-start" } },
          codeInline(name), h("span", { style: S.textXs }, desc))
      )
    ),
    buildStep(2, "blue", "dtctl — Dynatrace CLI",
      h("p", { style: S.textSm }, "kubectl-style CLI for DT resources. Docs: ", link("https://dynatrace-oss.github.io/dtctl", "dynatrace-oss.github.io/dtctl"), " · ", link("https://github.com/dynatrace-oss/dtctl", "GitHub")),
      pre("# macOS\nbrew install dynatrace-oss/tap/dtctl\n\n# Login OAuth\ndtctl auth login --context prod \\\n  --environment \"https://<env-id>.apps.dynatrace.com\"\n\ndtctl doctor\n\n# Install skill for Claude Code\nnpx skills add dynatrace-oss/dtctl")
    ),
    buildStep(3, "teal", "Dynatrace MCP Server",
      h("p", { style: S.textSm }, "Lets Claude Code run DQL live. ", link("https://github.com/dynatrace-oss/dynatrace-mcp", "GitHub"), " · ", link("https://www.dynatrace.com/hub/detail/claude-code-cli/", "Dynatrace Hub")),
      h("p", { style: { ...S.textSm, fontWeight: "500", margin: "10px 0 4px" } }, "Option A — Remote MCP (recommended):"),
      h("p", { style: S.textSm }, "Claude Code → ", codeInline("/mcp"), " → add 'Dynatrace' from marketplace. Browser SSO auth."),
      h("p", { style: { ...S.textSm, fontWeight: "500", margin: "12px 0 4px" } }, "Option B — Local MCP (", codeInline("~/.claude/claude.json"), "):"),
      pre("{\n  \"mcpServers\": {\n    \"dynatrace-mcp-server\": {\n      \"command\": \"npx\",\n      \"args\": [\"-y\", \"@dynatrace-oss/dynatrace-mcp-server@latest\"],\n      \"env\": {\n        \"DT_ENVIRONMENT\": \"https://<env-id>.apps.dynatrace.com\",\n        \"DT_GRAIL_QUERY_BUDGET_GB\": \"10\"\n      }\n    }\n  }\n}")
    ),
    buildStep(4, "amber", "Bindplane AI Skill + OTEL API",
      h("p", { style: S.textSm }, "Bindplane AI Skill embedded in CLI from v1.98+. ", link("https://bindplane.com/blog/bindplane-now-ships-with-a-native-ai-skill-bring-your-own-agent", "How it works")),
      pre("# Install skill in Claude Code\nbindplane skill install\n\n# Login to Bindplane server\nbindplane login --server https://<bindplane-server>:3001\n\nbindplane get agents\nbindplane apply -f my-processor.yaml")
    ),
  ];
  const checklist = [
    ["dtctl doctor", "green output, no errors"],
    ["/mcp in Claude Code", "Dynatrace MCP listed and active"],
    ["/skills in Claude Code", "dynatrace-for-ai and bindplane listed"],
    ["dtctl query 'fetch logs | limit 1'", "returns at least 1 record"],
    ["bindplane get agents", "at least 1 agent connected"],
  ];
  return h("div", {},
    h("p", { style: { ...S.textSm, marginBottom: "22px" } }, "Before using the generator, make sure Claude Code is configured with the right tools."),
    ...steps,
    card(
      sectionTitle("✓ Pre-use checklist"),
      ...checklist.map(([cmd, check]) =>
        h("div", { style: { display: "flex", gap: "12px", alignItems: "flex-start", padding: "6px 0", borderBottom: `1px solid ${T.border}` } },
          h("span", { style: { fontSize: "14px", flexShrink: "0", color: T.success } }, "✓"),
          h("div", {}, codeInline(cmd), h("span", { style: { ...S.textXs, marginLeft: "8px" } }, "→ " + check))
        )
      )
    )
  );
}

function buildStep(n, color, title, ...children) {
  return card(
    h("div", { style: { display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" } },
      stepBadge(n, color), h("h3", { style: S.sectionTitle }, title)
    ),
    ...children
  );
}

// ─── Test Page ────────────────────────────────────────────────────────────
function generateTestPrompt() {
  const f = state.form;
  const hasTenant = f.tenant.trim();
  const hasBucket = f.sourceMode === "bucket_auto" && f.bucket.trim();
  const tenantUrl = hasTenant || "https://<env-id>.apps.dynatrace.com";

  const envCheck = hasTenant ? `
## Environment check — do this first
Target tenant: \`${tenantUrl}\`

1. Find the MCP server matching \`${tenantUrl}\` — run \`/mcp\` to list servers, use only that one.
2. Switch dtctl context:
\`\`\`bash
dtctl config get-contexts
dtctl config use-context <context-matching-${tenantUrl}>
dtctl config current-context && dtctl config describe-context $(dtctl config current-context) --plain
\`\`\`
Confirm both point to \`${tenantUrl}\` before proceeding.
` : `
## Environment check — do this first
\`\`\`bash
dtctl doctor
dtctl config current-context
\`\`\`
`;

  const dqlTest = hasBucket ? `
## Test 1 — DQL query on your bucket
Run via MCP execute_dql (not bash):
\`\`\`dql
fetch logs, from: now()-1h
| filter matchesPhrase(dt.system.bucket, "${f.bucket.trim()}")
| limit 5
| fields timestamp, loglevel, content
\`\`\`
Show me the 5 records. This verifies MCP + dtctl are pointing to the right tenant.` : `
## Test 1 — DQL sample from default logs
Run via MCP execute_dql (not bash):
\`\`\`dql
fetch logs, from: now()-1h
| limit 5
| fields timestamp, loglevel, content
\`\`\`
Show me the 5 records. This verifies MCP + dtctl are pointing to the right tenant.`;

  const sampleLog = f.sampleLines.trim() ? `
## Test 2 — Analyze the provided log sample
Use this sample (already available — no DQL needed):

${f.sampleLines.trim().split("\n").slice(0, 10).join("\n")}

Identify: format, fields present, severity field, timestamp format, any anomalies.` : `
## Test 2 — Synthetic log analysis
Analyze this sample (no bucket needed):

  2024-01-15T10:23:45.123Z ERROR service=payment-svc traceId=abc123 userId=u789 msg="Payment gateway timeout" duration_ms=5001 httpStatus=504
  2024-01-15T10:23:46.001Z INFO  service=payment-svc traceId=abc124 userId=u790 msg="Payment processed" duration_ms=245 httpStatus=200
  2024-01-15T10:23:47.500Z WARN  service=payment-svc traceId=abc125 userId=u791 msg="Retry attempt 2" duration_ms=1200 httpStatus=503
  2024-01-15T10:23:48.000Z ERROR service=auth-svc traceId=abc126 msg="Token validation failed" reason="expired" httpStatus=401
  2024-01-15T10:23:49.200Z INFO  service=auth-svc traceId=abc127 msg="Token refreshed" duration_ms=89 httpStatus=200

Identify: format, fields, severity field, timestamp format, any anomalies.`;

  const dest = f.destination;
  const parserTest = dest === "None (dashboard only)" ? `
## Test 3 — Parser: skipped (None selected)
Confirm you can write an inline parse DQL command on a log line from Test 2:
\`\`\`dql
fetch logs, from: now()-1h
| limit 1
| parse content, "LD:ts SPACE LD:level SPACE LD:rest"
| fields ts, level, rest
\`\`\`
Run via MCP execute_dql. If it returns null fields, try a simpler pattern.` : dest.includes("OpenPipeline") ? `
## Test 3 — OpenPipeline availability check
\`\`\`bash
dtctl get settings-schemas | grep openpipeline
\`\`\`
Confirm \`builtin:openpipeline.logs.pipelines\` appears. Then inspect the schema:
\`\`\`bash
dtctl describe settings-schema builtin:openpipeline.logs.pipelines
\`\`\`
Show me the top-level fields of the schema value structure.` : `
## Test 3 — Bindplane connectivity check
\`\`\`bash
bindplane get agents
bindplane get processors
\`\`\`
Show me the list of connected agents and existing processors.`;

  const dqlTile = hasBucket ? `fetch logs, from: now()-1h
| filter matchesPhrase(dt.system.bucket, "${f.bucket.trim()}")
| summarize count(), by: loglevel` : `fetch logs, from: now()-1h
| summarize count(), by: loglevel`;

  return `# Setup Verification Test — DT BP AI Prompt
${envCheck}
${dqlTest}
${sampleLog}
${parserTest}

## Test 4 — DQL tile syntax check
Using skill dt-dashboards, write and run this DQL via MCP execute_dql:
\`\`\`dql
${dqlTile}
\`\`\`
Confirm it returns results. This verifies DQL tile queries will work for the dashboard.

## Test 5 — Skills availability check
Confirm these skills are loaded (run /skills in Claude Code):
- dt-dql-essentials
- dt-obs-logs
- dt-dashboards
- dtctl skill
${dest.includes("Bindplane") ? "- Bindplane skill" : ""}

Report which skills are active and which (if any) are missing.

---
All 5 tests passing = ready to use the full prompt generator.`.trim();
}

function buildTest() {
  const prompt = generateTestPrompt();
  const f = state.form;
  const hasTenant = f.tenant.trim();
  const hasBucket = f.sourceMode === "bucket_auto" && f.bucket.trim();
  const hasSample = f.sampleLines.trim();

  const tColors = { purple: [T.chipSel, T.primary], blue: [T.chipSel, "#80b3e8"], teal: [T.successBg, T.success], amber: [T.warningBg, T.warning] };
  const steps = [
    ["Test 1", hasBucket ? `DQL on bucket "${f.bucket.trim()}"` : "DQL on default logs — verifies MCP + dtctl", "blue"],
    ["Test 2", hasSample ? "Analyzes your provided log sample" : "Analyzes synthetic log sample", "purple"],
    ["Test 3", f.destination === "None (dashboard only)" ? "Inline parse DQL check" : f.destination.includes("OpenPipeline") ? "OpenPipeline schema availability" : "Bindplane connectivity", "teal"],
    ["Test 4", "DQL tile syntax check" + (hasBucket ? ` on bucket "${f.bucket.trim()}"` : ""), "amber"],
    ["Test 5", "Skills availability — all required skills listed", "blue"],
  ];

  // Info bar showing what's been picked up from Generator
  const contextBadges = [
    hasTenant && h("span", { style: { padding: "2px 8px", borderRadius: "4px", fontSize: "11px", background: T.successBg, color: T.success, border: `1px solid ${T.success}40` } }, "✓ tenant: " + f.tenant.trim()),
    hasBucket && h("span", { style: { padding: "2px 8px", borderRadius: "4px", fontSize: "11px", background: T.successBg, color: T.success, border: `1px solid ${T.success}40` } }, "✓ bucket: " + f.bucket.trim()),
    hasSample && h("span", { style: { padding: "2px 8px", borderRadius: "4px", fontSize: "11px", background: T.chipSel, color: T.primary, border: `1px solid ${T.chipSelBord}40` } }, "✓ log sample included"),
    h("span", { style: { padding: "2px 8px", borderRadius: "4px", fontSize: "11px", background: T.warningBg, color: T.warning, border: `1px solid ${T.warning}40` } }, "parser: " + f.destination),
  ].filter(Boolean);

  return h("div", {},
    card(
      h("div", { style: { marginBottom: "12px" } },
        h("p", { style: { ...S.textSm, fontWeight: "500", marginBottom: "8px" } }, "Generated from your Generator settings:"),
        h("div", { style: { display: "flex", flexWrap: "wrap", gap: "6px" } }, ...contextBadges)
      ),
      !hasTenant && h("p", { style: { ...S.textXs, color: T.warning, marginBottom: "8px" } },
        "⚠️ No tenant URL set in Generator — test will use generic checks. Fill in the tenant URL for a more targeted test."
      ),
      h("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" } },
        h("span", { style: S.textSm }, "5 progressive tests · adapted to your current settings"),
        buildCopyButton(prompt)
      ),
      pre(prompt)
    ),
    card(
      sectionTitle("What this test verifies"),
      ...steps.map(([step, desc, color]) => {
        const [bg, fg] = tColors[color];
        return h("div", { style: { display: "flex", gap: "10px", padding: "7px 0", borderBottom: `1px solid ${T.border}`, alignItems: "center" } },
          h("span", { style: { padding: "2px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: "500", fontFamily: T.codeFamily, background: bg, color: fg } }, step),
          h("span", { style: S.textSm }, desc)
        );
      })
    )
  );
}

// ─── Generator Page ───────────────────────────────────────────────────────
const LOG_FORMATS = ["JSON (structured)", "key=value (logfmt)", "Apache/NGINX access log", "Syslog", "CSV / delimited", "Mixed / unknown"];
const DESTINATIONS = ["OpenPipeline (DPL)", "Bindplane (OTEL processor)", "None (dashboard only)"];
const DASHBOARD_TILES = ["Error rate (timeseries)", "P95 latency (timeseries)", "Top errors by message", "Status code distribution", "Log volume by service", "Anomalies (Davis AI)"];

function chipBtn(label, selected, onClick, accentColor) {
  const btn = h("button", { style: {
    padding: "6px 14px", borderRadius: "20px", fontSize: "12px", cursor: "pointer", fontFamily: T.font,
    border: selected ? `1.5px solid ${accentColor || T.chipSelBord}` : `1px solid ${T.border}`,
    background: selected ? T.chipSel : "transparent",
    color: selected ? (accentColor || T.chipSelTxt) : T.textSub,
    fontWeight: selected ? "500" : "400",
  } }, label);
  btn.addEventListener("click", onClick);
  return btn;
}

function radioBtn(label, sublabel, value, currentValue, stateKey) {
  const active = value === currentValue;
  const wrap = h("button", { style: { ...S.radioCard(active), display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "2px", textAlign: "left", width: "100%" } },
    h("span", { style: { fontSize: "13px", fontWeight: active ? "500" : "400", color: active ? T.chipSelTxt : T.text } }, label),
    sublabel ? h("span", { style: { fontSize: "11px", color: T.textMuted } }, sublabel) : null
  );
  wrap.addEventListener("click", () => { state.form[stateKey] = value; render(); });
  return wrap;
}

function buildInput(key, placeholder, value) {
  const el = h("input", { style: S.input, placeholder });
  el.value = value;
  el.addEventListener("input", e => { state.form[key] = e.target.value; });
  return el;
}

function buildTextarea(key, placeholder, value, height) {
  const el = document.createElement("textarea");
  Object.assign(el.style, S.input, { height: height + "px", resize: "vertical", fontFamily: T.codeFamily, fontSize: "11px" });
  el.placeholder = placeholder;
  el.value = value;
  el.addEventListener("input", e => { state.form[key] = e.target.value; });
  return el;
}

function buildGenerator() {
  const f = state.form;
  const setF = (k, v) => { state.form[k] = v; render(); };
  const toggleTile = t => { const tiles = f.dashTiles; state.form.dashTiles = tiles.includes(t) ? tiles.filter(x => x !== t) : [...tiles, t]; render(); };
  const doGenerate = () => {
    state.form._prompt = generatePrompt(state.form);
    render();
    setTimeout(() => document.getElementById("prompt-output")?.scrollIntoView({ behavior: "smooth" }), 80);
  };

  // ── Section 1: Environment ──
  const isAutoDetected = f.tenant === detectTenantUrl() && f.tenant !== "";
  const secEnv = card(
    sectionTitle("Dynatrace Environment"),
    h("div", {},
      h("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "5px" } },
        h("label", { style: { ...S.label, marginBottom: "0" } }, "Tenant URL"),
        isAutoDetected
          ? h("span", { style: { ...S.textXs, color: T.success } }, "✓ auto-detected from current tenant")
          : h("span", { style: S.textXs }, "editable")
      ),
      buildInput("tenant", "https://abc12345.apps.dynatrace.com", f.tenant)
    )
  );

  // ── Section 2: Log source mode ──
  const modeDesc = {
    sample: "Paste log lines directly — Claude Code analyzes them without querying DT.",
    bucket_auto: "Claude Code queries a specific Grail bucket with a standard DQL.",
    bucket_custom_dql: "You provide the exact DQL — Claude Code runs it as-is. Useful for filtered or complex queries.",
  };
  const sourceModeBody = [
    h("p", { style: { ...S.textXs, marginBottom: "10px" } }, modeDesc[f.sourceMode]),
    f.sourceMode === "sample" ? [
      h("label", { style: S.label }, "Log sample (10-30 representative lines)"),
      buildTextarea("sampleLines", "2024-01-15T10:23:45Z ERROR service=api msg=\"timeout\" duration_ms=5001\n...", f.sampleLines, 110)
    ] : f.sourceMode === "bucket_auto" ? [
      h("div", { style: { marginBottom: "10px" } },
        h("label", { style: S.label }, "Log bucket name"),
        buildInput("bucket", "e.g. default, custom-app-logs, my-app-logs", f.bucket),
        h("p", { style: { ...S.textXs, marginTop: "4px" } },
          "The query will filter on this bucket: ", codeInline("filter matchesPhrase(dt.system.bucket, \"...\")"))
      )
    ] : [
      h("label", { style: S.label }, "Custom DQL query"),
      buildTextarea("customDql",
        "fetch logs, from: now()-2h, to: now()\n| filter dt.system.bucket == \"my-bucket\"\n| filter matchesPhrase(content, \"ERROR\")\n| sort timestamp desc\n| limit 200\n| fields timestamp, loglevel, content, service.name",
        f.customDql, 130),
      h("p", { style: { ...S.textXs, marginTop: "6px" } }, "Claude Code will execute this exact query and analyze the results.")
    ]
  ];

  const secSource = card(
    sectionTitle("Log source"),
    h("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", marginBottom: "14px" } },
      radioBtn("📋 Log sample", "paste lines directly", "sample", f.sourceMode, "sourceMode"),
      radioBtn("🔍 Bucket auto query", "standard DQL generated", "bucket_auto", f.sourceMode, "sourceMode"),
      radioBtn("✍️ Custom DQL query", "you write the exact query", "bucket_custom_dql", f.sourceMode, "sourceMode"),
    ),
    ...sourceModeBody.flat()
  );

  // ── Section 3: Format ──
  const secFormat = card(
    sectionTitle("Log format"),
    h("div", { style: { display: "flex", flexWrap: "wrap", gap: "8px" } },
      ...LOG_FORMATS.map(fmt => chipBtn(fmt, f.logFormat === fmt, () => setF("logFormat", fmt)))
    )
  );

  // ── Section 4: Parser destination ──
  const noParser = f.destination === "None (dashboard only)";
  // When no parser, force dashParseMode to historical and lock it
  if (noParser && f.dashParseMode !== "historical") {
    state.form.dashParseMode = "historical";
  }
  const parserLabel = f.destination.includes("OpenPipeline") ? "OpenPipeline" :
                      f.destination.includes("Bindplane") ? "Bindplane" : null;

  const secDest = card(
    sectionTitle("Parser destination"),
    h("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px" } },
      radioBtn("⚙️ OpenPipeline (DPL)", "DPL processor on Grail ingest", "OpenPipeline (DPL)", f.destination, "destination"),
      radioBtn("🔗 Bindplane (OTEL processor)", "OTEL processor YAML via Bindplane CLI", "Bindplane (OTEL processor)", f.destination, "destination"),
      radioBtn("🚫 None (dashboard only)", "skip parser — inline parse directly in tile DQL queries", "None (dashboard only)", f.destination, "destination"),
    )
  );

  // ── Section 5: Dashboard ──
  const dashModeDesc = {
    tiles: "Select specific tile types to generate DQL queries for.",
    custom_desc: "Describe in natural language what dashboard you want — Claude Code builds it accordingly.",
    auto: "Claude Code decides which tiles make the most sense based on the log analysis results.",
  };

  const dashBody = [
    h("p", { style: { ...S.textXs, marginBottom: "10px" } }, dashModeDesc[f.dashMode]),
    ...(f.dashMode === "tiles" ? [
      h("div", { style: { display: "flex", flexWrap: "wrap", gap: "8px" } },
        ...DASHBOARD_TILES.map(t => chipBtn(t, f.dashTiles.includes(t), () => toggleTile(t), T.warning))
      ),
      f.dashTiles.length === 0
        ? h("p", { style: { ...S.textXs, marginTop: "8px" } }, "No tiles selected — dashboard section will be omitted from the prompt.")
        : null
    ] : f.dashMode === "custom_desc" ? [
      h("label", { style: S.label }, "Dashboard description"),
      buildTextarea("dashCustomDesc",
        "e.g. I want a dashboard with:\n- Error rate % over time (timeseries, last 2h)\n- P95 and P99 latency by service (grouped timeseries)\n- Table of the last 100 errors with traceId, service, message, and timestamp\n- Pie chart of HTTP status code distribution\n- Single value showing total log volume for today",
        f.dashCustomDesc, 140),
      h("p", { style: { ...S.textXs, marginTop: "6px" } }, "Claude Code will use dt-dashboards skill to translate this into DQL tile definitions and apply them via dtctl.")
    ] : [
      h("p", { style: { ...S.textSm } }, "Claude Code will propose dashboard tiles based on fields and patterns found during log analysis — error rates, latency distributions, top services, anomaly indicators. No input required.")
    ])
  ];

  // DQL parsing strategy — locked to inline when no parser chosen
  const parseStrategyRow = noParser
    ? h("div", { style: { background: T.warningBg, border: `1px solid ${T.warning}40`, borderRadius: T.radius, padding: "8px 12px", marginBottom: "14px" } },
        h("p", { style: { ...S.textXs, color: T.warning } },
          "⚠️  Parser = None — DQL parsing strategy is fixed to Inline only. Each dashboard tile will include a parse command directly in the DQL query."
        )
      )
    : h("div", {},
        h("p", { style: { ...S.label, marginBottom: "6px" } }, "DQL parsing strategy"),
        h("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", marginBottom: "10px" } },
          radioBtn(
            `⚙️ ${parserLabel} fields`,
            `queries use fields already extracted by the ${parserLabel} parser — clean, no parse command`,
            "pipeline", f.dashParseMode, "dashParseMode"
          ),
          radioBtn("📜 Historical (inline)", "adds parse command in every tile — covers logs before parser was applied", "historical", f.dashParseMode, "dashParseMode"),
          radioBtn("⚙️+📜 Both", "two dashboards: one per strategy", "both", f.dashParseMode, "dashParseMode"),
        ),
        h("div", { style: { background: T.cardSubdued, borderRadius: T.radius, padding: "8px 12px", marginBottom: "14px", border: `1px solid ${T.border}` } },
          h("p", { style: S.textXs }, {
            pipeline:   `⚙️  Parser active on tenant. Tiles use fields already extracted at ingest by ${parserLabel} (e.g. service, duration, httpStatus). Clean and fast queries.`,
            historical: "📜  Adds inline parse in every DQL tile. Works on logs ingested before the parser was applied. Heavier queries but covers historical data.",
            both:       `⚙️+📜  Two separate dashboards: one using ${parserLabel} fields, one with inline parse for historical coverage.`,
          }[f.dashParseMode])
        )
      );

  const secDash = card(
    sectionTitle("Dashboard"),
    h("p", { style: { ...S.label, marginBottom: "6px" } }, "Content"),
    h("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", marginBottom: "14px" } },
      radioBtn("🔲 Predefined tiles", "choose from standard tiles", "tiles", f.dashMode, "dashMode"),
      radioBtn("✍️ Custom description", "describe what you want", "custom_desc", f.dashMode, "dashMode"),
      radioBtn("🤖 Auto from analysis", "Claude Code decides", "auto", f.dashMode, "dashMode"),
    ),
    parseStrategyRow,
    ...dashBody.flat().filter(Boolean)
  );

  // ── Section 6: Context ──
  const secContext = card(
    sectionTitle("Objective / context (optional)"),
    h("div", { style: { display: "flex", flexDirection: "column", gap: "12px" } },
      h("div", {}, h("label", { style: S.label }, "Specific analysis goal"),
        buildInput("goal", "e.g. reduce MTTD on payment errors, compliance audit, OpenShift troubleshooting...", f.goal)),
      h("div", {}, h("label", { style: S.label }, "Additional context"),
        buildTextarea("extraContext", "e.g. logs from CRI-O containers on OpenShift, UTF-8, ~500MB/day...", f.extraContext, 70))
    )
  );

  // ── Section 7: Artefacts & context ──
  // Generate a default slug from tenant or timestamp if empty
  const defaultSlug = f.tenant.trim()
    ? f.tenant.trim().replace(/https?:\/\//, "").split(".")[0]
    : "dtlog-" + new Date().toISOString().slice(0,10);

  const secArtefacts = card(
    sectionTitle("Artefacts & additional context"),
    h("div", { style: { display: "flex", flexDirection: "column", gap: "14px" } },
      h("div", {},
        h("label", { style: S.label }, "Artefact name / slug"),
        buildInput("artifactSlug",
          `e.g. ${defaultSlug} (used to name parser, dashboard files)`,
          f.artifactSlug),
        h("p", { style: { ...S.textXs, marginTop: "4px" } },
          "Used to name all generated files: ",
          codeInline("parse-<slug>-logs.dpl"),
          ", ",
          codeInline("dashboard-<slug>.json"),
          ". Leave empty to auto-generate from tenant URL.")
      ),
      h("div", {},
        h("label", { style: S.label }, "Additional context for parser & dashboard"),
        buildTextarea("parserContext",
          "e.g.:\n- App: payment microservice on Java Spring Boot\n- Log volume: ~2GB/day, spike during business hours\n- Key fields to surface: transactionId, merchantId, responseCode\n- Known issues: some lines have broken JSON (truncated at 4096 chars)\n- Dashboard audience: ops team, needs 15min granularity\n- Compliance: mask cardNumber field in parser",
          f.parserContext, 130),
        h("p", { style: { ...S.textXs, marginTop: "4px" } },
          "Injected into both parser generation and dashboard steps.")
      ),
      // Notebook toggle
      (() => {
        const chk = document.createElement("input");
        chk.type = "checkbox";
        chk.checked = f.createNotebook;
        chk.style.cssText = `width:16px;height:16px;cursor:pointer;accent-color:${T.primary};flex-shrink:0;margin-top:1px`;
        chk.addEventListener("change", e => { state.form.createNotebook = e.target.checked; render(); });
        return h("div", { style: { display: "flex", alignItems: "flex-start", gap: "10px", padding: "10px 14px", borderRadius: T.radius, border: `1px solid ${T.border}`, background: f.createNotebook ? T.chipSel : "transparent" } },
          chk,
          h("div", {},
            h("p", { style: { ...S.textSm, fontWeight: "500", color: f.createNotebook ? T.chipSelTxt : T.text } }, "📓 Create documentation notebook"),
            h("p", { style: { ...S.textXs, marginTop: "2px" } },
              "Claude Code creates a Dynatrace notebook with the analysis report, parser code, dashboard DQL queries, and recommended next steps — applied directly on the tenant.")
          )
        );
      })()
    )
  );

  // ── Generate button ──
  const genBtn = (() => {
    const btn = h("button", { style: { display: "block", width: "100%", padding: "13px", borderRadius: T.radius, border: "none", background: T.btnBg, color: "#f4f4fb", fontWeight: "600", fontSize: "15px", cursor: "pointer", marginBottom: "8px", fontFamily: T.font } }, "⚡ Generate prompt");
    btn.addEventListener("click", doGenerate);
    return btn;
  })();

  const topBtn = (() => {
    const btn = h("button", { style: { padding: "9px 20px", borderRadius: T.radius, border: "none", background: T.btnBg, color: "#f4f4fb", fontWeight: "500", fontSize: "13px", cursor: "pointer", flexShrink: "0", fontFamily: T.font } }, "Generate ↓");
    btn.addEventListener("click", doGenerate);
    return btn;
  })();

  const promptOutput = f._prompt ? [
    h("div", { id: "prompt-output", style: { ...S.card, borderLeft: `3px solid ${T.primary}`, borderRadius: `0 ${T.radiusSurf} ${T.radiusSurf} 0`, marginTop: "8px" } },
      h("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" } },
        h("span", { style: { ...S.textSm, fontWeight: "500" } }, "Prompt ready — paste into Claude Code"),
        buildCopyButton(f._prompt)
      ),
      pre(f._prompt)
    )
  ] : [];

  return h("div", {},
    h("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "18px", gap: "12px" } },
      h("p", { style: { ...S.textSm, margin: "0" } }, "Fill in what you have — all fields optional. The prompt adapts."),
      topBtn
    ),
    secEnv, secSource, secFormat, secDest, secDash, secContext, secArtefacts,
    genBtn,
    ...promptOutput
  );
}

// ─── Prompt generation ────────────────────────────────────────────────────
function generatePrompt(f) {
  const hasTenant = f.tenant.trim(), hasBucket = f.bucket.trim();
  const noParser = f.destination === "None (dashboard only)";
  const wantOp = !noParser && f.destination.includes("OpenPipeline");
  const wantBp = !noParser && f.destination.includes("Bindplane");
  const dp = noParser ? "historical" : f.dashParseMode;
  const parserLabel = wantOp ? "OpenPipeline" : wantBp ? "Bindplane" : null;
  // Slug: user-defined > derived from tenant > derived from bucket > fallback
  const slug = (
    f.artifactSlug.trim() ||
    (hasTenant ? hasTenant.replace(/https?:\/\//, "").split(".")[0] : "") ||
    (hasBucket ? hasBucket.toLowerCase().replace(/[^a-z0-9]/g, "-") : "") ||
    "dtlog"
  ).toLowerCase().replace(/[^a-z0-9-]/g, "-");
  const tenantUrl = hasTenant || "https://<env-id>.apps.dynatrace.com";
  const parserContextSection = f.parserContext.trim()
    ? `\n## Additional context for parser & dashboard\n${f.parserContext.trim()}\n`
    : "";

  // ── Environment pinning — auto-resolve from tenant URL ──
  const envSection = hasTenant ? `## Environment — read this first
Target tenant: \`${tenantUrl}\`

Before running any tool or command, identify and lock to the correct environment:

1. **MCP server**: run \`/mcp\` to list connected Dynatrace MCP servers. Find the one whose environment URL matches \`${tenantUrl}\` and use ONLY that server for all MCP tool calls in this session. Never use a different MCP server.

2. **dtctl context**: run \`dtctl config get-contexts\` to list available contexts. Switch to the context pointing to \`${tenantUrl}\`:
\`\`\`bash
dtctl config use-context <context-name-matching-${tenantUrl}>
# Verify:
dtctl config current-context && dtctl config describe-context $(dtctl config current-context) --plain
\`\`\`

Do not proceed until both MCP server and dtctl context are confirmed to point to \`${tenantUrl}\`.
` : "";


  // ── Step 0/1: log source ──
  let sourceSection = "";
  if (f.sourceMode === "sample" && f.sampleLines.trim()) {
    sourceSection = `## Step 0 — Log sample provided\nAnalyze this sample (no DQL query needed):\n\n${f.sampleLines.trim()}\n\n## Step 1 — Log source\nUse the sample above. Skip the DQL query.`;
  } else if (f.sourceMode === "bucket_custom_dql" && f.customDql.trim()) {
    sourceSection = `## Step 1 — Execute custom DQL query\nRun this exact DQL query using dtctl or MCP execute_dql:\n\n\`\`\`dql\n${f.customDql.trim()}\n\`\`\`\n\nShow me the first 20-30 records. This is the exact query the user wants — do not modify it.${hasTenant ? `\n\nTenant: \`${hasTenant}\`` : ""}`;
  } else if (hasTenant && hasBucket) {
    sourceSection = `## Step 1 — Sample logs from bucket\nTenant: \`${hasTenant}\`\nBucket: \`${hasBucket}\`\n\nRun this DQL via dtctl or MCP execute_dql:\n\n\`\`\`dql\nfetch logs, from: now()-1h, to: now()\n| filter matchesPhrase(dt.system.bucket, "${hasBucket}")\n| limit 100\n| fields timestamp, status, content, loglevel\n\`\`\`\n\nShow me the first 20 records.`;
  } else {
    sourceSection = `## Step 1 — Log source\nNo sample or bucket specified. Ask the user to either:\n- Paste 20-30 representative log lines, OR\n- Provide a bucket name and (optionally) a DQL query to run`;
  }

  // ── Step 2: format analysis ──
  const formatSection = `## Step 2 — Log format analysis
Expected format: ${f.logFormat !== "Mixed / unknown" ? f.logFormat : "(auto-detect from sample)"}

Produce a structured report:
1. Detected format
2. Fields present (name, inferred type: string / number / timestamp / boolean)
3. Severity/loglevel field — how is it expressed?
4. Timestamp field — format? (ISO8601, epoch ms, custom)
5. High-cardinality fields (traceId, userId, requestId) — useful for correlation
6. Numeric fields (durations, counters, sizes) — metric candidates
7. Error patterns and frequency
8. Anomalies or inconsistencies in the format`;

  // ── Step 3: parser — apply directly ──
  const opPipelineId = `parse-${slug}-logs`;

  const opApplyInstructions = `
Do this in order — do NOT write files before completing the inspect steps.

**Step 3-i: Inspect the schema first**
\`\`\`bash
dtctl describe settings-schema builtin:openpipeline.logs.pipelines
\`\`\`
Read the output carefully. The YAML you build in step 3-iii must conform exactly to this schema structure — field names, nesting, required fields. Do not guess.

**Step 3-ii: Read the existing pipeline config (if any)**
\`\`\`bash
dtctl get settings --schema builtin:openpipeline.logs.pipelines -o json
\`\`\`
If a settings object already exists, note its \`objectId\` and its current \`value\` structure. You will merge your new processor into the existing pipeline, not overwrite the whole object.

**Step 3-iii: Validate the DPL syntax incrementally — use MCP tool, NOT bash**
CRITICAL: never test DPL patterns via dtctl query in bash — shell escaping will corrupt the pattern and cause false failures.
Always use the MCP Dynatrace tool execute_dql directly (no shell, no escaping issues).

Start with a single field, confirm it parses, then add fields one by one:

**3-iii-a: Print one raw log line first**
\`\`\`dql
fetch logs${hasBucket ? `, from: now()-3h\n| filter matchesPhrase(dt.system.bucket, "${hasBucket}")` : ", from: now()-3h"}
| limit 1
| fields content
\`\`\`
Read the exact content string. Copy it exactly — this is what your DPL pattern must match.

**3-iii-b: Test one field at a time (minimal pattern first)**
\`\`\`dql
fetch logs${hasBucket ? `, from: now()-3h\n| filter matchesPhrase(dt.system.bucket, "${hasBucket}")` : ", from: now()-3h"}
| limit 5
| parse content, "FIRST_FIELD_PATTERN_ONLY:field1"
| filter isNotNull(field1)
| fields content, field1
\`\`\`
Confirm field1 is populated before adding more fields. If it returns nulls:
- Print the raw content again and check for leading characters, whitespace, or encoding issues
- Try a more permissive pattern (e.g. DATA instead of NSPACE)
- Never add the next field until the current one parses correctly

**3-iii-c: Extend incrementally**
Add one field at a time to the pattern, running the MCP DQL tool after each addition.
Only move to step 3-iv when ALL fields parse correctly and return non-null values.

DPL pattern reference (use these, never regex syntax):
- SPACE — single space, SPACE* — zero or more spaces
- NSPACE — non-whitespace string (stops at whitespace)
- DATA — any characters including spaces (greedy, use as last resort)
- LD — leading discardable (skip chars up to next matcher)
- INT — integer number, DOUBLE — decimal number
- TIMESTAMP — timestamp (specify format if non-standard)
- 'literal' — match exact literal string (single quotes, no escaping needed)

**Step 3-iv: Build the YAML from the schema**
Only after steps i–iii succeed, write \`parse-${slug}-pipeline.yaml\` using the exact structure from the schema describe output. Embed the validated DPL from step iii.

OpenPipeline matcher syntax rules — violations will cause apply to fail:
- ALLOWED: \`matchesValue(field, "value")\`, \`matchesValue(field, "prefix*")\` (wildcard)
- ALLOWED: \`isNotNull(field)\`, \`== "value"\`, \`!= "value"\`
- ALLOWED: \`matchesPhrase(content, "text")\`
- NOT ALLOWED: \`startsWith()\`, \`endsWith()\`, \`contains()\` — use matchesValue with wildcard instead
- NOT ALLOWED: regex syntax in matchers — use matchesPhrase or matchesValue
- Use \`"true"\` (string) to match all logs

**Step 3-v: Apply**
If no existing settings object:
\`\`\`bash
dtctl create settings --schema builtin:openpipeline.logs.pipelines -f parse-${slug}-pipeline.yaml
\`\`\`
If an existing object was found in step ii, update it (do not create a duplicate):
\`\`\`bash
OBJECT_ID=$(dtctl get settings --schema builtin:openpipeline.logs.pipelines -o json | jq -r '.[0].objectId')
dtctl update settings "$OBJECT_ID" -f parse-${slug}-pipeline.yaml
\`\`\`
If the command fails, read the error carefully and fix the YAML structure before retrying — do not retry with the same file.

**Step 3-vi: Verify**
\`\`\`bash
dtctl get settings --schema builtin:openpipeline.logs.pipelines -o json | grep "${opPipelineId}"
\`\`\`
If MCP Dynatrace exposes a settings or openpipeline method, prefer that over dtctl.`;

  const bpApplyInstructions = `
After generating the YAML, apply it directly to Bindplane:
\`\`\`bash
bindplane apply -f parse-${slug}-logs.yaml
\`\`\`

Verify it was created:
\`\`\`bash
bindplane get processors | grep ${slug}
\`\`\`

If the processor already exists, update it:
\`\`\`bash
bindplane apply --overwrite -f parse-${slug}-logs.yaml
\`\`\``;

  let parserSection = "";
  if (wantOp) {
    parserSection = `
## Step 3 — DPL parser for OpenPipeline — inspect, validate, then apply
Load skill dt-obs-logs. Use the DPL pattern language (not regex) to generate a parser that:
- Extracts all semantic fields found in Step 2
- Maps severity/loglevel to DT standard field
- Renames non-standard fields (e.g. duration_ms → duration)
- Adds log.source = "${hasBucket || slug}"

IMPORTANT: follow the sub-steps below in order. Do not write files until schema and DPL are validated.
${opApplyInstructions}
`;
  } else if (wantBp) {
    parserSection = `
## Step 3 — YAML processor for Bindplane — apply directly
Use Bindplane skill. Generate the correct YAML processor (json_parser, regex_parser or csv_parser) based on format detected in Step 2.
Save to \`parse-${slug}-logs.yaml\`, then:
${bpApplyInstructions}
`;
  } else if (noParser) {
    parserSection = `
## Step 3 — Parser: skipped
No parser will be created. The dashboard tiles (Step 4) will include inline parse commands directly in their DQL queries to extract fields from the raw log content.
Keep the DPL pattern from the log format analysis (Step 2) available — it will be embedded in each tile query.
`;
  }

  // ── Step 4: dashboard — apply directly via dtctl ──
  const bucketFilter = hasBucket ? `All queries must filter on bucket \`${hasBucket}\`.` : "";
  // dp is already defined at top of function (locked to "historical" when noParser)

  // Helper: explain the DQL strategy for each variant
  const pipelineNote = `
DQL strategy — ${parserLabel} FIELDS:
The parser from Step 3 is assumed active on the tenant. Tiles must use the fields already extracted at ingest time (e.g. \`service\`, \`duration\`, \`httpStatus\`, \`loglevel\`).
Do NOT add parse commands inline — the fields are already in the log record.
Example clean tile query:
  fetch logs
  | filter dt.system.bucket == "${hasBucket || "my-bucket"}"
  | summarize errorRate = (countIf(loglevel == "ERROR") / count()) * 100, by: service
  | sort errorRate desc`;

  const historicalNote = noParser ? `
DQL strategy — INLINE PARSE (no external parser):
No pipeline parser was created. Each tile must include the parse command inline to extract fields from the raw log content at query time.
Use the DPL pattern derived from the log format analysis in Step 2 inside a \`| parse content, "..."\` command.
Example tile query with inline parse:
  fetch logs
  | filter dt.system.bucket == "${hasBucket || "my-bucket"}"
  | parse content, "<DPL_PATTERN_FROM_STEP2_ANALYSIS>"
  | summarize errorRate = (countIf(loglevel == "ERROR") / count()) * 100, by: service
  | sort errorRate desc` : `
DQL strategy — HISTORICAL INLINE PARSE:
Tiles must include the parse command inline so they work on logs ingested BEFORE the parser was applied.
Use the exact DPL pattern generated in Step 3 inside a \`| parse content, "..."\` command within each tile query.
Example tile query with inline parse:
  fetch logs
  | filter dt.system.bucket == "${hasBucket || "my-bucket"}"
  | parse content, "<DPL_PATTERN_FROM_STEP3>"
  | summarize errorRate = (countIf(loglevel == "ERROR") / count()) * 100, by: service
  | sort errorRate desc`;

  const dashApply = (suffix, label) => `
Build the dashboard JSON using the dt-dashboards skill format, save to \`dashboard-${slug}${suffix}.json\`, then create it on the tenant:
\`\`\`bash
dtctl dashboard create -f dashboard-${slug}${suffix}.json
\`\`\`
If \`dtctl dashboard create\` is unavailable, use:
\`\`\`bash
curl -X POST "${tenantUrl}/api/v2/documents" \\
  -H "Authorization: Bearer $(dtctl auth token)" \\
  -H "Content-Type: application/json" \\
  -d @dashboard-${slug}${suffix}.json
\`\`\`
After creation, print the dashboard URL${label ? ` (${label})` : ""} so the user can open it directly.`;

  // Build tile spec text based on dashMode
  const tileSpec = (f.dashMode === "tiles" && f.dashTiles.length > 0)
    ? `Tiles:\n${f.dashTiles.map(t => "- " + t).join("\n")}`
    : f.dashMode === "custom_desc" && f.dashCustomDesc.trim()
    ? `User-described layout:\n---\n${f.dashCustomDesc.trim()}\n---\nTranslate into DQL tile definitions. If a requested field doesn't exist, flag it and suggest an alternative from Step 2.`
    : f.dashMode === "auto"
    ? `Auto-select the most useful tiles based on fields found in Step 2:\n- error/severity → error rate timeseries\n- duration/latency → P95/P99 latency timeseries\n- service/source → group by service\n- HTTP status → distribution piechart\n- traceId/userId → searchable table\n- always add log volume (count over time)\n- Davis AI anomaly tile if log volume is significant`
    : "";

  const bucketLine = bucketFilter ? `\n${bucketFilter}\n` : "";

  let dashSection = "";
  if (!tileSpec) {
    // no tiles selected in tiles mode — skip
    dashSection = "";
  } else if (dp === "pipeline") {
    dashSection = `
## Step 4 — Dashboard (pipeline fields) — create directly
Load skill dt-dashboards.
${pipelineNote}
${bucketLine}
${tileSpec}

For each tile: write the complete DQL query (using pipeline fields, no inline parse), visualization type, and title.
${dashApply("", "")}
`;
  } else if (dp === "historical") {
    dashSection = `
## Step 4 — Dashboard (historical inline parse) — create directly
Load skill dt-dashboards.
${historicalNote}
${bucketLine}
${tileSpec}

For each tile: write the complete DQL query (with inline parse command from Step 3 DPL), visualization type, and title.
${dashApply("-historical", "historical dashboard")}
`;
  } else if (dp === "both") {
    dashSection = `
## Step 4a — Dashboard (pipeline fields) — create directly
Load skill dt-dashboards.
${pipelineNote}
${bucketLine}
${tileSpec}

For each tile: write the complete DQL query using pipeline-extracted fields (no inline parse), visualization type, and title.
${dashApply("-pipeline", "pipeline fields dashboard")}

## Step 4b — Dashboard (historical inline parse) — create directly
Same tiles as Step 4a, but rewrite every DQL query to include the inline parse command from Step 3 DPL so the dashboard works on logs ingested before the parser was applied.
${historicalNote}
${bucketLine}
${dashApply("-historical", "historical dashboard")}
`;
  }

  // ── Step 5: notebook ──
  const opSettingsUrl = hasTenant
    ? `${tenantUrl}/ui/apps/dynatrace.settings/settings/openpipeline-logs/pipelines`
    : `https://<env-id>.apps.dynatrace.com/ui/apps/dynatrace.settings/settings/openpipeline-logs/pipelines`;

  const opAvailCheck = wantOp ? `
**Before starting Step 3 — verify OpenPipeline is available on this tenant:**
\`\`\`bash
dtctl get settings-schemas | grep openpipeline
\`\`\`
If the schema \`builtin:openpipeline.logs.pipelines\` does not appear, OpenPipeline is not enabled on this tenant. In that case skip Step 3 and notify the user.

Note: the OpenPipeline UI app (\`dynatrace.openpipeline\`) may be hidden on some tenants (especially trials). The correct UI URL to verify the pipeline config is:
${opSettingsUrl}
` : "";

  const importantNote = noParser
    ? `## Important: apply everything directly
No parser will be created — dashboard tiles will embed inline DQL parse commands derived from the log format analysis.
Apply the dashboard directly using dtctl or the Documents API as described in Step 4.`
    : `## Important: apply everything directly
Do NOT just generate files and tell the user to apply them manually.
After generating each artifact (DPL parser, Bindplane processor, dashboard${f.createNotebook ? ", notebook" : ""}), apply it immediately using the methods described in each step.
OpenPipeline is managed via dtctl Settings API: \`dtctl create settings --schema builtin:openpipeline.logs.pipelines -f <file>\`
${opAvailCheck}`;

  // ── Step 5: notebook (optional) ──
  const notebookSection = f.createNotebook ? `
## Step 5 — Create a documentation notebook
Load skill dt-notebooks. Create a Dynatrace notebook named \`Log Analysis — ${slug}\` that documents everything done in this session:

Section 1 — **Log Format Analysis** (markdown)
: Summary of the format detected in Step 2, list of extracted fields with types, error patterns found, anomalies noted.

Section 2 — **Parser** (markdown + code)
: ${wantOp ? `The DPL program generated and applied to OpenPipeline (pipeline ID: \`${opPipelineId}\`). Include the full DPL content in a code block.` : wantBp ? `The Bindplane YAML processor generated and applied. Include the full YAML in a code block.` : "No parser was created — inline parse pattern used in dashboard tiles."}

Section 3 — **Dashboard DQL queries** (DQL sections)
: One DQL section per dashboard tile, with the query used and a brief explanation of what it shows.

Section 4 — **Recommended next steps** (markdown)
: DT correlation attributes to add, fields that could not be parsed, suggested improvements.

Create and apply the notebook via dtctl:
\`\`\`bash
dtctl notebook create -f notebook-${slug}.json
\`\`\`
If \`dtctl notebook create\` is unavailable, use the Documents API:
\`\`\`bash
curl -X POST "${tenantUrl}/api/v2/documents" \\
  -H "Authorization: Bearer $(dtctl auth token)" \\
  -H "Content-Type: application/json" \\
  -d @notebook-${slug}.json
\`\`\`
Print the notebook URL after creation.`
  : "";

  // ── Step 6: summary ──
  const verifyOp = wantOp ? `\`dtctl get settings --schema builtin:openpipeline.logs.pipelines -o json | grep ${opPipelineId}\`` : "";
  const verifyBp = wantBp ? `\`bindplane get processors | grep ${slug}\`` : "";
  const verifyCmds = [verifyOp, verifyBp].filter(Boolean).join("\n- ");
  const summaryStepNum = f.createNotebook ? "Step 6" : "Step 5";

  const summarySection = `## ${summaryStepNum} — Summary and verification
- List extracted fields with DT standard field mapping
- Warnings on parsing or missing fields
- Recommended DT attributes for trace/metric correlation
- Verify all applies succeeded:
${verifyCmds ? "- " + verifyCmds : "- (no applies requested)"}
- Print direct URLs to:${wantOp ? `\n  - OpenPipeline config: \`${opSettingsUrl}\`` : ""}${wantBp ? "\n  - Bindplane processor: `bindplane get processors`" : ""}
  - Dashboard(s) on tenant${f.createNotebook ? "\n  - Notebook on tenant" : ""}`;

  const goalSection = f.goal.trim() ? `\n## Objective\n${f.goal.trim()}\n` : "";
  const extraSection = f.extraContext.trim() ? `\n## Additional context\n${f.extraContext.trim()}\n` : "";
  const prereqBp = wantBp ? "\n- Bindplane skill    — OTEL processor YAML and bindplane CLI commands" : "";
  const prereqObs = (wantOp || noParser) ? "\n- dt-obs-logs        — OpenPipeline DPL, log data model, buckets" : "";
  const prereqNb = f.createNotebook ? "\n- dt-notebooks       — Dynatrace notebook structure and DQL sections" : "";

  return `# Log Analysis & Parser Generation — Dynatrace

## Prerequisites — Skills to load
- dt-dql-essentials  — correct DQL syntax and query patterns${prereqObs}
- dt-dashboards      — dashboard tile definitions and DQL visualizations${prereqNb}
- dtctl skill        — dtctl commands for settings, dashboards, queries${prereqBp}

${importantNote}
${envSection}${goalSection}${extraSection}${parserContextSection}
${sourceSection}

${formatSection}
${parserSection}
${dashSection}
${notebookSection}

${summarySection}`.trim();
}

document.addEventListener("DOMContentLoaded", render);
