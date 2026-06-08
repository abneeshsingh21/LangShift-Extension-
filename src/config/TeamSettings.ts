import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import type { AIProvider, LangShiftConfig } from '../utils/ConfigManager';

export interface TeamConfig {
  provider?: AIProvider;
  model?: string;
  fallbackChain?: string[];
  modelRouting?: boolean;
  twoPassConversion?: boolean;
  confidenceScoring?: boolean;
  multiFileContext?: boolean;
  piiScrubbing?: boolean;
  auditLog?: boolean;
  customRulesPath?: string;  // path to shared .langshiftrc.json
}

/**
 * Read team-shared settings from .vscode/langshift.team.json.
 * These override workspace defaults but NOT individual user's API keys.
 * API keys are always stored per-user in VS Code's SecretStorage.
 */
export class TeamSettings {
  private static readonly FILE_NAME = 'langshift.team.json';

  static load(): TeamConfig | null {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) return null;

    for (const folder of folders) {
      const filePath = path.join(folder.uri.fsPath, '.vscode', this.FILE_NAME);
      if (fs.existsSync(filePath)) {
        try {
          const raw = fs.readFileSync(filePath, 'utf8');
          const config = JSON.parse(raw) as TeamConfig;
          return this.validate(config);
        } catch (e: any) {
          vscode.window.showWarningMessage(`LangShift: Invalid ${this.FILE_NAME}: ${e.message}`);
          return null;
        }
      }
    }
    return null;
  }

  /**
   * Create a template .vscode/langshift.team.json in the first workspace folder.
   */
  static async createTemplate(): Promise<string | null> {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) return null;

    const vscodeDir = path.join(folders[0].uri.fsPath, '.vscode');
    if (!fs.existsSync(vscodeDir)) fs.mkdirSync(vscodeDir, { recursive: true });

    const filePath = path.join(vscodeDir, this.FILE_NAME);
    if (fs.existsSync(filePath)) {
      vscode.window.showWarningMessage('Team settings file already exists.');
      return filePath;
    }

    const template: TeamConfig = {
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
      modelRouting: false,
      twoPassConversion: false,
      confidenceScoring: true,
      multiFileContext: true,
      piiScrubbing: false,
      auditLog: true,
    };

    fs.writeFileSync(filePath, JSON.stringify(template, null, 2), 'utf8');
    return filePath;
  }

  /**
   * Merge team settings with user settings. Team settings take priority
   * for non-sensitive fields (never overrides API keys).
   */
  static mergeWithConfig(userConfig: LangShiftConfig): LangShiftConfig {
    const team = this.load();
    if (!team) return userConfig;

    const merged = { ...userConfig };
    if (team.provider) merged.aiProvider = team.provider;
    if (team.model && team.provider) {
      // Set the model for the team provider
      switch (team.provider) {
        case 'anthropic':  merged.anthropicModel = team.model; break;
        case 'openai':     merged.openaiModel = team.model; break;
        case 'gemini':     merged.geminiModel = team.model; break;
        case 'openrouter': merged.openrouterModel = team.model; break;
        case 'ollama':     merged.ollamaModel = team.model; break;
        case 'lmstudio':   merged.lmstudioModel = team.model; break;
      }
    }
    if (team.fallbackChain) merged.fallbackChain = team.fallbackChain;
    if (team.modelRouting !== undefined) merged.modelRouting = team.modelRouting;
    if (team.twoPassConversion !== undefined) merged.twoPassConversion = team.twoPassConversion;
    if (team.confidenceScoring !== undefined) merged.confidenceScoring = team.confidenceScoring;
    if (team.multiFileContext !== undefined) merged.multiFileContext = team.multiFileContext;
    if (team.piiScrubbing !== undefined) merged.piiScrubbing = team.piiScrubbing;
    if (team.auditLog !== undefined) merged.auditLog = team.auditLog;

    return merged;
  }

  private static validate(config: TeamConfig): TeamConfig {
    const validProviders = new Set(['anthropic', 'openai', 'gemini', 'openrouter', 'ollama', 'lmstudio']);
    if (config.provider && !validProviders.has(config.provider)) {
      vscode.window.showWarningMessage(`LangShift team: Unknown provider "${config.provider}", ignoring.`);
      delete config.provider;
    }
    return config;
  }
}
