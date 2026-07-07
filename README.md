# DT BP - AI Prompt

A Dynatrace app that generates optimized [Claude Code](https://claude.ai/code) prompts for log analysis, DPL/OTEL parser generation, and Dynatrace dashboard creation.

![DT BP - AI Prompt](https://img.shields.io/badge/Dynatrace-App-blue) ![Version](https://img.shields.io/badge/version-2.0.0-green) ![License](https://img.shields.io/badge/license-MIT-green)

---

## What it does

Instead of writing complex prompts from scratch every time, this app collects your context (tenant URL, log source, parser destination, dashboard type) and generates a structured, opinionated prompt ready to paste into Claude Code.

Claude Code then:
1. Analyzes the log format — from a pasted sample, a DQL query on a Grail bucket, a custom DQL, or automatically via the **LogPatternExtractor** MCP tool
2. Generates and applies a **DPL parser** to OpenPipeline or a **YAML processor** to Bindplane
3. Creates and deploys **two Dynatrace dashboards**: one using pipeline-extracted fields (for new logs), one with inline parse (for historical logs)
4. Creates a **documentation notebook** on the tenant with session info, parser code, DQL queries, and recommended next steps

The app auto-detects the tenant URL from the browser hostname, so you just open it and go.

---

## What's new in v2.0

- **LogPatternExtractor** — new log source mode that uses the Dynatrace MCP `log-pattern-extractor` tool to auto-detect DPL patterns from Grail via ML clustering. Skips manual format analysis entirely when available.
- **Working directory** — every generated prompt sets a dedicated `~/dt-analysis/<slug>/` directory. All files are saved there and the path is recorded in the notebook.
- **Auto-propose slug** — if you leave the slug field empty, Claude Code proposes a descriptive name based on bucket + log format + destination (e.g. `costco-docker-json-openpipeline`) and confirms it before proceeding.
- **Notebook Section 0** — every notebook now opens with a session log: working directory, full file list with paths and purpose, date, tenant URL.
- **OpenPipeline rules hardened** — prompt now explicitly forbids `'['`/`']'` bracket literals in DPL (use `splitString()` instead) and short processor IDs, preventing the most common apply failures.
- **Both dashboard strategies** — always generates two dashboards: pipeline fields (clean queries, post-parser) and historical inline parse (works on logs ingested before the parser).

---

## Prerequisites — Claude Code setup

Before using the generated prompts, make sure Claude Code is configured with:

### 1. Dynatrace AI Skills
```bash
claude plugin marketplace add dynatrace/dynatrace-for-ai
```
Relevant skills: `dt-dql-essentials`, `dt-obs-logs`, `dt-dashboards`, `dt-notebooks`

### 2. dtctl CLI + skill
```bash
# macOS
brew install dynatrace-oss/tap/dtctl

# Authenticate
dtctl auth login --context my-env \
  --environment "https://<env-id>.apps.dynatrace.com"

# Install the dtctl skill for Claude Code
dtctl skills install

# Verify
dtctl doctor
```

### 3. Dynatrace MCP Server
**Option A — Remote MCP (recommended):**
In Claude Code, run `/mcp` → add the "Dynatrace" connector from the marketplace.

**Option B — Local MCP** (`~/.claude/claude.json`):
```json
{
  "mcpServers": {
    "dynatrace-mcp-server": {
      "command": "npx",
      "args": ["-y", "@dynatrace-oss/dynatrace-mcp-server@latest"],
      "env": {
        "DT_ENVIRONMENT": "https://<env-id>.apps.dynatrace.com",
        "DT_GRAIL_QUERY_BUDGET_GB": "10"
      }
    }
  }
}
```

### 4. Bindplane CLI + skill *(optional — only for Bindplane parser destination)*
```bash
# Requires Bindplane CLI v1.98+
bindplane skill install
bindplane login --server https://<bindplane-server>:3001
```

---

## Installation on a Dynatrace tenant

1. Download `dt-bp-ai-prompt-app.zip` from the [Releases](../../releases) page
2. Go to your Dynatrace tenant → **App Management** → **Upload app**
3. The app appears as **DT BP - AI Prompt** (`my.dt.bp.ai.prompt`)

> No OAuth scopes required — the app only generates prompts, it does not call Dynatrace APIs itself.

---

## Building from source

No build step required — pure vanilla JS.

```bash
# Copy main.css from any existing DT app bundle (not included in repo)
unzip existing-dt-app.zip ui/main.css -d .

# Package
./build.sh
```

See `build.sh` for details. `ui/main.css` (Dynatrace Stelvio design system, ~450KB) is not committed to the repo.

---

## How it works

### Three pages

**Prompt Generator** — fill in what you have (all fields optional):
- Tenant URL — auto-detected from current hostname
- Log source: paste a sample / bucket auto-query / custom DQL / **LogPatternExtractor (MCP)**
- Log format hint
- Parser destination: OpenPipeline (DPL) / Bindplane (OTEL processor) / None
- Dashboard: predefined tiles / custom description / auto from analysis
- DQL parsing strategy: pipeline fields / historical inline / both
- Artefact slug (or leave empty for auto-propose)
- Additional context for parser & dashboard

**Setup Guide** — step-by-step instructions with a working directory tip explaining where Claude Code saves generated files.

**Test Prompt** — dynamically generated from your current Generator settings. Verifies MCP, dtctl, skills, and DQL before running the full workflow.

### Generated prompt structure

```
Prerequisites — skills to load
Important — apply everything directly
Working directory — ~/dt-analysis/<slug>/
Environment — MCP server + dtctl context alignment
Step 1 — log source (sample / bucket / custom DQL / LogPatternExtractor)
Step 2 — log format analysis (skipped if LogPatternExtractor used)
Step 3 — parser: DPL (OpenPipeline) or YAML (Bindplane), schema-first
Step 4a — dashboard: pipeline fields
Step 4b — dashboard: historical inline parse
Step 5 — documentation notebook (optional)
Step 6 — summary and verification with direct URLs
```

---

## Key design decisions

**LogPatternExtractor** — when available via MCP, replaces manual log analysis with ML clustering on up to 50,000 records. Returns ready-to-use DPL patterns. Falls back gracefully if the tool is not available on the tenant (preview-gated as of July 2026).

**Schema-first for OpenPipeline** — `dtctl describe settings-schema builtin:openpipeline.logs.pipelines` before writing any YAML. Merge into existing pipeline, never overwrite.

**Incremental DPL validation via MCP** — test one field at a time using `execute_dql`, never via bash (shell escaping corrupts DPL patterns).

**OpenPipeline constraints** — `'['`/`']'` bracket literals rejected → use `splitString()`. Processor IDs must be >3 chars. `startsWith()`, `endsWith()`, `contains()` not allowed in matchers.

**Dual dashboard strategy** — always generates both: pipeline fields (clean, fast, post-parser) and historical inline parse (covers logs before parser was applied).

**Working directory** — `~/dt-analysis/<slug>/` with descriptive auto-proposed slug. Path recorded in notebook Section 0 for permanent reference.

---

## App structure

```
dt-bp-ai-prompt/
├── manifest.yaml      # App metadata (id: my.dt.bp.ai.prompt, v2.0.0)
├── icon.svg           # App icon
├── build.sh           # Packaging script
├── ui/
│   ├── index.html     # Shell — dark theme (data-theme="dark")
│   └── main.js        # All app logic — pure vanilla JS, zero dependencies
```

`ui/main.css` (Stelvio design system) not committed — see Building from source.

---

## Related projects

- [dynatrace-for-ai](https://github.com/Dynatrace/dynatrace-for-ai) — official Dynatrace AI Skills
- [dtctl](https://github.com/dynatrace-oss/dtctl) — Dynatrace platform CLI
- [dynatrace-mcp](https://github.com/dynatrace-oss/dynatrace-mcp) — Dynatrace MCP server for Claude Code

---

## License

MIT
