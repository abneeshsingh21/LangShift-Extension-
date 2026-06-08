import * as vscode from 'vscode';
import { ConfigManager } from '../utils/ConfigManager';

const KEY = 'langshift.rateLimitState';

export class RateLimiter {
  constructor(private context: vscode.ExtensionContext) {}

  canConvert(): boolean {
    return this.recentCount() < ConfigManager.getConfig().rateLimitPerHour;
  }

  async recordConversion(): Promise<void> {
    const timestamps = this.recent();
    timestamps.push(Date.now());
    await this.context.globalState.update(KEY, timestamps);
  }

  resetInMinutes(): number {
    const timestamps = this.recent();
    if (timestamps.length === 0) return 0;
    const oldest    = Math.min(...timestamps);
    const resetAt   = oldest + 60 * 60 * 1000;
    return Math.max(0, Math.ceil((resetAt - Date.now()) / 60_000));
  }

  currentUsage(): { used: number; limit: number; resetInMinutes: number } {
    return {
      used:           this.recentCount(),
      limit:          ConfigManager.getConfig().rateLimitPerHour,
      resetInMinutes: this.resetInMinutes(),
    };
  }

  async reset(): Promise<void> {
    await this.context.globalState.update(KEY, []);
  }

  private recent(): number[] {
    const cutoff = Date.now() - 60 * 60 * 1000;
    const all    = this.context.globalState.get<number[]>(KEY, []);
    const fresh  = all.filter(t => t > cutoff);
    // Persist trimmed list
    if (fresh.length !== all.length) {
      void this.context.globalState.update(KEY, fresh);
    }
    return fresh;
  }

  private recentCount(): number {
    return this.recent().length;
  }
}
