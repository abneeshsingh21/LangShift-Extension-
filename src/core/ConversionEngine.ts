import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { SecurityManager } from '../security/SecurityManager';
import { RateLimiter } from '../security/RateLimiter';
import { ConversionHistory } from './ConversionHistory';
import { BackupManager } from './BackupManager';
import { LanguageDetector } from './LanguageDetector';
import { CodeValidator } from './CodeValidator';
import { ConversionCache } from './ConversionCache';
import { ContextCollector } from './ContextCollector';
import { PIIRedactor, RedactionResult } from './PIIRedactor';
import { FallbackChain } from './FallbackChain';
import { AuditLog } from './AuditLog';
import { AutoFixer } from './AutoFixer';
import { RetryWithBackoff } from './RetryWithBackoff';
import { CompilerValidator } from './CompilerValidator';
import { CustomRules } from '../config/CustomRules';
import { Logger } from '../utils/Logger';
import { AIProvider, ConfigManager, getActiveModel, getModelForProvider } from '../utils/ConfigManager';
import { TelemetryService } from '../utils/TelemetryService';
import { ProviderFactory } from '../ai/ProviderFactory';
import { FewShotExamples } from './FewShotExamples';
import { ModelRouter } from './ModelRouter';
import { ChunkedConverter } from './ChunkedConverter';
import type { AIProviderAdapter, GenerateOptions } from '../ai/AIProvider';

// ─── PUBLIC TYPES ──────────────────────────────────────────────────────────────

export interface ConversionRequest {
  fileUri:      vscode.Uri;
  fromLang:     string;
  toLang:       string;
  sourceCode?:  string;   // pre-loaded content (avoids double read)
  onStreamChunk?: (text: string) => void;
  onStreamDone?:  (success: boolean, confidence?: number) => void;
}

export interface ConversionResult {
  success:          boolean;
  linesConverted?:  number;
  historyId?:       string;
  convertedCode?:   string;
  error?:           string;
  confidence?:      number;         // 0–100
  confidenceNote?:  string;         // AI's reasoning
  cacheHit?:        boolean;
  providerUsed?:    string;         // actual provider used (may differ if fallback)
  modelUsed?:       string;         // actual model used (may differ if routing/fallback)
  fallbackUsed?:    boolean;
  piiRedacted?:     number;         // count of PII items redacted
}

interface ProviderRoute {
  provider: AIProvider;
  model: string;
  routed: boolean;
  reason?: string;
}

interface StreamCallbacks {
  onChunk?: (text: string) => void;
  onDone?:  (success: boolean, confidence?: number) => void;
}

// ─── ENGINE ────────────────────────────────────────────────────────────────────

export class ConversionEngine {
  private activeController: AbortController | null = null;

  constructor(
    private security:  SecurityManager,
    private limiter:   RateLimiter,
    private history:   ConversionHistory,
    private backup:    BackupManager,
    private logger:    Logger,
    private telemetry: TelemetryService,
    private cache:     ConversionCache,
    private audit:     AuditLog,
  ) {}

  cancelActive(): void {
    this.activeController?.abort();
    this.activeController = null;
  }

