# Changelog

All notable changes to the **LangShift** extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] — 2025-06-07

### 🚀 Highlights
LangShift v2.0 is a complete rewrite of the AI engine with 15 new enterprise features, 6 AI providers, and production-grade architecture.

### Added

#### AI Providers
- **Ollama integration** — convert code offline using local models (DeepSeek-Coder, CodeLlama, Qwen2.5-Coder)
- **LM Studio integration** — same local AI capability with LM Studio
- **Provider fallback chain** — auto-retry with next provider on 429/5xx errors
- **Model routing** — auto-pick optimal model per language pair (15 curated routes)

#### Accuracy
- **Two-pass conversion** — AI reviews and fixes its own output
- **Confidence scoring** — AI rates its output 0–100 with reasoning
- **Few-shot examples** — curated examples for 6 popular language pairs
- **Multi-file context** — reads import tree (10 languages) for better accuracy

#### Enterprise & Security
- **PII scrubbing** — auto-redact emails, IPs, SSNs, API keys before sending to AI (HIPAA/GDPR)
- **Audit logging** — append-only JSONL compliance log with CSV export
- **Team shared settings** — `.vscode/langshift.team.json` for team-wide config
- **Custom conversion rules** — `.langshiftrc.json` with wildcard language matching

#### Validation
- **Compiler validation** — run tsc, javac, go, rustc, gcc, python on converted code
- **Import resolver** — detect missing packages and suggest install commands
- **Diagnostics integration** — show compiler errors as VS Code squiggly underlines

#### UX
- **Smart caching** — SHA-256 hash-based LRU cache, instant repeat conversions
- **Streaming webview** — watch converted code appear in real-time
- **Status bar integration** — live provider status, cache hits, conversion progress
- **16 commands** — up from 7 in v1.0
- **28 configurable settings** — comprehensive control over every feature

### Changed
- Complete rewrite of `ConversionEngine` to pluggable adapter pattern
- `ConfigManager` expanded from 4 to 6 providers with 15+ new settings
- `SecurityManager` updated to support local AI providers
- Dashboard now shows cache statistics
- Sidebar now shows cache hits and local AI status

### Architecture
- New `src/ai/` directory with `AIProviderAdapter` interface
- New `src/config/` directory for custom rules and team settings
- `ProviderFactory` with lazy singleton caching
- 32 source files, 10 test files, 71 unit tests

## [1.0.0] — 2025-01-15

### Added
- Initial release
- Support for Anthropic Claude, OpenAI GPT-4o, Google Gemini, OpenRouter
- Auto-convert on file rename
- Batch folder conversion
- Conversion history with diff viewer
- Dashboard with analytics
- Backup and undo system
- Rate limiting
- 25+ language support
