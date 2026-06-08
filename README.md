<div align="center">

# ⚡ LangShift

### AI Code Transpiler for VS Code

**Convert code between 25+ languages with a single rename.**
Six AI providers. Smart caching. PII scrubbing. Offline support. Enterprise-ready.

[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/langshift.langshift?label=VS%20Code%20Marketplace&logo=visual-studio-code&color=0078d7)](https://marketplace.visualstudio.com/items?itemName=langshift.langshift)
[![Version](https://img.shields.io/badge/version-2.0.0-blueviolet?logo=semanticrelease)](https://github.com/langshift/langshift-vscode/releases/tag/v2.0.0)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)
[![Downloads](https://img.shields.io/visual-studio-marketplace/d/langshift.langshift?color=blue&logo=visual-studio-code)](https://marketplace.visualstudio.com/items?itemName=langshift.langshift)
[![CI](https://github.com/langshift/langshift-vscode/actions/workflows/ci.yml/badge.svg)](https://github.com/langshift/langshift-vscode/actions)

<br />

[Install from Marketplace](https://marketplace.visualstudio.com/items?itemName=langshift.langshift) · [Report Bug](https://github.com/langshift/langshift-vscode/issues) · [Request Feature](https://github.com/langshift/langshift-vscode/issues)

<br />

```
  main.py   ──rename──▶   main.java
  ┌──────────────┐        ┌──────────────────────┐
  │ def greet(): │   AI   │ public String greet() │
  │   return "Hi"│  ────▶ │   { return "Hi"; }   │
  └──────────────┘        └──────────────────────┘
```

</div>

---

## 🤔 Why LangShift?

Most code translators are toys — copy-paste into a web UI, get broken output, manually fix imports. **LangShift is different.**

| | Other Tools | **LangShift v2.0** |
|---|---|---|
| **Workflow** | Copy → paste → web UI → copy back | Rename the file. Done. |
| **Providers** | Single vendor lock-in | 6 providers (4 cloud + 2 local) |
| **Offline** | ❌ Always needs internet | ✅ Ollama & LM Studio work air-gapped |
| **Context** | Converts file in isolation | Reads import tree for accurate output |
| **Validation** | Trust the AI blindly | Compiler checks + confidence scoring |
| **Privacy** | Your code hits their servers | PII scrubbing, audit logs, local options |
| **Caching** | Recomputes every time | SHA-256 smart cache — instant repeats |
| **Enterprise** | Settings per user | `.langshiftrc.json` + team shared config |
| **Reliability** | Fails? You retry. | Fallback chain auto-retries next provider |

---

## ✨ Feature Highlights

### 🧠 AI-Powered Core
- **6 AI Providers** — Claude, GPT-4o, Gemini, OpenRouter, Ollama, LM Studio
- **Two-Pass Conversion** — AI generates code, then reviews and fixes its own output
- **Confidence Scoring** — Every conversion rated 0–100 so you know what to double-check
- **Model Routing** — Auto-selects the best model for each language pair
- **Few-Shot Examples** — Built-in examples for popular conversion pairs boost accuracy
- **Streaming Output** — Watch converted code appear in real-time

### 🔒 Enterprise Security
- **PII Scrubbing** — Auto-redact emails, IPs, phone numbers, SSNs before sending to AI (HIPAA/GDPR safe)
- **Audit Log** — JSONL log of every conversion with CSV export for compliance (no code content logged)
- **Secret Scanner** — Warns before sending code containing hardcoded credentials
- **Encrypted Key Storage** — API keys stored in VS Code SecretStorage (OS keychain), never in plaintext
- **Local AI Options** — Ollama & LM Studio keep all data on your machine

### 📦 Multi-File Intelligence
- **Import Tree Context** — Reads imported/required files for accurate type-aware conversions
- **Batch Folder Conversion** — Right-click a folder → convert all files at once
- **Auto Test Detection** — Finds and converts associated test files automatically
- **Import Resolver** — Checks if target-language packages actually exist

### ⚡ Performance & Reliability
- **Smart Caching** — SHA-256 content hashing; unchanged files convert instantly from cache
- **Provider Fallback Chain** — Primary fails with 429/5xx? Auto-retries the next provider
- **Compiler Validation** — Runs `tsc`, `javac`, `go build`, `rustc`, `g++`, `gcc`, `dotnet build`, `python -m py_compile` on output
- **Undo with Backup** — Every file backed up atomically; one-click restore

### 🛠 Team & Configuration
- **Custom Rules** — `.langshiftrc.json` per-project overrides (model, language mappings, exclusions)
- **Team Settings** — `.vscode/langshift.team.json` shared via version control
- **Dashboard** — Visual analytics: conversion history, provider breakdown, cache hit rate
- **Proxy Support** — HTTP/HTTPS proxy for corporate networks

---

## 🌍 Supported Languages

| | | | | |
|---|---|---|---|---|
| Python | JavaScript | TypeScript | Java | C++ |
| C | C# | Go | Rust | Ruby |
| PHP | Swift | Kotlin | Scala | Dart |
| Lua | Perl | Haskell | Elixir | R |
| MATLAB | Shell/Bash | PowerShell | JSX | TSX |

> **25 languages** with full extension detection and idiomatic conversion patterns.

---

## 🚀 Quick Start

### 1️⃣ Install

Search **"LangShift"** in the VS Code Extensions panel, or run:

```
ext install langshift.langshift
```

### 2️⃣ Configure an AI Provider

Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) → **LangShift: Configure API Key**

Select your provider → paste your API key → Done.

> 💡 **No API key needed for Ollama or LM Studio** — they run locally on your machine.

### 3️⃣ Convert Code

**Option A — Rename to convert (magic mode):**
```
app.py  →  app.java         # Python → Java  
server.js  →  server.ts     # JavaScript → TypeScript  
utils.go  →  utils.rs       # Go → Rust
```

**Option B — Command Palette:**
`Ctrl+Shift+P` → **LangShift: Convert This File** → select target language

**Option C — Right-click:**
Right-click any file in Explorer → **LangShift: Convert This File**

A confirmation dialog appears → choose **Convert**, **Preview Diff**, or **Skip**.

---

## 🔧 Provider Setup

### ☁️ Cloud Providers

<details>
<summary><b>🟣 Anthropic (Claude)</b> — Recommended for code quality</summary>

1. Get an API key at [console.anthropic.com](https://console.anthropic.com)
2. `Ctrl+Shift+P` → **LangShift: Configure API Key** → select **Anthropic**
3. Paste your key

**Available models:**
| Model | Best For |
|---|---|
| `claude-sonnet-4-20250514` (default) | Best balance of quality and speed |
| `claude-haiku-3-5` | Fast, cost-effective conversions |

```json
"langshift.aiProvider": "anthropic",
"langshift.anthropicModel": "claude-sonnet-4-20250514"
```
</details>

<details>
<summary><b>🟢 OpenAI (GPT-4o)</b> — Strong all-rounder</summary>

1. Get an API key at [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
2. `Ctrl+Shift+P` → **LangShift: Configure API Key** → select **OpenAI**
3. Paste your key

**Available models:**
| Model | Best For |
|---|---|
| `gpt-4o` (default) | Highest accuracy |
| `gpt-4o-mini` | Budget-friendly, still strong |
| `o1-preview` | Complex architectural conversions |
| `o1-mini` | Reasoning-heavy, smaller footprint |

```json
"langshift.aiProvider": "openai",
"langshift.openaiModel": "gpt-4o"
```
</details>

<details>
<summary><b>🔵 Google Gemini</b> — Fast and cost-effective</summary>

1. Get an API key at [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
2. `Ctrl+Shift+P` → **LangShift: Configure API Key** → select **Gemini**
3. Paste your key

**Available models:**
| Model | Best For |
|---|---|
| `gemini-2.0-flash` (default) | Ultra-fast with great quality |
| `gemini-1.5-pro` | Complex, large-file conversions |
| `gemini-1.5-flash` | Budget-friendly speed |

```json
"langshift.aiProvider": "gemini",
"langshift.geminiModel": "gemini-2.0-flash"
```
</details>

<details>
<summary><b>🟡 OpenRouter</b> — Access 200+ models with one key</summary>

1. Get an API key at [openrouter.ai/keys](https://openrouter.ai/keys)
2. `Ctrl+Shift+P` → **LangShift: Configure API Key** → select **OpenRouter**
3. Paste your key

**Example models:**
```json
"langshift.aiProvider": "openrouter",
"langshift.openrouterModel": "anthropic/claude-sonnet-4-20250514"
```

Other popular choices:
- `meta-llama/llama-3.3-70b-instruct`
- `google/gemini-2.0-flash-exp`
- `mistralai/mixtral-8x7b-instruct`

</details>

### 🏠 Local Providers (No API Key Required)

<details>
<summary><b>🦙 Ollama</b> — Fully offline, air-gapped safe</summary>

1. Install Ollama from [ollama.com](https://ollama.com)
2. Pull a code model:
   ```bash
   ollama pull deepseek-coder-v2
   ```
3. Set your VS Code settings:
   ```json
   "langshift.aiProvider": "ollama",
   "langshift.ollamaModel": "deepseek-coder-v2",
   "langshift.ollamaBaseUrl": "http://localhost:11434/v1"
   ```

**No API key. No data leaves your machine. Perfect for classified/regulated environments.**

> 💡 Run `ollama list` to see available models on your system.
</details>

<details>
<summary><b>🖥 LM Studio</b> — GUI-based local AI</summary>

1. Install LM Studio from [lmstudio.ai](https://lmstudio.ai)
2. Download and load a code model in the LM Studio UI
3. Start the local server in LM Studio
4. Set your VS Code settings:
   ```json
   "langshift.aiProvider": "lmstudio",
   "langshift.lmstudioModel": "loaded-model",
   "langshift.lmstudioBaseUrl": "http://localhost:1234/v1"
   ```

**No API key. No data leaves your machine. Use any GGUF model you like.**
</details>

---

## ⚙️ Configuration Reference

Open VS Code Settings (`Ctrl+,`) → search **"langshift"**, or edit `settings.json` directly.

### Provider Settings

| Setting | Type | Default | Description |
|---|---|---|---|
| `langshift.aiProvider` | `string` | `"anthropic"` | Active provider: `anthropic`, `openai`, `gemini`, `openrouter`, `ollama`, `lmstudio` |
| `langshift.anthropicModel` | `string` | `"claude-sonnet-4-20250514"` | Anthropic model |
| `langshift.openaiModel` | `string` | `"gpt-4o"` | OpenAI model |
| `langshift.geminiModel` | `string` | `"gemini-2.0-flash"` | Google Gemini model |
| `langshift.openrouterModel` | `string` | `"anthropic/claude-sonnet-4-20250514"` | OpenRouter model identifier |
| `langshift.ollamaModel` | `string` | `"deepseek-coder-v2"` | Ollama model name |
| `langshift.ollamaBaseUrl` | `string` | `"http://localhost:11434/v1"` | Ollama API endpoint |
| `langshift.lmstudioModel` | `string` | `"loaded-model"` | LM Studio model identifier |
| `langshift.lmstudioBaseUrl` | `string` | `"http://localhost:1234/v1"` | LM Studio API endpoint |

### Conversion Behavior

| Setting | Type | Default | Description |
|---|---|---|---|
| `langshift.autoConvertOnRename` | `bool` | `true` | Trigger conversion when a file is renamed to a new extension |
| `langshift.showConfirmationDialog` | `bool` | `true` | Show confirm dialog before converting |
| `langshift.showDiffBeforeApply` | `bool` | `true` | Side-by-side diff preview before applying |
| `langshift.autoConvertTests` | `bool` | `true` | Auto-detect and convert associated test files |
| `langshift.preserveComments` | `bool` | `true` | Preserve and translate comments/docstrings |
| `langshift.streaming` | `bool` | `true` | Show converted code appearing in real-time |
| `langshift.backupBeforeConvert` | `bool` | `true` | Create backup before each conversion |

### AI Enhancement

| Setting | Type | Default | Description |
|---|---|---|---|
| `langshift.twoPassConversion` | `bool` | `false` | AI reviews its own output in a second pass (doubles API cost) |
| `langshift.confidenceScoring` | `bool` | `true` | AI rates conversion confidence 0–100 |
| `langshift.modelRouting` | `bool` | `false` | Use curated provider/model routes when the recommended provider is configured |
| `langshift.multiFileContext` | `bool` | `true` | Include imported files as context for better accuracy |
| `langshift.maxContextFiles` | `number` | `5` | Max number of context files to include |
| `langshift.maxContextLinesPerFile` | `number` | `200` | Max lines per context file |
| `langshift.fallbackEnabled` | `bool` | `false` | Auto-retry with fallback providers on 429/5xx errors |
| `langshift.fallbackChain` | `array` | `["openai","gemini"]` | Ordered list of fallback providers |

### Security & Compliance

| Setting | Type | Default | Description |
|---|---|---|---|
| `langshift.piiScrubbing` | `bool` | `false` | Auto-redact emails, IPs, phones, SSNs before sending to AI |
| `langshift.auditLog` | `bool` | `false` | Log conversions to `.langshift/audit.jsonl` (no code content) |
| `langshift.enableCache` | `bool` | `true` | SHA-256 smart caching for instant repeat conversions |
| `langshift.proxyUrl` | `string` | `""` | HTTP/HTTPS proxy for corporate networks |
| `langshift.telemetryEnabled` | `bool` | `false` | Opt-in anonymous telemetry (no code ever sent) |

### Limits

| Setting | Type | Default | Description |
|---|---|---|---|
| `langshift.maxFileSizeKB` | `number` | `500` | Maximum file size (KB) for conversion |
| `langshift.conversionTimeout` | `number` | `90` | Timeout in seconds per AI request |
| `langshift.rateLimitPerHour` | `number` | `50` | Maximum conversions per hour |
| `langshift.batchDelayMs` | `number` | `600` | Delay (ms) between batch conversion requests |

---

## 📄 `.langshiftrc.json` — Per-Project Rules

Create a `.langshiftrc.json` in your project root to override settings per-project:

```json
{
  "defaultProvider": "anthropic",
  "defaultModel": "claude-sonnet-4-20250514",
  "twoPassConversion": true,
  "confidenceThreshold": 75,
  "rules": [
    {
      "from": "python",
      "to": "java",
      "model": "claude-sonnet-4-20250514",
      "instructions": "Use Java 17+ features. Prefer records over POJOs. Use var where type is obvious."
    },
    {
      "from": "javascript",
      "to": "typescript",
      "model": "gpt-4o",
      "instructions": "Use strict mode. Prefer interfaces over type aliases. Add JSDoc where missing."
    }
  ],
  "exclude": [
    "**/node_modules/**",
    "**/vendor/**",
    "**/*.generated.*"
  ],
  "piiScrubbing": true,
  "auditLog": true
}
```

> 💡 The `rules` array lets you set per-language-pair models and custom instructions — ideal for teams with specific coding standards.

---

## 👥 Team Settings — `.vscode/langshift.team.json`

Share team-wide LangShift configuration through version control:

```json
{
  "version": "2.0",
  "provider": "anthropic",
  "model": "claude-sonnet-4-20250514",
  "twoPassConversion": true,
  "confidenceScoring": true,
  "piiScrubbing": true,
  "auditLog": true,
  "fallbackEnabled": true,
  "fallbackChain": ["openai", "gemini"],
  "maxFileSizeKB": 300,
  "rateLimitPerHour": 30,
  "conversionTimeout": 120,
  "exclude": [
    "**/generated/**",
    "**/vendor/**"
  ],
  "rules": [
    {
      "from": "python",
      "to": "java",
      "instructions": "Follow our Java 17 style guide. Use Spring Boot annotations."
    }
  ]
}
```

Commit this file to your repo. Every team member gets the same conversion behavior — no per-user configuration drift.

---

## 📋 Commands

| Command | Shortcut | Description |
|---|---|---|
| **LangShift: Convert This File** | — | Convert the active file to another language |
| **LangShift: Convert All Files in Folder** | — | Batch convert an entire folder |
| **LangShift: Show Conversion History** | — | Browse past conversions with details |
| **LangShift: Open Dashboard** | — | Visual analytics dashboard |
| **LangShift: Configure API Key** | — | Add or change a provider's API key |
| **LangShift: Delete Stored API Key** | — | Remove a stored API key |
| **LangShift: Undo Last Conversion** | — | Restore previous file from backup |
| **LangShift: Cancel Active Conversion** | — | Cancel an in-flight AI request |
| **LangShift: Clear Conversion Cache** | — | Clear the SHA-256 smart cache |
| **LangShift: Export Audit Log (CSV)** | — | Export audit log as CSV for compliance |

All commands are also accessible via the **right-click context menu** on supported files and folders.

---

## 🏗 Architecture Overview

```
src/
├── extension.ts                  ← Activation, command registration, rename watcher
│
├── ai/                           ← Provider abstraction layer
│   ├── AIProvider.ts             ← Common interface for all providers
│   ├── AnthropicProvider.ts      ← Claude API integration
│   ├── OpenAIProvider.ts         ← GPT-4o API integration
│   ├── GeminiProvider.ts         ← Gemini API integration
│   ├── OpenRouterProvider.ts     ← OpenRouter multi-model gateway
│   ├── OllamaProvider.ts         ← Local Ollama integration
│   ├── LMStudioProvider.ts       ← Local LM Studio integration
│   └── ProviderFactory.ts        ← Factory pattern for provider instantiation
│
├── core/                         ← Conversion engine & intelligence
│   ├── ConversionEngine.ts       ← Orchestrates the full conversion pipeline
│   ├── LanguageDetector.ts       ← 25 languages, extension ↔ name mapping
│   ├── ConversionHistory.ts      ← Persistent history with stats
│   ├── ConversionCache.ts        ← SHA-256 content-hash smart cache
│   ├── BackupManager.ts          ← Atomic backup and restore
│   ├── CodeValidator.ts          ← Syntax validation per language
│   ├── CompilerValidator.ts      ← Runs actual compilers on output
│   ├── ContextCollector.ts       ← Import tree walker for multi-file context
│   ├── FallbackChain.ts          ← Provider fallback with retry logic
│   ├── FewShotExamples.ts        ← Built-in examples for popular pairs
│   ├── ImportResolver.ts         ← Validates target-language package existence
│   ├── ModelRouter.ts            ← Auto-picks best model per language pair
│   ├── PIIRedactor.ts            ← Regex-based PII scrubbing engine
│   └── AuditLog.ts               ← JSONL audit trail with CSV export
│
├── config/                       ← Configuration management
│   ├── CustomRules.ts            ← .langshiftrc.json loader and validator
│   └── TeamSettings.ts           ← Team shared settings loader
│
├── security/                     ← Security layer
│   ├── SecurityManager.ts        ← Multi-provider encrypted key storage + secret scanning
│   └── RateLimiter.ts            ← Sliding-window rate limiter
│
├── providers/                    ← VS Code UI providers
│   ├── DiffProvider.ts           ← Side-by-side diff editor + dashboard webview
│   └── SidebarProvider.ts        ← Activity bar sidebar with live stats
│
└── utils/                        ← Shared utilities
    ├── ConfigManager.ts          ← Typed settings wrapper
    ├── Logger.ts                 ← VS Code output channel logger
    └── TelemetryService.ts       ← Privacy-first opt-in telemetry
```

### Conversion Pipeline

```
┌─────────┐    ┌──────────┐    ┌───────────┐    ┌──────────┐    ┌───────────┐
│  Input   │───▶│  Cache   │───▶│ PII Scrub │───▶│ Context  │───▶│  AI Call  │
│  File    │    │  Check   │    │ (opt-in)  │    │ Collect  │    │ (stream)  │
└─────────┘    └──────────┘    └───────────┘    └──────────┘    └───────────┘
                 │ hit                                               │
                 ▼                                                   ▼
              ┌──────────┐                                    ┌───────────┐
              │ Instant  │                                    │ Two-Pass  │
              │ Return   │                                    │ Review    │
              └──────────┘                                    └───────────┘
                                                                    │
                ┌───────────┐    ┌──────────┐    ┌──────────┐       │
                │  Backup   │◀──│ Compiler │◀──│ Validate │◀──────┘
                │  + Apply  │    │  Check   │    │ + Score  │
                └───────────┘    └──────────┘    └──────────┘
```

---

## 🔐 Security & Privacy

LangShift is built with enterprise security requirements in mind:

| Concern | How LangShift Handles It |
|---|---|
| **API Key Storage** | Encrypted via VS Code `SecretStorage` (OS keychain). Never stored in `settings.json` or plaintext files. |
| **Code Transmission** | HTTPS only. Code sent only to your chosen provider. Local providers (Ollama/LM Studio) send nothing over the network. |
| **PII Protection** | Optional regex-based scrubbing of emails, IPs, phone numbers, SSNs before AI transmission. HIPAA/GDPR-compatible. |
| **Audit Trail** | Optional JSONL logging of every conversion (timestamp, provider, languages, file name — **no code content**). Exportable as CSV. |
| **Secret Scanning** | Warns if source code contains hardcoded passwords, API keys, or tokens before sending. |
| **Local Code Retention** | Recent conversion history keeps source and converted code locally in VS Code global state for diff viewing; older entries drop code content. Audit logs and telemetry never include code. |
| **Backups** | Stored in `.langshift-backups/` with auto-generated `.gitignore` to prevent accidental commits. |
| **Telemetry** | Strictly opt-in. Anonymous. Never includes code, file paths, or API keys. |
| **Air-Gapped Environments** | Use Ollama or LM Studio — zero network requests, full functionality. |
| **Corporate Proxy** | Set `langshift.proxyUrl` for environments behind HTTP/HTTPS proxies. |

---

## ❓ FAQ

<details>
<summary><b>Which AI provider should I use?</b></summary>

- **Best quality:** Anthropic Claude (`claude-sonnet-4-20250514`) — excellent at understanding code semantics and idioms.
- **Best value:** Google Gemini (`gemini-2.0-flash`) — fast, cheap, and surprisingly capable.
- **Most models:** OpenRouter — access 200+ models with a single API key.
- **Offline/private:** Ollama or LM Studio — no data leaves your machine.

</details>

<details>
<summary><b>Does my code get stored anywhere?</b></summary>

**No.** LangShift sends your code to the AI provider you choose (via HTTPS) and receives the converted output. Nothing is stored on any intermediate server. With Ollama or LM Studio, nothing leaves your machine at all.

</details>

<details>
<summary><b>How does smart caching work?</b></summary>

LangShift hashes your file content using SHA-256, combined with the source language, target language, and model. If you convert the same unchanged file with the same settings again, the result is returned instantly from cache — no API call, no cost.

</details>

<details>
<summary><b>What is two-pass conversion?</b></summary>

When enabled, LangShift sends the AI's first output back to the AI with the prompt "review and fix this conversion." The AI catches its own mistakes — missing edge cases, incorrect imports, non-idiomatic patterns. This doubles API cost but meaningfully improves output quality for complex files.

</details>

<details>
<summary><b>Can I use this in an air-gapped environment?</b></summary>

**Yes.** Configure Ollama or LM Studio as your provider. Both run entirely locally. No internet connection required. No telemetry. No external API calls. Perfect for classified, regulated, or restricted environments.

</details>

<details>
<summary><b>What does the confidence score mean?</b></summary>

The AI rates its own conversion confidence from 0 to 100:
- **90–100:** High confidence — straightforward conversion, likely correct.
- **70–89:** Good — may need minor review for edge cases.
- **50–69:** Moderate — review recommended, especially complex logic.
- **Below 50:** Low — significant manual review needed.

</details>

<details>
<summary><b>How does the fallback chain work?</b></summary>

When `fallbackEnabled` is `true` and your primary provider returns a 429 (rate limit) or 5xx (server error), LangShift automatically retries with the next provider in your `fallbackChain`. For example, with the default chain `["openai", "gemini"]`, if Anthropic fails, it tries OpenAI, then Gemini.

</details>

<details>
<summary><b>What compilers are supported for validation?</b></summary>

LangShift can optionally run the actual compiler/interpreter on the converted output:

| Language | Compiler/Tool |
|---|---|
| TypeScript | `tsc --noEmit` |
| Java | `javac` |
| Go | `go build` |
| Rust | `rustc --edition 2021` |
| C++ | `g++` |
| C | `gcc` |
| C# | `dotnet build` |
| Python | `python -m py_compile` |

The compiler must be installed on your system. This is optional validation — conversions still work without it.

</details>

<details>
<summary><b>What is PII scrubbing and when should I enable it?</b></summary>

PII scrubbing uses regex patterns to redact personally identifiable information (emails, IP addresses, phone numbers, SSNs) from your code **before** it's sent to the AI. Enable it when working with code that may contain real user data — especially in healthcare (HIPAA) or European (GDPR) contexts. Redacted values are replaced with placeholders and restored after conversion.

</details>

<details>
<summary><b>Can my whole team share the same settings?</b></summary>

Yes. Create `.vscode/langshift.team.json` in your repo and commit it. All team members will use the same provider, model, conversion rules, and security settings. Individual user settings still override team settings where needed.

</details>

---

## 🤝 Contributing

Contributions are welcome! Here's how to get started:

```bash
# Clone the repo
git clone https://github.com/langshift/langshift-vscode.git
cd langshift-vscode

# Install dependencies
npm install

# Compile
npm run compile

# Launch Extension Development Host
# Press F5 in VS Code — a new window opens with LangShift loaded
```

### Development Commands

```bash
npm run compile    # Compile TypeScript
npm run watch      # Watch mode for development
npm test           # Run test suite
npm run lint       # Lint with ESLint
npm run package    # Package as .vsix for distribution
```

### Guidelines

1. **Fork** the repository and create a feature branch
2. **Write tests** for new functionality
3. **Follow** the existing code style (ESLint enforced)
4. **Update** documentation for user-facing changes
5. **Open a PR** with a clear description of your changes

> 📖 See [CONTRIBUTING.md](./CONTRIBUTING.md) for detailed guidelines.

---

## 📜 License

MIT © [LangShift Contributors](https://github.com/langshift/langshift-vscode/graphs/contributors)

---

<div align="center">

**Built with ❤️ for developers who speak every language.**

[⬆ Back to Top](#-langshift)

</div>
