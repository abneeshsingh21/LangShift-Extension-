import * as vscode from 'vscode';
import { TeamSettings } from '../config/TeamSettings';

export type AIProvider = 'anthropic' | 'openai' | 'gemini' | 'openrouter' | 'ollama' | 'lmstudio';

export interface LangShiftConfig {
  // Provider & model
  aiProvider: AIProvider;
  anthropicModel: string;
  openaiModel: string;
  geminiModel: string;
  openrouterModel: string;
  ollamaModel: string;
  ollamaBaseUrl: string;
  lmstudioModel: string;
  lmstudioBaseUrl: string;

  // Core behavior
  autoConvertOnRename: boolean;
  showConfirmationDialog: boolean;
  showDiffBeforeApply: boolean;
  autoConvertTests: boolean;
  preserveComments: boolean;
  maxFileSizeKB: number;
  conversionTimeout: number;
  rateLimitPerHour: number;
  backupBeforeConvert: boolean;
  batchDelayMs: number;

  // Advanced AI features
  modelRouting: boolean;
  twoPassConversion: boolean;
  confidenceScoring: boolean;
  multiFileContext: boolean;
  maxContextFiles: number;
  maxContextLinesPerFile: number;
  streaming: boolean;

  // Resilience
  fallbackEnabled: boolean;
  fallbackChain: string[];

  // Security & compliance
  piiScrubbing: boolean;
  auditLog: boolean;
  proxyUrl: string;

  // Cache
  enableCache: boolean;

  // Telemetry
  telemetryEnabled: boolean;
}

/** Returns the active model string for the currently selected provider */
export function getActiveModel(config: LangShiftConfig): string {
  return getModelForProvider(config, config.aiProvider);
}

/** Returns the configured model for a specific provider */
export function getModelForProvider(config: LangShiftConfig, provider: AIProvider): string {
  switch (provider) {
    case 'anthropic':   return config.anthropicModel;
    case 'openai':      return config.openaiModel;
    case 'gemini':      return config.geminiModel;
    case 'openrouter':  return config.openrouterModel;
    case 'ollama':      return config.ollamaModel;
    case 'lmstudio':    return config.lmstudioModel;
  }
}

/** Returns the base URL for local providers, empty string for cloud */
export function getBaseUrl(config: LangShiftConfig): string {
  switch (config.aiProvider) {
    case 'ollama':    return config.ollamaBaseUrl;
    case 'lmstudio':  return config.lmstudioBaseUrl;
    default:          return '';
  }
}

export class ConfigManager {
  static getConfig(): LangShiftConfig {
    const cfg = vscode.workspace.getConfiguration('langshift');
    const userConfig: LangShiftConfig = {
      aiProvider:             cfg.get<AIProvider>('aiProvider', 'anthropic'),
      anthropicModel:         cfg.get('anthropicModel', 'claude-sonnet-4-20250514'),
      openaiModel:            cfg.get('openaiModel', 'gpt-4o'),
      geminiModel:            cfg.get('geminiModel', 'gemini-2.0-flash'),
      openrouterModel:        cfg.get('openrouterModel', 'anthropic/claude-sonnet-4-20250514'),
      ollamaModel:            cfg.get('ollamaModel', 'deepseek-coder-v2'),
      ollamaBaseUrl:          cfg.get('ollamaBaseUrl', 'http://localhost:11434/v1'),
      lmstudioModel:          cfg.get('lmstudioModel', 'loaded-model'),
      lmstudioBaseUrl:        cfg.get('lmstudioBaseUrl', 'http://localhost:1234/v1'),

      autoConvertOnRename:    cfg.get('autoConvertOnRename', true),
      showConfirmationDialog: cfg.get('showConfirmationDialog', true),
      showDiffBeforeApply:    cfg.get('showDiffBeforeApply', true),
      autoConvertTests:       cfg.get('autoConvertTests', true),
      preserveComments:       cfg.get('preserveComments', true),
      maxFileSizeKB:          cfg.get('maxFileSizeKB', 500),
      conversionTimeout:      cfg.get('conversionTimeout', 90),
      rateLimitPerHour:       cfg.get('rateLimitPerHour', 50),
      backupBeforeConvert:    cfg.get('backupBeforeConvert', true),
      batchDelayMs:           cfg.get('batchDelayMs', 600),

      modelRouting:           cfg.get('modelRouting', false),
      twoPassConversion:      cfg.get('twoPassConversion', false),
      confidenceScoring:      cfg.get('confidenceScoring', true),
      multiFileContext:       cfg.get('multiFileContext', true),
      maxContextFiles:        cfg.get('maxContextFiles', 5),
      maxContextLinesPerFile: cfg.get('maxContextLinesPerFile', 200),
      streaming:              cfg.get('streaming', true),

      fallbackEnabled:        cfg.get('fallbackEnabled', false),
      fallbackChain:          cfg.get<string[]>('fallbackChain', ['openai', 'gemini']),

      piiScrubbing:           cfg.get('piiScrubbing', false),
      auditLog:               cfg.get('auditLog', false),
      proxyUrl:               cfg.get('proxyUrl', ''),

      enableCache:            cfg.get('enableCache', true),

      telemetryEnabled:       cfg.get('telemetryEnabled', false),
    };
    return TeamSettings.mergeWithConfig(userConfig);
  }

  static async update<K extends keyof LangShiftConfig>(
    key: K,
    value: LangShiftConfig[K]
  ): Promise<void> {
    await vscode.workspace
      .getConfiguration('langshift')
      .update(key, value, vscode.ConfigurationTarget.Global);
  }
}
