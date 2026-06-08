import * as vscode from 'vscode';
import * as crypto from 'crypto';

interface CacheEntry {
  hash: string;
  convertedCode: string;
  timestamp: number;
  model: string;
  provider: string;
  fromLang: string;
  toLang: string;
}

export class ConversionCache {
  private readonly KEY = 'langshift.cache';
  private readonly MAX_ENTRIES = 50;
  private readonly MAX_CODE_SIZE = 50_000; // 50KB max per entry

  constructor(private context: vscode.ExtensionContext) {}

  computeKey(
    sourceCode: string,
    fromLang: string,
    toLang: string,
    provider: string,
    model: string,
    configFingerprint = '',
  ): string {
    return crypto.createHash('sha256')
      .update(`${fromLang}|${toLang}|${provider}|${model}|${configFingerprint}|${sourceCode}`)
      .digest('hex');
  }

  get(hash: string): CacheEntry | null {
    const entries = this.all();
    return entries.find(e => e.hash === hash) ?? null;
  }

  async set(entry: CacheEntry): Promise<void> {
    if (entry.convertedCode.length > this.MAX_CODE_SIZE) return; // Don't cache huge files
    const entries = this.all().filter(e => e.hash !== entry.hash); // Remove existing
    entries.unshift(entry);
    // LRU eviction
    await this.context.globalState.update(this.KEY, entries.slice(0, this.MAX_ENTRIES));
  }

  async invalidate(hash: string): Promise<void> {
    const entries = this.all().filter(e => e.hash !== hash);
    await this.context.globalState.update(this.KEY, entries);
  }

  async clear(): Promise<void> {
    await this.context.globalState.update(this.KEY, []);
  }

  stats(): { entries: number; hits: number } {
    return { entries: this.all().length, hits: this.context.globalState.get<number>('langshift.cacheHits', 0) };
  }

  async recordHit(): Promise<void> {
    const hits = this.context.globalState.get<number>('langshift.cacheHits', 0);
    await this.context.globalState.update('langshift.cacheHits', hits + 1);
  }

  private all(): CacheEntry[] {
    return this.context.globalState.get<CacheEntry[]>(this.KEY, []);
  }
}