  // ─── PUBLIC: full pipeline (writes to disk) ────────────────────────────────
  async convert(req: ConversionRequest): Promise<ConversionResult> {
    const start = Date.now();
    const { fileUri, fromLang, toLang } = req;
    const config = ConfigManager.getConfig();

    // 1. Gate: API key present?
    const hasKey = await this.security.hasApiKey();
    if (!hasKey) {
      const ok = await this.security.promptAndStoreApiKey();
      if (!ok) return fail('No API key configured.');
    }

    // 2. Gate: rate limit
    if (!this.limiter.canConvert()) {
      return fail(`Rate limit reached (${config.rateLimitPerHour}/hr). Resets in ${this.limiter.resetInMinutes()} min.`);
    }

    // 3. Read file
    let sourceCode = req.sourceCode ?? '';
    if (!sourceCode) {
      try {
        sourceCode = fs.readFileSync(fileUri.fsPath, 'utf8');
      } catch (e: any) {
        return fail(`Cannot read file: ${e.message}`);
      }
    }
    if (!sourceCode.trim()) return fail('File is empty.');

    // 4. Size guard
    const sizeKB = Buffer.byteLength(sourceCode, 'utf8') / 1024;
    if (sizeKB > config.maxFileSizeKB) {
      return fail(`File is ${sizeKB.toFixed(0)} KB — exceeds limit of ${config.maxFileSizeKB} KB.`);
    }

    // 5. Secret scan
    const secrets = SecurityManager.scanForSecrets(sourceCode);
    if (secrets.length > 0) {
      this.logger.warn(`Security advisory: ${secrets.join('; ')}`);
      const proceed = await vscode.window.showWarningMessage(
        `⚠️ LangShift found potential secrets in ${path.basename(fileUri.fsPath)}:\n${secrets.join('\n')}\n\nCode will be sent to your AI provider. Continue?`,
        { modal: true },
        'Send Anyway',
        'Cancel'
      );
      if (proceed !== 'Send Anyway') return fail('Cancelled by user (secret detected).');
    }

    // 6. Backup
    let backupId: string | undefined;
    if (config.backupBeforeConvert) {
      backupId = await this.backup.create(fileUri, sourceCode);
    }

    // 7. Cache check
    const primaryRoute = await this.resolvePrimaryRoute(config, fromLang, toLang);
    const model = primaryRoute.model;
    const cacheFingerprint = this.cacheFingerprint(config, primaryRoute);
    if (config.enableCache) {
      const cacheKey = this.cache.computeKey(sourceCode, fromLang, toLang, primaryRoute.provider, model, cacheFingerprint);
      const cached = this.cache.get(cacheKey);
      if (cached) {
        await this.cache.recordHit();
        this.logger.info(`Cache hit for ${fromLang} → ${toLang}: ${fileUri.fsPath}`);
        const convertedCode = cached.convertedCode;
        // Write cached result
        const outPath = this.outputPath(fileUri, toLang);
        try {
          this.atomicWrite(outPath, convertedCode);
        } catch (e: any) {
          return fail(`Could not write converted file: ${e.message}`);
        }
        const linesConverted = convertedCode.split('\n').length;
        const record = await this.history.add({
          fileName: path.basename(fileUri.fsPath), filePath: fileUri.fsPath,
          fromLang, toLang, originalCode: sourceCode, convertedCode, linesConverted,
          backupId: backupId ?? '', provider: cached.provider, model: cached.model, timestamp: Date.now(), validationWarnings: [],
        });
        await this.limiter.recordConversion();
        if (config.auditLog) {
          await this.audit.log({
            timestamp: new Date().toISOString(), action: 'cache_hit',
            fileName: path.basename(fileUri.fsPath), fromLang, toLang,
            provider: cached.provider, model: cached.model, linesConverted, success: true,
            duration: Date.now() - start,
          });
        }
        return { success: true, linesConverted, historyId: record.id, convertedCode, cacheHit: true, providerUsed: cached.provider, modelUsed: cached.model };
      }
    }

    // 8. AI conversion
    this.logger.info(`Converting: ${fromLang} → ${toLang} [${model}]: ${fileUri.fsPath}`);
    let aiResult: AICallResult;
    try {
      this.activeController = new AbortController();
      aiResult = await this.callAIPipeline(
        sourceCode,
        fromLang,
        toLang,
        fileUri,
        this.activeController.signal,
        {
          onChunk: req.onStreamChunk,
          onDone: req.onStreamDone,
        },
      );
      this.activeController = null;
    } catch (e: any) {
      req.onStreamDone?.(false);
      if (e.name === 'AbortError') return fail('Conversion cancelled.');
      this.logger.error(`AI error: ${e.message}`);
      return fail(this.friendlyError(e));
    }

    // 9. Validate
    let convertedCode = aiResult.convertedCode;
    const validation = CodeValidator.validate(convertedCode, toLang);
    if (!validation.isValid) {
      // Attempt auto-fix if compiler validation is available
      if (CompilerValidator.isSupported(toLang)) {
        this.logger.info('Validation failed — attempting auto-fix via compiler...');
        try {
          const fixResult = await AutoFixer.fix(
            convertedCode, toLang, this.security, this.logger,
            undefined,
          );
          if (fixResult.fixed) {
            convertedCode = fixResult.code;
            this.logger.info(`Auto-fix: ${fixResult.message}`);
          }
        } catch (e: any) {
          this.logger.warn(`Auto-fix failed: ${e.message}`);
        }
      }
      // Re-validate after auto-fix attempt
      const revalidation = CodeValidator.validate(convertedCode, toLang);
      if (!revalidation.isValid) {
        return fail(`Converted code failed validation: ${revalidation.errors.join('; ')}`);
      }
    }
    if (validation.warnings.length > 0) {
      this.logger.warn(`Validation warnings: ${validation.warnings.join('; ')}`);
    }

    // 10. Write to disk (atomic)
    const outPath = this.outputPath(fileUri, toLang);
    try {
      this.atomicWrite(outPath, convertedCode);
    } catch (e: any) {
      return fail(`Could not write converted file: ${e.message}`);
    }

    // 11. Record & cache
    const linesConverted = convertedCode.split('\n').length;
    const record = await this.history.add({
      fileName: path.basename(fileUri.fsPath), filePath: fileUri.fsPath,
      fromLang, toLang, originalCode: sourceCode, convertedCode, linesConverted,
      backupId: backupId ?? '', provider: aiResult.providerUsed, model: aiResult.modelUsed, timestamp: Date.now(),
      validationWarnings: validation.warnings,
    });

    await this.limiter.recordConversion();
    this.telemetry.track('conversion_success', { fromLang, toLang, linesConverted, provider: aiResult.providerUsed, model: aiResult.modelUsed });

    // Store in cache
    if (config.enableCache) {
      const cacheKey = this.cache.computeKey(sourceCode, fromLang, toLang, primaryRoute.provider, model, cacheFingerprint);
      await this.cache.set({
        hash: cacheKey, convertedCode, timestamp: Date.now(),
        model: aiResult.modelUsed, provider: aiResult.providerUsed, fromLang, toLang,
      });
    }

    // Audit log
    if (config.auditLog) {
      await this.audit.log({
        timestamp: new Date().toISOString(), action: 'conversion',
        fileName: path.basename(fileUri.fsPath), fromLang, toLang,
        provider: aiResult.providerUsed, model: aiResult.modelUsed, confidence: aiResult.confidence,
        linesConverted, success: true, duration: Date.now() - start,
      });
    }

    // 12. Auto-convert test file (non-blocking)
    if (config.autoConvertTests) {
      this.convertTestFile(fileUri, fromLang, toLang).catch((e) =>
        this.logger.warn(`Test file conversion failed: ${e.message}`)
      );
    }

    return {
      success: true, linesConverted, historyId: record.id, convertedCode,
      confidence: aiResult.confidence, confidenceNote: aiResult.confidenceNote,
      cacheHit: false, providerUsed: aiResult.providerUsed, modelUsed: aiResult.modelUsed, fallbackUsed: aiResult.fallbackUsed,
      piiRedacted: aiResult.piiRedacted,
    };
  }

