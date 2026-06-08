import * as vscode from 'vscode';

export interface ConversionRecord {
  id:                 string;
  fileName:           string;
  filePath:           string;
  fromLang:           string;
  toLang:             string;
  originalCode:       string | null;
  convertedCode:      string | null;
  linesConverted:     number;
  backupId:           string;
  provider:           string;
  model:              string;
  timestamp:          number;
  validationWarnings: string[];
}

export interface ConversionStats {
  totalConversions:    number;
  totalLinesConverted: number;
  mostCommonPair:      string;
  conversionsByPair:   Record<string, number>;
  byProvider:          Record<string, number>;
}

export class ConversionHistory {
  private readonly KEY   = 'langshift.history';
  private readonly LIMIT = 100;
  private readonly CODE_RETENTION_LIMIT = 15;

  constructor(private context: vscode.ExtensionContext) {}

  async add(data: Omit<ConversionRecord, 'id'>): Promise<ConversionRecord> {
    const record: ConversionRecord = { ...data, id: this.uid() };
    const history = this.getAll();
    history.unshift(record);
    // Cap code storage: only keep full code for the 15 most recent records
    const trimmed = history.slice(0, this.LIMIT).map((r, i) => {
      if (i >= this.CODE_RETENTION_LIMIT) {
        return { ...r, originalCode: null, convertedCode: null };
      }
      return r;
    });
    await this.context.globalState.update(this.KEY, trimmed);
    return record;
  }

  getAll(): ConversionRecord[] {
    return this.context.globalState.get<ConversionRecord[]>(this.KEY, []);
  }

  getById(id: string): ConversionRecord | null {
    return this.getAll().find(r => r.id === id) ?? null;
  }

  getLast(): ConversionRecord | null {
    return this.getAll()[0] ?? null;
  }

  async deleteById(id: string): Promise<void> {
    await this.context.globalState.update(this.KEY, this.getAll().filter(r => r.id !== id));
  }

  async clear(): Promise<void> {
    await this.context.globalState.update(this.KEY, []);
  }

  getStats(): ConversionStats {
    const all = this.getAll();
    const byPair:     Record<string, number> = {};
    const byProvider: Record<string, number> = {};
    let totalLines = 0;

    for (const r of all) {
      const pair = `${r.fromLang} → ${r.toLang}`;
      byPair[pair]         = (byPair[pair]         ?? 0) + 1;
      byProvider[r.provider ?? 'unknown'] = (byProvider[r.provider ?? 'unknown'] ?? 0) + 1;
      totalLines += r.linesConverted;
    }

    const mostCommonPair =
      Object.entries(byPair).sort(([, a], [, b]) => b - a)[0]?.[0] ?? '—';

    return {
      totalConversions:    all.length,
      totalLinesConverted: totalLines,
      mostCommonPair,
      conversionsByPair:   byPair,
      byProvider,
    };
  }

  private uid(): string {
    return `ls_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }
}
