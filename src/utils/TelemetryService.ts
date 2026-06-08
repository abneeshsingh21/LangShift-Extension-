import * as vscode from 'vscode';
import { ConfigManager } from './ConfigManager';

// Only these keys are ever sent — no code, no paths, no keys
const SAFE_KEYS = new Set(['fromLang', 'toLang', 'linesConverted', 'provider', 'model']);

export class TelemetryService {
  private readonly sessionId = Math.random().toString(36).slice(2, 11);

  constructor(private context: vscode.ExtensionContext) {}

  track(event: string, props?: Record<string, unknown>): void {
    if (!ConfigManager.getConfig().telemetryEnabled) return;
    if (!vscode.env.isTelemetryEnabled) return;

    const safe: Record<string, unknown> = { event, sessionId: this.sessionId };
    for (const [k, v] of Object.entries(props ?? {})) {
      if (SAFE_KEYS.has(k)) safe[k] = v;
    }
    // In production, forward to your telemetry endpoint
    // e.g. fetch('https://telemetry.langshift.dev/event', { method:'POST', body: JSON.stringify(safe) })
    console.debug('[LangShift telemetry]', safe);
  }
}