  // ─── PUBLIC: preview (no disk write) ───────────────────────────────────────
  async preview(req: ConversionRequest): Promise<ConversionResult> {
    const start = Date.now();
    const { fileUri, fromLang, toLang } = req;
    const config = ConfigManager.getConfig();

    const hasKey = await this.security.hasApiKey();
    if (!hasKey) {
      const ok = await this.security.promptAndStoreApiKey();
      if (!ok) return fail('No API key configured.');
    }

    if (!this.limiter.canConvert()) {
      return fail(`Rate limit reached (${config.rateLimitPerHour}/hr). Resets in ${this.limiter.resetInMinutes()} min.`);
    }

    let sourceCode = req.sourceCode ?? '';
    if (!sourceCode) {
      try {
        sourceCode = fs.readFileSync(fileUri.fsPath, 'utf8');
      } catch (e: any) {
        return fail(`Cannot read file: ${e.message}`);
      }
    }
    if (!sourceCode.trim()) return fail('File is empty.');

    const sizeKB = Buffer.byteLength(sourceCode, 'utf8') / 1024;
    if (sizeKB > config.maxFileSizeKB) {
      return fail(`File is ${sizeKB.toFixed(0)} KB — exceeds limit of ${config.maxFileSizeKB} KB.`);
    }

    const secrets = SecurityManager.scanForSecrets(sourceCode);
    if (secrets.length > 0) {
      this.logger.warn(`Security advisory: ${secrets.join('; ')}`);
      const proceed = await vscode.window.showWarningMessage(
        `⚠️ LangShift found potential secrets in ${path.basename(fileUri.fsPath)}:\n${secrets.join('\n')}\n\nCode will be sent to your AI provider. Continue?`,
        { modal: true },
        'Send Anyway',
        'Cancel'
      );
      if (proceed !== 'Send Anyway') return fail('Cancelled by user (secret detected).');
    }

    // Cache check for preview too
    const primaryRoute = await this.resolvePrimaryRoute(config, fromLang, toLang);
    const model = primaryRoute.model;
    const cacheFingerprint = this.cacheFingerprint(config, primaryRoute);
    if (config.enableCache) {
      const cacheKey = this.cache.computeKey(sourceCode, fromLang, toLang, primaryRoute.provider, model, cacheFingerprint);
      const cached = this.cache.get(cacheKey);
      if (cached) {
        await this.cache.recordHit();
        return {
          success: true, linesConverted: cached.convertedCode.split('\n').length,
          convertedCode: cached.convertedCode, cacheHit: true, providerUsed: cached.provider, modelUsed: cached.model,
        };
      }
    }

    this.logger.info(`Preview: ${fromLang} → ${toLang} [${model}]: ${fileUri.fsPath}`);
    let aiResult: AICallResult;
    try {
      this.activeController = new AbortController();
      aiResult = await this.callAIPipeline(sourceCode, fromLang, toLang, fileUri, this.activeController.signal);
      this.activeController = null;
    } catch (e: any) {
      if (e.name === 'AbortError') return fail('Conversion cancelled.');
      this.logger.error(`AI error: ${e.message}`);
      return fail(this.friendlyError(e));
    }

    const validation = CodeValidator.validate(aiResult.convertedCode, toLang);
    if (!validation.isValid) {
      return fail(`Converted code failed validation: ${validation.errors.join('; ')}`);
    }
    if (validation.warnings.length > 0) {
      this.logger.warn(`Validation warnings: ${validation.warnings.join('; ')}`);
    }

    // Cache the preview result
    if (config.enableCache) {
      const cacheKey = this.cache.computeKey(sourceCode, fromLang, toLang, primaryRoute.provider, model, cacheFingerprint);
      await this.cache.set({
        hash: cacheKey, convertedCode: aiResult.convertedCode, timestamp: Date.now(),
        model: aiResult.modelUsed, provider: aiResult.providerUsed, fromLang, toLang,
      });
    }

    // Audit
    if (config.auditLog) {
      await this.audit.log({
        timestamp: new Date().toISOString(), action: 'preview',
        fileName: path.basename(fileUri.fsPath), fromLang, toLang,
        provider: aiResult.providerUsed, model: aiResult.modelUsed, confidence: aiResult.confidence,
        linesConverted: aiResult.convertedCode.split('\n').length,
        success: true, duration: Date.now() - start,
      });
    }

    return {
      success: true, linesConverted: aiResult.convertedCode.split('\n').length,
      convertedCode: aiResult.convertedCode,
      confidence: aiResult.confidence, confidenceNote: aiResult.confidenceNote,
      cacheHit: false, providerUsed: aiResult.providerUsed, modelUsed: aiResult.modelUsed, fallbackUsed: aiResult.fallbackUsed,
      piiRedacted: aiResult.piiRedacted,
    };
  }

