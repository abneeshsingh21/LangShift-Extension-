import { CompilerValidator, CompilerResult } from './CompilerValidator';
import { ProviderFactory } from '../ai/ProviderFactory';
import { ConfigManager, getActiveModel } from '../utils/ConfigManager';
import { SecurityManager } from '../security/SecurityManager';
import { Logger } from '../utils/Logger';

/**
 * AutoFixer — Feed compiler errors back to the AI and ask it to fix them.
 * Implements a fix loop: compile → find errors → ask AI to fix → repeat.
 * Max 3 iterations to prevent infinite loops.
 */
export class AutoFixer {
  private static readonly MAX_FIX_ITERATIONS = 3;

  static async fix(
    code: string,
    language: string,
    security: SecurityManager,
    logger: Logger,
    signal?: AbortSignal,
  ): Promise<AutoFixResult> {
    if (!CompilerValidator.isSupported(language)) {
      return { code, fixed: false, iterations: 0, message: 'No compiler available.' };
    }

    let currentCode = code;
    let totalFixed = 0;

    for (let i = 0; i < this.MAX_FIX_ITERATIONS; i++) {
      // 1. Compile
      const result = await CompilerValidator.validate(currentCode, language);

      // 2. If clean, we're done
      const errors = result.errors.filter(e => e.severity === 'error');
      if (result.success || errors.length === 0) {
        return {
          code: currentCode,
          fixed: totalFixed > 0,
          iterations: i,
          message: totalFixed > 0
            ? `Fixed ${totalFixed} error(s) in ${i} iteration(s).`
            : 'Code compiles cleanly — no fixes needed.',
        };
      }

      // 3. Ask AI to fix
      logger.info(`AutoFix iteration ${i + 1}: ${errors.length} error(s) found.`);

      try {
        currentCode = await this.askAIToFix(currentCode, language, result, security, signal);
        totalFixed += errors.length;
      } catch (e: any) {
        logger.warn(`AutoFix AI call failed: ${e.message}`);
        return {
          code: currentCode,
          fixed: totalFixed > 0,
          iterations: i + 1,
          message: `AI fix failed: ${e.message}`,
        };
      }
    }

    // Hit max iterations — return what we have
    return {
      code: currentCode,
      fixed: totalFixed > 0,
      iterations: this.MAX_FIX_ITERATIONS,
      message: `Reached max fix iterations (${this.MAX_FIX_ITERATIONS}). Some errors may remain.`,
    };
  }

  private static async askAIToFix(
    code: string,
    language: string,
    compilerResult: CompilerResult,
    security: SecurityManager,
    signal?: AbortSignal,
  ): Promise<string> {
    const config = ConfigManager.getConfig();
    const model = getActiveModel(config);
    const apiKey = await security.getApiKey();
    const timeout = config.conversionTimeout * 1000;

    const errorSummary = compilerResult.errors
      .filter(e => e.severity === 'error')
      .slice(0, 15)  // Limit to avoid token overflow
      .map(e => {
        const loc = e.line ? `Line ${e.line}${e.column ? `:${e.column}` : ''}` : 'Unknown location';
        return `${loc}: ${e.message}`;
      })
      .join('\n');

    const systemPrompt = [
      `You are a senior ${language} developer fixing compiler errors.`,
      `The code below was auto-generated and has ${compilerResult.errors.length} compiler error(s).`,
      `Fix ALL errors while preserving the original intent and structure.`,
      `Return ONLY the corrected code — no explanations, no markdown fences, no comments about changes.`,
    ].join('\n');

    const userPrompt = [
      `Compiler: ${compilerResult.compiler}`,
      `Errors:`,
      errorSummary,
      '',
      `Code to fix:`,
      code,
    ].join('\n');

    const provider = ProviderFactory.get(config.aiProvider);
    const abortController = new AbortController();
    if (signal) {
      signal.addEventListener('abort', () => abortController.abort(), { once: true });
    }

    const raw = await provider.generate({
      system: systemPrompt,
      user: userPrompt,
      model,
      apiKey: apiKey ?? '',
      timeout,
      signal: abortController.signal,
    });

    // Strip markdown fences if AI wrapped it
    return raw
      .replace(/^```[\w]*\n?/gm, '')
      .replace(/\n?```$/gm, '')
      .trim();
  }
}

export interface AutoFixResult {
  code: string;
  fixed: boolean;
  iterations: number;
  message: string;
}
