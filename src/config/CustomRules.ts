import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

export interface ConversionRule {
  languages?: string[];   // e.g. ['Python→Java', 'Python→*'] (* = any)
  instruction: string;    // injected into prompt
}

export interface LangShiftRules {
  rules?: ConversionRule[];
  imports?: Record<string, string[]>;   // toLang → forced imports
  naming?: {
    convention?: 'camelCase' | 'snake_case' | 'PascalCase';
  };
  postConversion?: {
    formatCode?: boolean;
    removeUnusedImports?: boolean;
  };
}

export class CustomRules {
  private static readonly RC_FILE = '.langshiftrc.json';

  static load(): LangShiftRules | null {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) return null;

    for (const folder of workspaceFolders) {
      const rcPath = path.join(folder.uri.fsPath, this.RC_FILE);
      if (fs.existsSync(rcPath)) {
        try {
          const raw = fs.readFileSync(rcPath, 'utf8');
          return JSON.parse(raw) as LangShiftRules;
        } catch (e: any) {
          vscode.window.showWarningMessage(`LangShift: Invalid ${this.RC_FILE}: ${e.message}`);
          return null;
        }
      }
    }
    return null;
  }

  static getApplicableRules(fromLang: string, toLang: string): string[] {
    const rules = this.load();
    if (!rules?.rules) return [];

    const pair = `${fromLang}→${toLang}`;
    const fromWild = `${fromLang}→*`;
    const toWild = `*→${toLang}`;
    const allWild = '*→*';

    return rules.rules
      .filter(r => {
        if (!r.languages || r.languages.length === 0) return true; // applies to all
        return r.languages.some(l =>
          l === pair || l === fromWild || l === toWild || l === allWild
        );
      })
      .map(r => r.instruction);
  }

  static getNamingConvention(): string | null {
    return this.load()?.naming?.convention ?? null;
  }

  static getForcedImports(toLang: string): string[] {
    const rules = this.load();
    return rules?.imports?.[toLang] ?? [];
  }
}