  // ─── AI PIPELINE (shared by convert + preview) ─────────────────────────────
  private async callAIPipeline(
    sourceCode: string,
    fromLang: string,
    toLang: string,
    fileUri: vscode.Uri,
    signal: AbortSignal,
    streamCallbacks: StreamCallbacks = {},
    allowChunking = true,
  ): Promise<AICallResult> {
    const config = ConfigManager.getConfig();

    if (allowChunking && ChunkedConverter.shouldChunk(sourceCode)) {
      const chunks = ChunkedConverter.split(sourceCode, fromLang);
      this.logger.info(`Chunking large ${fromLang} file into ${chunks.length} conversion request(s).`);

      const convertedChunks: string[] = [];
      const confidenceScores: number[] = [];
      let confidenceNote: string | undefined;
      let providerUsed = config.aiProvider;
      let modelUsed = getActiveModel(config);
      let fallbackUsed = false;
      let piiRedacted = 0;

      for (let i = 0; i < chunks.length; i++) {
        if (signal.aborted) throw new DOMException('The operation was aborted', 'AbortError');
        this.logger.info(`Converting chunk ${i + 1}/${chunks.length}...`);
        const chunkResult = await this.callAIPipeline(
          chunks[i],
          fromLang,
          toLang,
          fileUri,
          signal,
          {},
          false,
        );
        convertedChunks.push(chunkResult.convertedCode);
        providerUsed = chunkResult.providerUsed;
        modelUsed = chunkResult.modelUsed;
        fallbackUsed = fallbackUsed || chunkResult.fallbackUsed;
        piiRedacted += chunkResult.piiRedacted;
        if (chunkResult.confidence !== undefined) confidenceScores.push(chunkResult.confidence);
        confidenceNote = confidenceNote ?? chunkResult.confidenceNote;
      }

      const convertedCode = ChunkedConverter.reassemble(convertedChunks, toLang);
      const confidence = confidenceScores.length > 0
        ? Math.round(confidenceScores.reduce((sum, score) => sum + score, 0) / confidenceScores.length)
        : undefined;
      streamCallbacks.onChunk?.(convertedCode);
      streamCallbacks.onDone?.(true, confidence);
      return {
        convertedCode,
        providerUsed,
        modelUsed,
        fallbackUsed,
        confidence,
        confidenceNote,
        piiRedacted,
      };
    }

    const primaryRoute = await this.resolvePrimaryRoute(config, fromLang, toLang);
    const apiKey = await this.security.getApiKey(primaryRoute.provider);
    if (!apiKey && !SecurityManager.isLocal(primaryRoute.provider)) {
      throw new Error(`API key not found for ${primaryRoute.provider}.`);
    }

    const providerModels = new Map<AIProvider, string>([[primaryRoute.provider, primaryRoute.model]]);
    const timeout = config.conversionTimeout * 1000;

    // PII scrubbing
    let redaction: RedactionResult | null = null;
    let codeToSend = sourceCode;
    if (config.piiScrubbing) {
      redaction = PIIRedactor.redact(sourceCode);
      codeToSend = redaction.redactedCode;
      if (redaction.redactionCount > 0) {
        this.logger.info(`PII scrubbing: redacted ${redaction.redactionCount} items`);
      }
    }

    // Build prompt with multi-file context + custom rules
    const system = this.systemPrompt(config);
    const user = await this.userPrompt(codeToSend, fromLang, toLang, fileUri, config);

    const makeGenerateOpts = (providerApiKey: string, providerName: AIProvider): GenerateOptions => ({
      system,
      user,
      model: providerModels.get(providerName) ?? getModelForProvider(config, providerName),
      apiKey: providerApiKey,
      timeout,
      signal,
      maxTokens: 8192,
    });

    // Execute with or without fallback chain
    let rawOutput: string;
    let providerUsed: AIProvider = primaryRoute.provider;
    let modelUsed = primaryRoute.model;
    let fallbackUsed = false;

    if (config.fallbackEnabled && config.fallbackChain.length > 0) {
      const primary = {
        name: primaryRoute.provider,
        fn: async () => {
          const provider = ProviderFactory.get(primaryRoute.provider);
          return provider.generate(makeGenerateOpts(apiKey ?? '', primaryRoute.provider));
        },
      };

      const fallbacks = [];
      for (const fbName of config.fallbackChain) {
        if (!this.isProviderName(fbName)) {
          this.logger.warn(`Ignoring unknown fallback provider: ${fbName}`);
          continue;
        }
        if (fbName === primaryRoute.provider) continue; // skip primary
        providerModels.set(fbName, getModelForProvider(config, fbName));
        fallbacks.push({
          name: fbName,
          fn: async () => {
            const fbKey = await this.security.getApiKey(fbName);
            if (!fbKey && !ProviderFactory.isLocal(fbName)) {
              throw Object.assign(new Error(`No API key for ${fbName}`), { status: 401 });
            }
            const provider = ProviderFactory.get(fbName);
            return provider.generate(makeGenerateOpts(fbKey ?? '', fbName));
          },
        });
      }

      const result = await FallbackChain.execute(primary, fallbacks, this.logger);
      rawOutput = result.result;
      providerUsed = result.provider as AIProvider;
      modelUsed = providerModels.get(providerUsed) ?? getModelForProvider(config, providerUsed);
      fallbackUsed = result.fallbackUsed;

      if (fallbackUsed) {
        vscode.window.showWarningMessage(`⚠️ LangShift: ${primaryRoute.provider} failed — succeeded with ${providerUsed}`);
      }
    } else {
      // Direct call with exponential backoff retry
      const provider = ProviderFactory.get(primaryRoute.provider);
      const opts = makeGenerateOpts(apiKey ?? '', primaryRoute.provider);
      if (config.streaming && streamCallbacks.onChunk && provider.supportsStreaming) {
        rawOutput = await this.generateStreaming(provider, opts, streamCallbacks.onChunk);
      } else {
        rawOutput = await RetryWithBackoff.execute(
          () => provider.generate(opts),
          {
            maxAttempts: 3,
            baseDelayMs: 1000,
            signal,
            onRetry: (attempt, error, delay) => {
              this.logger.warn(`Retry ${attempt}: ${error.message} — waiting ${(delay / 1000).toFixed(1)}s`);
            },
          },
        );
      }
    }

    let convertedCode = this.stripMarkdown(rawOutput);

    // Two-pass review
    if (config.twoPassConversion) {
      this.logger.info('Running two-pass review...');
      convertedCode = await this.reviewPass(convertedCode, fromLang, toLang, signal, providerUsed, modelUsed);
    }

    // Parse confidence score
    let confidence: number | undefined;
    let confidenceNote: string | undefined;
    if (config.confidenceScoring) {
      const parsed = this.parseConfidence(convertedCode);
      convertedCode = parsed.code;
      confidence = parsed.confidence;
      confidenceNote = parsed.note;
    }

    // Restore PII
    if (redaction && redaction.redactionCount > 0) {
      convertedCode = PIIRedactor.restore(convertedCode, redaction.redactions);
    }

    streamCallbacks.onDone?.(true, confidence);

    return {
      convertedCode, providerUsed, modelUsed, fallbackUsed,
      confidence, confidenceNote,
      piiRedacted: redaction?.redactionCount ?? 0,
    };
  }

