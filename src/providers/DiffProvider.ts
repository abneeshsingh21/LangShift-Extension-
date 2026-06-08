import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ConversionRecord } from '../core/ConversionHistory';
import { ConversionHistory } from '../core/ConversionHistory';
import { ConversionCache } from '../core/ConversionCache';
import { LanguageDetector } from '../core/LanguageDetector';
import { RateLimiter } from '../security/RateLimiter';

export class DiffProvider {

  // Show a preview diff in VS Code's built-in diff editor (read-only)
  static async showPreviewDiff(
    original: string,
    converted: string,
    fromLang: string,
    toLang: string,
  ): Promise<void> {
    const tmp = os.tmpdir();
    const fromExt = (LanguageDetector.getExtension(fromLang) ?? '.txt').slice(1);
    const toExt   = (LanguageDetector.getExtension(toLang)   ?? '.txt').slice(1);

    const leftPath  = path.join(tmp, `langshift_original.${fromExt}`);
    const rightPath = path.join(tmp, `langshift_converted.${toExt}`);

    fs.writeFileSync(leftPath,  original,  'utf8');
    fs.writeFileSync(rightPath, converted, 'utf8');

    await vscode.commands.executeCommand(
      'vscode.diff',
      vscode.Uri.file(leftPath),
      vscode.Uri.file(rightPath),
      `LangShift Preview: ${fromLang} → ${toLang}`,
      { preview: true }
    );

    // Clean up temp files when the diff tab is closed
    const cleanup = vscode.workspace.onDidCloseTextDocument((doc) => {
      if (doc.uri.fsPath === leftPath || doc.uri.fsPath === rightPath) {
        try { if (fs.existsSync(leftPath)) fs.unlinkSync(leftPath); } catch { /* ignore preview cleanup failure */ }
        try { if (fs.existsSync(rightPath)) fs.unlinkSync(rightPath); } catch { /* ignore preview cleanup failure */ }
        cleanup.dispose();
      }
    });
  }

  // Show diff for a historical conversion record
  static async showHistoricalDiff(record: ConversionRecord): Promise<void> {
    if (!record.originalCode || !record.convertedCode) {
      vscode.window.showInformationMessage(
        'LangShift: Code not available for this older conversion. Only recent conversions retain full code for diff viewing.'
      );
      return;
    }
    await this.showPreviewDiff(
      record.originalCode,
      record.convertedCode,
      record.fromLang,
      record.toLang,
    );
  }

  // Full webview dashboard
  static openDashboard(
    context: vscode.ExtensionContext,
    history: ConversionHistory,
    limiter: RateLimiter,
    cache?: ConversionCache,
  ): void {
    const panel = vscode.window.createWebviewPanel(
      'langshiftDashboard',
      'LangShift Dashboard',
      vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true }
    );

    const stats   = history.getStats();
    const records = history.getAll().slice(0, 30);
    const usage   = limiter.currentUsage();
    const cacheStats = cache?.stats() ?? { entries: 0, hits: 0 };

    panel.webview.html = DiffProvider.dashboardHTML(stats, records, usage, cacheStats);

