import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

export interface AuditEntry {
  timestamp: string;
  action: 'conversion' | 'preview' | 'undo' | 'batch_start' | 'batch_end' | 'cache_hit';
  fileName: string;
  fromLang?: string;
  toLang?: string;
  provider?: string;
  model?: string;
  confidence?: number;
  linesConverted?: number;
  success: boolean;
  error?: string;
  duration?: number;
}

export class AuditLog {
  private logPath: string | null = null;

  constructor() {
    this.logPath = this.resolveLogPath();
  }

  async log(entry: AuditEntry): Promise<void> {
    if (!this.logPath) return;

    const dir = path.dirname(this.logPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      // Add .gitignore
      const gi = path.join(dir, '.gitignore');
      if (!fs.existsSync(gi)) fs.writeFileSync(gi, 'audit.jsonl\n');
    }

    const line = JSON.stringify({
      ...entry,
      timestamp: entry.timestamp || new Date().toISOString(),
    }) + '\n';

    try {
      fs.appendFileSync(this.logPath, line, 'utf8');
    } catch {
      // Silently fail — audit log should never block conversion
    }
  }

  getAll(): AuditEntry[] {
    if (!this.logPath || !fs.existsSync(this.logPath)) return [];
    try {
      const content = fs.readFileSync(this.logPath, 'utf8');
      return content
        .split('\n')
        .filter(line => line.trim())
        .map(line => JSON.parse(line) as AuditEntry);
    } catch {
      return [];
    }
  }

  async exportCsv(): Promise<string | null> {
    const entries = this.getAll();
    if (entries.length === 0) return null;

    const headers = ['timestamp', 'action', 'fileName', 'fromLang', 'toLang', 'provider', 'model', 'confidence', 'linesConverted', 'success', 'error', 'duration'];
    const rows = entries.map(e =>
      headers.map(h => {
        const val = (e as any)[h];
        if (val === undefined || val === null) return '';
        return String(val).includes(',') ? `"${val}"` : String(val);
      }).join(',')
    );

    const csv = [headers.join(','), ...rows].join('\n');

    if (!this.logPath) return null;
    const csvPath = this.logPath.replace('.jsonl', '.csv');
    fs.writeFileSync(csvPath, csv, 'utf8');
    return csvPath;
  }

  private resolveLogPath(): string | null {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) return null;
    return path.join(folders[0].uri.fsPath, '.langshift', 'audit.jsonl');
  }
}