  // ─── TWO-PASS REVIEW ──────────────────────────────────────────────────────

  private async reviewPass(
    code: string,
    fromLang: string,
    toLang: string,
    signal: AbortSignal,
    providerName: AIProvider,
    model: string,
  ): Promise<string> {
    const config = ConfigManager.getConfig();
    const apiKey = await this.security.getApiKey(providerName);
    const timeout = config.conversionTimeout * 1000;

    const reviewSystem = [
      `You are a senior ${toLang} developer reviewing converted code.`,
      `This code was auto-converted from ${fromLang} to ${toLang}.`,
      'Review it for: bugs, missing imports, incorrect API mappings, non-idiomatic patterns, and type errors.',
      'Fix any issues you find. Return ONLY the corrected code — no explanations, no markdown.',
    ].join('\n');

    const reviewUser = [
      `Review and fix this ${toLang} code (converted from ${fromLang}):`,
      '',
      code,
    ].join('\n');

    const provider = ProviderFactory.get(providerName);
    const raw = await provider.generate({
      system: reviewSystem, user: reviewUser,
      model, apiKey: apiKey ?? '', timeout, signal,
    });

    return this.stripMarkdown(raw);
  }

  // ─── PROMPTS ──────────────────────────────────────────────────────────────

  private systemPrompt(config: ReturnType<typeof ConfigManager.getConfig>): string {
    const lines = [
      'You are an expert code transpiler. Convert source code between programming languages with these rules:',
      '1. Preserve ALL logic, algorithms, and program behavior exactly — zero functional changes.',
      '2. Use idiomatic patterns of the TARGET language, not a literal word-for-word translation.',
      '3. Convert comments and docstrings to the target language documentation style.',
      '4. Map standard library calls to their correct target-language equivalents.',
      '5. Handle language-specific features properly (e.g. Python list comprehensions → Java streams, etc.).',
      '6. Add all necessary imports, package declarations, class wrappers, and type annotations.',
      '7. Maintain proper error-handling idioms for the target language.',
      '',
      'CRITICAL OUTPUT RULES:',
      '- Return ONLY the raw converted code. No explanations. No markdown. No triple backticks.',
      '- The code must compile/run as-is in the target language.',
      '- If something has no direct equivalent, use the closest idiomatic alternative and note it in a comment.',
    ];

    if (config.confidenceScoring) {
      lines.push('');
      lines.push('CONFIDENCE SCORING:');
      lines.push('After the converted code, on a NEW LINE, output exactly:');
      lines.push('// CONFIDENCE: <score>/100 | <one-line reasoning>');
      lines.push('Score 90+ for straightforward conversions, 70-89 for moderate complexity, below 70 for uncertain sections.');
    }

    return lines.join('\n');
  }