    panel.webview.onDidReceiveMessage(async (msg) => {
      switch (msg.command) {
        case 'clearHistory':
          history.clear();
          vscode.window.showInformationMessage('LangShift: History cleared.');
          panel.dispose();
          break;
        case 'viewDiff': {
          const rec = history.getById(msg.id);
          if (rec) await DiffProvider.showHistoricalDiff(rec);
          break;
        }
        case 'configureKey':
          vscode.commands.executeCommand('langshift.configureApiKey');
          break;
      }
    });
  }

  private static dashboardHTML(
    stats:   ReturnType<ConversionHistory['getStats']>,
    records: ConversionRecord[],
    usage:   { used: number; limit: number; resetInMinutes: number },
    cacheStats: { entries: number; hits: number },
  ): string {
    const pairRows = Object.entries(stats.conversionsByPair)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 8)
      .map(([pair, count]) => `
        <div class="pair-row">
          <span class="pair-label">${esc(pair)}</span>
          <span class="pair-bar-wrap"><span class="pair-bar" style="width:${Math.min(100,(count/Math.max(...Object.values(stats.conversionsByPair)))*100).toFixed(0)}%"></span></span>
          <span class="pair-count">${count}</span>
        </div>`)
      .join('');

    const providerRows = Object.entries(stats.byProvider)
      .map(([p, c]) => `<div class="tag">${esc(p)} <b>${c}</b></div>`)
      .join('');

    const historyRows = records.map(r => `
      <tr>
        <td><span class="lang-badge">${esc(r.fromLang)}</span> → <span class="lang-badge">${esc(r.toLang)}</span></td>
        <td class="mono">${esc(r.fileName)}</td>
        <td class="mono">${r.linesConverted}</td>
        <td class="mono">${esc(r.model ?? r.provider ?? '—')}</td>
        <td>${new Date(r.timestamp).toLocaleDateString()}</td>
        <td><button class="action-btn" data-id="${esc(r.id)}">Diff</button></td>
      </tr>`).join('');

    const rateBarPct = Math.min(100, (usage.used / usage.limit) * 100).toFixed(0);
    const rateColor  = usage.used / usage.limit > 0.8 ? '#ff4c4c' : '#00ffc6';

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';"/>
<style>
  :root {
    --bg:      #0d0d0d;
    --surface: #161616;
    --border:  #242424;
    --text:    #e0e0e0;
    --muted:   #666;
    --accent:  #00ffc6;
    --accent2: #00a8ff;
    --danger:  #ff4c4c;
    --radius:  10px;
  }
  * { box-sizing:border-box; margin:0; padding:0; }
  body { font-family: -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
         background:var(--bg); color:var(--text); padding:28px 32px; font-size:13px; }
  h1   { font-size:1.5rem; font-weight:800; letter-spacing:-0.03em;
         background:linear-gradient(120deg,var(--accent),var(--accent2));
         -webkit-background-clip:text; -webkit-text-fill-color:transparent;
         margin-bottom:28px; }
  /* Stat cards */
  .stat-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:14px; margin-bottom:32px; }
  .stat-card { background:var(--surface); border:1px solid var(--border); border-radius:var(--radius);
               padding:18px 20px; position:relative; overflow:hidden; }
  .stat-card::before { content:''; position:absolute; top:0;left:0;right:0;height:2px;
                       background:linear-gradient(90deg,var(--accent),var(--accent2)); }
  .stat-num  { font-size:2rem; font-weight:800; color:var(--accent);
               font-family:'JetBrains Mono',monospace; line-height:1; }
  .stat-lbl  { font-size:.7rem; color:var(--muted); text-transform:uppercase;
               letter-spacing:.1em; margin-top:6px; }
  /* Section */
  .section      { margin-bottom:32px; }
  .section-title{ font-size:.7rem; text-transform:uppercase; letter-spacing:.12em;
                  color:var(--muted); margin-bottom:12px; }
  /* Pair bars */
  .pair-row  { display:flex; align-items:center; gap:10px; margin-bottom:7px; }
  .pair-label{ font-family:monospace; font-size:.8rem; min-width:180px; color:var(--text); }
  .pair-bar-wrap{ flex:1; background:var(--border); border-radius:4px; height:6px; }
  .pair-bar  { background:linear-gradient(90deg,var(--accent),var(--accent2));
               border-radius:4px; height:6px; transition:width .4s; }
  .pair-count{ font-size:.75rem; color:var(--accent); font-family:monospace; min-width:24px; text-align:right; }
  /* Tags */
  .tag { display:inline-flex; align-items:center; gap:6px; padding:4px 10px;
         background:#0d2a1a; border:1px solid #1a4a2a; border-radius:20px;
         font-size:.75rem; margin:3px; color:var(--accent); }
  /* Rate bar */
  .rate-wrap { background:var(--surface); border:1px solid var(--border); border-radius:var(--radius); padding:16px 20px; }
  .rate-bar-bg { background:var(--border); border-radius:4px; height:8px; margin:10px 0; }
  .rate-bar-fg { height:8px; border-radius:4px; background:${rateColor}; width:${rateBarPct}%; transition:width .4s; }
  .rate-text { display:flex; justify-content:space-between; font-size:.75rem; color:var(--muted); }
  /* Table */
  table { width:100%; border-collapse:collapse; font-size:.8rem; }
  th { text-align:left; padding:8px 12px; color:var(--muted); font-size:.65rem;
       text-transform:uppercase; letter-spacing:.1em; border-bottom:1px solid var(--border); }
  td { padding:9px 12px; border-bottom:1px solid #1a1a1a; vertical-align:middle; }
  tr:hover td { background:var(--surface); }
  .mono { font-family:monospace; font-size:.78rem; }
  .lang-badge { display:inline-block; padding:2px 6px; background:#0d1f2a; border:1px solid #1a3a4a;
                color:var(--accent2); border-radius:4px; font-size:.72rem; font-family:monospace; }
  .action-btn { padding:3px 10px; background:var(--border); color:var(--text);
                border:1px solid #333; border-radius:5px; cursor:pointer; font-size:.72rem; }
  .action-btn:hover { background:#2a2a2a; }
  .danger-btn { padding:6px 14px; background:transparent; color:var(--danger);
                border:1px solid var(--danger); border-radius:6px; cursor:pointer;
                font-size:.78rem; margin-top:8px; }
  .danger-btn:hover { background:rgba(255,76,76,.08); }
  .empty { color:var(--muted); font-size:.85rem; padding:16px 0; }
</style>
</head>
<body>
<h1>⚡ LangShift Dashboard</h1>

<div class="stat-grid">
  <div class="stat-card"><div class="stat-num">${stats.totalConversions}</div><div class="stat-lbl">Total Conversions</div></div>
  <div class="stat-card"><div class="stat-num">${stats.totalLinesConverted.toLocaleString()}</div><div class="stat-lbl">Lines Converted</div></div>
  <div class="stat-card"><div class="stat-num">${Object.keys(stats.conversionsByPair).length}</div><div class="stat-lbl">Language Pairs</div></div>
  <div class="stat-card"><div class="stat-num">${cacheStats.hits}</div><div class="stat-lbl">Cache Hits ⚡</div></div>
  <div class="stat-card"><div class="stat-num">${cacheStats.entries}</div><div class="stat-lbl">Cached Entries</div></div>
  <div class="stat-card"><div class="stat-num" style="font-size:1.1rem;padding-top:4px">${esc(stats.mostCommonPair)}</div><div class="stat-lbl">Top Pair</div></div>
</div>

<div class="section">
  <div class="section-title">API Rate Usage (this hour)</div>
  <div class="rate-wrap">
    <div class="rate-bar-bg"><div class="rate-bar-fg"></div></div>
    <div class="rate-text"><span>${usage.used} / ${usage.limit} used</span><span>${usage.resetInMinutes > 0 ? `resets in ${usage.resetInMinutes} min` : 'full capacity'}</span></div>
  </div>
</div>

${providerRows ? `
<div class="section">
  <div class="section-title">By Provider</div>
  <div>${providerRows}</div>
</div>` : ''}

${pairRows ? `
<div class="section">
  <div class="section-title">Top Language Pairs</div>
  ${pairRows}
</div>` : ''}

<div class="section">
  <div class="section-title">Recent Conversions</div>
  ${records.length > 0 ? `
  <table>
    <thead><tr><th>Conversion</th><th>File</th><th>Lines</th><th>Model</th><th>Date</th><th></th></tr></thead>
    <tbody>${historyRows}</tbody>
  </table>
  <button class="danger-btn" id="clear-history-btn">🗑 Clear History</button>
  ` : '<div class="empty">No conversions yet. Rename a file to get started.</div>'}
</div>

<script>
  const vscode = acquireVsCodeApi();
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.action-btn[data-id]');
    if (btn) vscode.postMessage({ command: 'viewDiff', id: btn.dataset.id });
  });
  document.getElementById('clear-history-btn')?.addEventListener('click', () => {
    if (confirm('Clear all conversion history? This cannot be undone.'))
      vscode.postMessage({ command: 'clearHistory' });
  });
</script>
</body>
</html>`;
  }
}

function esc(s: string): string {
  return String(s ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
