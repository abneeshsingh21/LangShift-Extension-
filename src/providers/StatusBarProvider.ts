import * as vscode from 'vscode';
import { ConfigManager } from '../utils/ConfigManager';
import { ConversionCache } from '../core/ConversionCache';

export class StatusBarProvider {
  private item: vscode.StatusBarItem;
  private converting = false;

  constructor(private cache?: ConversionCache) {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.item.command = 'langshift.openDashboard';
    this.update();
    this.item.show();
  }

  update(): void {
    if (this.converting) return; // Don't update while converting
    const config = ConfigManager.getConfig();
    const provider = config.aiProvider;
    const isLocal = provider === 'ollama' || provider === 'lmstudio';
    const icon = isLocal ? '$(server-process)' : '$(cloud)';
    const cacheStats = this.cache?.stats();
    const cacheText = cacheStats ? ` | ⚡${cacheStats.hits}` : '';
    this.item.text = `${icon} LangShift: ${provider}${cacheText}`;
    this.item.tooltip = [
      `Provider: ${provider}${isLocal ? ' (local)' : ''}`,
      cacheStats ? `Cache: ${cacheStats.entries} entries, ${cacheStats.hits} hits` : '',
      'Click to open dashboard',
    ].filter(Boolean).join('\n');
  }

  showConverting(fromLang: string, toLang: string): void {
    this.converting = true;
    this.item.text = `$(sync~spin) ${fromLang} → ${toLang}...`;
    this.item.tooltip = 'Conversion in progress... Click to cancel';
    this.item.command = 'langshift.cancelConversion';
  }

  showSuccess(fromLang: string, toLang: string, lines: number, confidence?: number): void {
    this.converting = false;
    const confText = confidence ? ` (${confidence}/100)` : '';
    this.item.text = `$(check) ${fromLang} → ${toLang}: ${lines} lines${confText}`;
    this.item.command = 'langshift.openDashboard';
    // Revert to default after 5 seconds
    setTimeout(() => {
      if (!this.converting) this.update();
    }, 5000);
  }

  showError(message: string): void {
    this.converting = false;
    this.item.text = `$(error) LangShift: Failed`;
    this.item.tooltip = message;
    this.item.command = 'langshift.openDashboard';
    setTimeout(() => {
      if (!this.converting) this.update();
    }, 5000);
  }

  dispose(): void {
    this.item.dispose();
  }
}