  private async userPrompt(
    code: string, fromLang: string, toLang: string,
    fileUri: vscode.Uri,
    config: ReturnType<typeof ConfigManager.getConfig>,
  ): Promise<string> {
    const lines: string[] = [];

    // Multi-file context
    if (config.multiFileContext) {
      try {
        const contextFiles = await ContextCollector.collect(
          fileUri,
          fromLang,
          config.maxContextFiles,
          config.maxContextLinesPerFile,
        );
        if (contextFiles.length > 0) {
          lines.push('// CONTEXT FILES (imported by the source — convert references accordingly):');
          for (const cf of contextFiles) {
            lines.push(`// ── ${cf.relativePath} ──`);
            lines.push(cf.content);
            lines.push('');
          }
          lines.push('');
        }
      } catch (e: any) {
        this.logger.debug(`Context collection skipped: ${e.message}`);
      }
    }

    // Few-shot examples (dramatically improve accuracy for known pairs)
    const fewShotPrompt = FewShotExamples.formatForPrompt(fromLang, toLang);
    if (fewShotPrompt) {
      lines.push(fewShotPrompt);
    }

    // Custom rules
    const customRules = CustomRules.getApplicableRules(fromLang, toLang);
    if (customRules.length > 0) {
      lines.push('// CUSTOM CONVERSION RULES (from .langshiftrc.json):');
      for (const rule of customRules) {
        lines.push(`// - ${rule}`);
      }
      lines.push('');
    }

    // Naming convention
    const naming = CustomRules.getNamingConvention();
    if (naming) {
      lines.push(`// Use ${naming} naming convention throughout.`);
      lines.push('');
    }

    // Forced imports
    const forcedImports = CustomRules.getForcedImports(toLang);
    if (forcedImports.length > 0) {
      lines.push('// REQUIRED IMPORTS (must include these):');
      for (const imp of forcedImports) {
        lines.push(`// - ${imp}`);
      }
      lines.push('');
    }

    const commentNote = config.preserveComments
      ? 'Preserve and convert all comments and documentation blocks.'
      : 'Comments may be omitted.';

    lines.push(`Convert the following ${fromLang} code to ${toLang}.`);
    lines.push(commentNote);
    lines.push('Output ONLY the converted code — no preamble, no markdown fences.');
    lines.push('');
    lines.push(`// SOURCE: ${fromLang}`);
    lines.push(code);

    return lines.join('\n');
  }

