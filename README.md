# DT BP - AI Prompt

A Dynatrace app that generates optimized [Claude Code](https://claude.ai/code) prompts for log analysis, DPL/OTEL parser generation, and Dynatrace dashboard creation.

![DT BP - AI Prompt](https://img.shields.io/badge/Dynatrace-App-blue) ![License](https://img.shields.io/badge/license-MIT-green)

---

## What it does

Instead of writing complex prompts from scratch every time, this app collects your context (tenant URL, log source, parser destination, dashboard type) and generates a structured, opinionated prompt ready to paste into Claude Code.

Claude Code then:
1. Analyzes the log format (from a pasted sample, a DQL query on a Grail bucket, or a custom DQL)
2. Generates and applies a **DPL parser** to OpenPipeline or a **YAML processor** to Bindplane
3. Creates and deploys a **Dynatrace dashboard** with DQL tiles based on the extracted fields
4. Optionally creates a **documentation notebook** on the tenant

The app auto-detects the tenant URL from the browser hostname, so you just open it and go.

## Screenshots

DT BP - AI Prompt

<img width="611" height="868" alt="Screenshot 2026-07-04 at 14 40 32" src="https://github.com/user-attachments/assets/8d084b0e-102d-405d-a9f9-f8a58beea170" />

Generated Prompt

<img width="758" height="914" alt="Screenshot 2026-07-04 at 14 45 23" src="https://github.com/user-attachments/assets/7eb9dbcb-297c-412b-bc88-8b2fc855d4f3" />

Claude Code Log Analysis

<img width="978" height="698" alt="Screenshot 2026-07-04 at 14 47 33" src="https://github.com/user-attachments/assets/51a0ce18-b62b-4b2c-8e70-fc4c519aa19f" />

Dynatrace Logs

<img width="1472" height="694" alt="Screenshot 2026-07-04 at 14 59 14" src="https://github.com/user-attachments/assets/ce79c599-3ece-4636-8c27-c91c48a31cf6" />

Dynatrace OpenPipeline Generated Parser

<img width="898" height="586" alt="Screenshot 2026-07-04 at 14 52 31" src="https://github.com/user-attachments/assets/5ece7a3c-25cc-49a5-8d3e-150c38639f3a" />

Dynatrace Generated Dashboard

<img width="1161" height="988" alt="Screenshot 2026-07-04 at 14 58 31" src="https://github.com/user-attachments/assets/3be3149e-54d6-4c88-9139-97a3c276ee99" />

## Prerequisites — Claude Code setup

Before using the generated prompts, make sure Claude Code is configured with:

### 1. Dynatrace AI Skills
```bash
claude plugin marketplace add dynatrace/dynatrace-for-ai
```
Relevant skills: `dt-dql-essentials`, `dt-obs-logs`, `dt-dashboards`, `dt-notebooks`

### 2. dtctl CLI + skill
```bash
# Install dtctl
brew install dynatrace-oss/tap/dtctl        # macOS
# or: curl -fsSL https://raw.githubusercontent.com/dynatrace-oss/dtctl/main/install.sh | sh

# Authenticate
dtctl auth login --context my-env \
  --environment "https://<env-id>.apps.dynatrace.com"

# Install the dtctl skill for Claude Code
dtctl skills install
# or: npx skills add dynatrace-oss/dtctl

# Verify
dtctl doctor
```

### 3. Dynatrace MCP Server
**Option A — Remote MCP (recommended):**
In Claude Code, run `/mcp` → add the "Dynatrace" connector from the marketplace. Authentication via browser SSO.

**Option B — Local MCP** (add to `~/.claude/claude.json`):
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
bindplane skill install     # choose: Claude Code

# Login to your Bindplane server
bindplane login --server https://<bindplane-server>:3001
```

---

## Installation on a Dynatrace tenant

1. Download the latest release zip from the [Releases](../../releases) page: `dt-log-analyst-app.zip`
2. Go to your Dynatrace tenant
3. Open **App Management** (search for "App" in the nav)
4. Click **Upload app** and select the zip
5. The app appears as **DT BP - AI Prompt** (`my.dt.bp.ai.prompt`)

> The app requires no OAuth scopes — it only generates prompts, it does not call Dynatrace APIs itself.

---

## Building from source

The app is pure vanilla JavaScript — no build step required.

To package a new zip for upload:
```bash
# From the repo root
zip -r dt-log-analyst-app.zip ui/ manifest.yaml icon.svg
```

The `ui/main.css` (Dynatrace Stelvio design system) is not included in the repo because it is bundled at ~450KB and changes with Dynatrace platform updates. **Copy it from an existing Dynatrace app bundle** before zipping:

```bash
# If you have an existing DT app zip:
unzip existing-dt-app.zip ui/main.css -d .
```

Or download it from any Dynatrace tenant app bundle you have access to.

---

## How it works

### Three pages

**Prompt Generator** — fill in what you have (all fields optional):
- Tenant URL (auto-detected from current hostname)
- Log source: paste a sample, use bucket auto-query, or write a custom DQL
- Log format hint
- Parser destination: OpenPipeline (DPL), Bindplane (OTEL processor), or None (inline parse in dashboard tiles)
- Dashboard type: predefined tiles, custom description, or auto-generated from analysis
- DQL parsing strategy: pipeline fields (post-parser), historical inline parse, or both
- Artefact slug and additional context for parser/dashboard

**Setup Guide** — step-by-step instructions for configuring Claude Code with all required skills and MCP servers.

**Test Prompt** — generates a setup verification prompt adapted to your current Generator settings. Paste into Claude Code to verify MCP, dtctl, skills, and DQL all work before running the full analysis.

### Generated prompt structure

```
Prerequisites — skills to load
Environment — MCP server + dtctl context alignment
Step 0/1 — log source (sample / bucket DQL / custom DQL)
Step 2 — log format analysis report
Step 3 — parser: DPL (OpenPipeline) or YAML (Bindplane), schema-first approach
Step 4 — dashboard: pipeline-field tiles or historical inline-parse tiles
Step 5 — documentation notebook (optional)
Step 6 — summary and verification with direct URLs
```

---

## Key design decisions

**Schema-first for OpenPipeline** — the prompt instructs Claude Code to run `dtctl describe settings-schema builtin:openpipeline.logs.pipelines` before writing any YAML, avoiding trial-and-error failures from guessing the schema structure.

**Incremental DPL validation via MCP** — DPL patterns are tested field-by-field using the MCP `execute_dql` tool, never via bash (shell escaping corrupts DPL patterns). One field at a time, confirmed non-null before adding the next.

**OpenPipeline matcher rules** — the prompt explicitly lists what is and isn't allowed in OpenPipeline matchers (`matchesValue()` with wildcard ✓, `startsWith()` ✗) to avoid apply failures.

**Tenant auto-detection** — reads `window.location.hostname` and extracts the clean tenant URL, handling both production (`--envid.cluster.apps.dynatrace.com`) and labs/sprint (`--envid.cluster.sprint.apps.dynatracelabs.com`) hostname patterns.

**Dashboard DQL strategy** — separates "pipeline fields" (clean queries using fields already extracted at ingest) from "historical inline parse" (DQL with embedded parse commands for logs ingested before the parser was active).

---

## App structure

```
dt-bp-ai-prompt/
├── manifest.yaml          # App metadata (id, name, version, scopes)
├── icon.svg               # App icon
├── ui/
│   ├── index.html         # Shell — loads main.css + main.js, sets data-theme="dark"
│   └── main.js            # All app logic — pure vanilla JS, zero dependencies
```

`main.css` (Dynatrace Stelvio design system, ~450KB) is not committed — see Building from source above.

---

## Contributing

PRs welcome. A few things to keep in mind:

- `main.js` is intentionally vanilla JS with no build step — keep it that way
- All user-facing text is in English
- The prompt generation logic lives in `generatePrompt()` — improvements to the instructions (especially around OpenPipeline schema, DPL patterns, or Bindplane YAML structure) are the highest-value contributions
- If you discover new OpenPipeline or dtctl behaviours that should be reflected in the prompt, open an issue with the specific error and the fix

---

## Related projects

- [dynatrace-for-ai](https://github.com/Dynatrace/dynatrace-for-ai) — official Dynatrace AI Skills
- [dtctl](https://github.com/dynatrace-oss/dtctl) — Dynatrace platform CLI
- [dynatrace-mcp](https://github.com/dynatrace-oss/dynatrace-mcp) — Dynatrace MCP server for Claude Code

---

## License

MIT