  // ─── CONFIDENCE PARSING ───────────────────────────────────────────────────

  private parseConfidence(code: string): { code: string; confidence?: number; note?: string } {
    // Look for: // CONFIDENCE: 85/100 | Straightforward conversion
    const match = code.match(/\/\/\s*CONFIDENCE:\s*(\d{1,3})\/100\s*\|\s*(.+?)$/m);
    if (!match) return { code };

    const confidence = Math.min(100, Math.max(0, parseInt(match[1], 10)));
    const note = match[2].trim();
    // Remove the confidence line from the code
    const cleanCode = code.replace(/\/\/\s*CONFIDENCE:\s*\d{1,3}\/100\s*\|.+?\n?$/m, '').trimEnd();
    return { code: cleanCode, confidence, note };
  }

  // ─── HELPERS ──────────────────────────────────────────────────────────────

  private stripMarkdown(text: string): string {
    const fenced = text.match(/^```[\w+-]*\r?\n([\s\S]*?)```\s*$/);
    if (fenced) return fenced[1].trim();

    const blocks = [...text.matchAll(/```[\w+-]*\r?\n([\s\S]*?)```/gm)];
    if (blocks.length > 0) {
      return blocks.map(block => block[1].trim()).join('\n\n').trim();
    }

    return text.trim();
  }

  private async generateStreaming(
    provider: AIProviderAdapter,
    opts: GenerateOptions,
    onChunk: (text: string) => void,
  ): Promise<string> {
    let raw = '';
    for await (const chunk of provider.generateStream(opts)) {
      if (chunk.done) break;
      raw += chunk.text;
      onChunk(chunk.text);
    }
    return raw;
  }

  private async resolvePrimaryRoute(
    config: ReturnType<typeof ConfigManager.getConfig>,
    fromLang: string,
    toLang: string,
  ): Promise<ProviderRoute> {
    const fallback: ProviderRoute = {
      provider: config.aiProvider,
      model: getActiveModel(config),
      routed: false,
    };

    if (!config.modelRouting) return fallback;

    const route = ModelRouter.getRoute(fromLang, toLang);
    if (!route) return fallback;

    const providerAvailable = await this.security.hasApiKey(route.provider);
    if (!providerAvailable) {
      this.logger.warn(`Model routing skipped for ${fromLang} → ${toLang}: ${route.provider} is not configured.`);
      return fallback;
    }

    this.logger.info(`Model routing: ${fromLang} → ${toLang} via ${route.provider}/${route.model} (${route.reason})`);
    return {
      provider: route.provider,
      model: route.model,
      routed: true,
      reason: route.reason,
    };
  }

  private cacheFingerprint(
    config: ReturnType<typeof ConfigManager.getConfig>,
    route: ProviderRoute,
  ): string {
    let customRules: unknown = null;
    try {
      customRules = CustomRules.load();
    } catch {
      customRules = null;
    }

    return JSON.stringify({
      provider: route.provider,
      model: route.model,
      routed: route.routed,
      preserveComments: config.preserveComments,
      confidenceScoring: config.confidenceScoring,
      twoPassConversion: config.twoPassConversion,
      multiFileContext: config.multiFileContext,
      maxContextFiles: config.maxContextFiles,
      maxContextLinesPerFile: config.maxContextLinesPerFile,
      fallbackEnabled: config.fallbackEnabled,
      fallbackChain: config.fallbackChain,
      models: {
        anthropic: config.anthropicModel,
        openai: config.openaiModel,
        gemini: config.geminiModel,
        openrouter: config.openrouterModel,
        ollama: config.ollamaModel,
        lmstudio: config.lmstudioModel,
      },
      customRules,
    });
  }

  private isProviderName(name: string): name is AIProvider {
    return (ProviderFactory.allNames() as string[]).includes(name);
  }

  private friendlyError(e: any): string {
    const msg: string = e?.message ?? String(e);
    const status = e?.status ?? e?.response?.status ?? 0;
    if (status === 401 || msg.includes('401') || msg.includes('auth') || msg.includes('Unauthorized'))
      return 'API key rejected — check your key in LangShift settings.';
    if (status === 403 || msg.includes('403') || msg.includes('forbidden'))
      return 'Access forbidden — your API key may lack required permissions.';
    if (status === 429 || msg.includes('429') || msg.includes('rate'))
      return 'Provider rate limit hit — try again in a moment.';
    if (status === 402 || msg.includes('quota') || msg.includes('billing') || msg.includes('insufficient'))
      return 'API quota exceeded — check your provider billing.';
    if (status >= 500 || msg.includes('500') || msg.includes('502') || msg.includes('503'))
      return 'AI provider server error — try again shortly.';
    if (msg.includes('timeout') || msg.includes('timed out'))
      return `Request timed out. Increase "conversionTimeout" in settings.`;
    if (msg.includes('context') || msg.includes('too long') || msg.includes('max_tokens'))
      return 'File is too large for this model\'s context window. Try a shorter file or larger model.';
    if (msg.includes('ENOTFOUND') || msg.includes('ECONNREFUSED') || msg.includes('network'))
      return 'Network error — check your internet connection.';
    if (msg.includes('ECONNREFUSED') && msg.includes('localhost'))
      return 'Local AI server not running. Start Ollama/LM Studio and try again.';
    return `AI provider error: ${msg}`;
  }

  private outputPath(fileUri: vscode.Uri, toLang: string): string {
    const dir  = path.dirname(fileUri.fsPath);
    const base = path.basename(fileUri.fsPath, path.extname(fileUri.fsPath));
    const ext  = LanguageDetector.getExtension(toLang) ?? '.txt';
    return path.join(dir, base + ext);
  }

  private atomicWrite(filePath: string, content: string): void {
    const tmp = filePath + '.langshift-tmp';
    fs.writeFileSync(tmp, content, 'utf8');
    fs.renameSync(tmp, filePath);
  }

  // ─── ASSOCIATED TEST FILE CONVERSION ─────────────────────────────────────
  private async convertTestFile(
    fileUri: vscode.Uri,
    fromLang: string,
    toLang: string
  ): Promise<void> {
    const dir      = path.dirname(fileUri.fsPath);
    const base     = path.basename(fileUri.fsPath, path.extname(fileUri.fsPath));
    const fromExt  = LanguageDetector.getExtension(fromLang)?.slice(1);
    const toExt    = LanguageDetector.getExtension(toLang)?.slice(1);
    if (!fromExt || !toExt) return;

    const patterns = [
      `test_${base}.${fromExt}`,
      `${base}_test.${fromExt}`,
      `${base}Test.${fromExt}`,
      `${base}.test.${fromExt}`,
      `${base}.spec.${fromExt}`,
    ];

    for (const pat of patterns) {
      const testPath = path.join(dir, pat);
      if (!fs.existsSync(testPath)) continue;

      this.logger.info(`Auto-converting test file: ${pat}`);
      const result = await this.convert({ fileUri: vscode.Uri.file(testPath), fromLang, toLang });

      if (result.success) {
        const convertedTestPath = path.join(dir, pat.replace(`.${fromExt}`, `.${toExt}`));
        vscode.window.showInformationMessage(
          `🧪 LangShift: Converted test file → ${path.basename(convertedTestPath)}`
        );
      }
      break; // only first match
    }
  }
}

// ─── INTERNAL TYPES ──────────────────────────────────────────────────────────

interface AICallResult {
  convertedCode:   string;
  providerUsed:    AIProvider;
  modelUsed:       string;
  fallbackUsed:    boolean;
  confidence?:     number;
  confidenceNote?: string;
  piiRedacted:     number;
}

function fail(error: string): ConversionResult {
  return { success: false, error };
}
