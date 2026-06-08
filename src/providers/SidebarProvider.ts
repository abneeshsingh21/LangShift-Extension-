import * as vscode from 'vscode';
import { ConversionHistory } from '../core/ConversionHistory';
import { ConversionCache } from '../core/ConversionCache';
import { RateLimiter } from '../security/RateLimiter';
import { ConfigManager } from '../utils/ConfigManager';

export class SidebarProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private history: ConversionHistory,
    private limiter: RateLimiter,
    private cache?: ConversionCache,
  ) {}

  resolveWebviewView(
    view: vscode.WebviewView,
    _ctx: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this.view = view;
    view.webview.options = { enableScripts: true };
    view.webview.html    = this.html();

    view.webview.onDidReceiveMessage(msg => {
      vscode.commands.executeCommand(
        ({
          openDashboard:  'langshift.openDashboard',
          showHistory:    'langshift.showHistory',
          undoLast:       'langshift.undoLastConversion',
          configureKey:   'langshift.configureApiKey',
          deleteKey:      'langshift.deleteApiKey',
          openSettings:   'workbench.action.openSettings',
          convertFile:    'langshift.convertFile',
        } as Record<string, string>)[msg.command] ?? '',
        ...(msg.command === 'openSettings' ? ['langshift'] : [])
      );
    });
    // Route new commands
    view.webview.onDidReceiveMessage(msg => {
      if (msg.command === 'clearCache')   vscode.commands.executeCommand('langshift.clearCache');
      if (msg.command === 'exportAudit')  vscode.commands.executeCommand('langshift.exportAuditLog');
    });

    // Push live stats immediately
    this.refresh();
  }

  /** Call after any conversion to update the sidebar */
  refresh(): void {
    if (!this.view) return;
    const stats  = this.history.getStats();
    const last   = this.history.getLast();
    const usage  = this.limiter.currentUsage();
    const config = ConfigManager.getConfig();
    const cacheStats = this.cache?.stats() ?? { entries: 0, hits: 0 };
    const isLocal = config.aiProvider === 'ollama' || config.aiProvider === 'lmstudio';
    this.view.webview.postMessage({ type: 'update', stats, last, usage, provider: config.aiProvider, cacheStats, isLocal });
  }

  private html(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';"/>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
       background:transparent;color:var(--vscode-foreground);padding:12px;font-size:12px;line-height:1.5}
  .logo{font-weight:800;font-size:1rem;letter-spacing:-.02em;
        background:linear-gradient(120deg,#00ffc6,#00a8ff);
        -webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:14px}
  .card{background:var(--vscode-editor-background);border:1px solid var(--vscode-panel-border);
        border-radius:7px;padding:10px 12px;margin-bottom:7px}
  .row{display:flex;justify-content:space-between;align-items:center;margin-bottom:3px}
  .val{font-family:monospace;color:#00ffc6;font-weight:700;font-size:.9rem}
  .lbl{color:var(--vscode-descriptionForeground);font-size:.72rem}
  .section-title{font-size:.62rem;text-transform:uppercase;letter-spacing:.1em;
                 color:var(--vscode-descriptionForeground);margin:12px 0 6px}
  .btn{display:block;width:100%;padding:7px 11px;margin-bottom:5px;
       background:var(--vscode-button-background);color:var(--vscode-button-foreground);
       border:none;border-radius:6px;cursor:pointer;text-align:left;
       font-size:.78rem;font-weight:600;transition:opacity .15s}
  .btn:hover{opacity:.8}
  .btn.sec{background:var(--vscode-editor-background);color:var(--vscode-foreground);
            border:1px solid var(--vscode-panel-border)}
  .btn.danger{background:transparent;color:#ff6b6b;border:1px solid rgba(255,107,107,.4)}
  .rate-bg{background:var(--vscode-panel-border);border-radius:3px;height:4px;margin:5px 0}
  .rate-fg{height:4px;border-radius:3px;background:#00ffc6;transition:width .3s}
  .rate-lbl{display:flex;justify-content:space-between;font-size:.65rem;
             color:var(--vscode-descriptionForeground)}
  .last{font-family:monospace;font-size:.72rem;color:var(--vscode-descriptionForeground);line-height:1.6}
  .arrow{color:#00ffc6}
  .tip{margin-top:14px;padding:8px 10px;background:rgba(0,255,198,.04);
       border-left:2px solid #00ffc6;border-radius:0 5px 5px 0;font-size:.72rem;
       color:var(--vscode-descriptionForeground);line-height:1.6}
  .provider-badge{display:inline-block;padding:1px 7px;background:rgba(0,168,255,.12);
                  border:1px solid rgba(0,168,255,.25);border-radius:10px;
                  color:#00a8ff;font-size:.65rem;margin-left:4px;vertical-align:middle}
</style>
</head>
<body>
<div class="logo">⚡ LangShift</div>

<div class="card">
  <div class="row"><span class="lbl">Conversions</span><span class="val" id="total">—</span></div>
  <div class="row"><span class="lbl">Lines</span><span class="val" id="lines">—</span></div>
  <div class="row"><span class="lbl">Provider</span><span class="val" id="provider" style="font-size:.75rem">—</span></div>
</div>

<div class="card">
  <div class="lbl">Rate Limit (hourly)</div>
  <div class="rate-bg"><div class="rate-fg" id="rate-bar" style="width:0%"></div></div>
  <div class="rate-lbl"><span id="rate-used">0 / —</span><span id="rate-reset"></span></div>
</div>

<div class="card" id="last-card" style="display:none">
  <div class="lbl" style="margin-bottom:4px">Last Conversion</div>
  <div class="last" id="last-conv"></div>
</div>

<div class="section-title">Actions</div>
<button class="btn"     onclick="send('convertFile')">🔄 Convert Active File</button>
<button class="btn sec" onclick="send('openDashboard')">📊 Dashboard</button>
<button class="btn sec" onclick="send('showHistory')">🕓 History</button>
<button class="btn sec" onclick="send('undoLast')">↩ Undo Last</button>
<button class="btn sec" onclick="send('configureKey')">🔑 Configure API Key</button>
<button class="btn sec" onclick="send('openSettings')">⚙ Settings</button>
<button class="btn danger" onclick="send('deleteKey')">🗑 Delete API Key</button>

<div class="tip">
  💡 Rename any file<br>e.g. <strong>app.py → app.java</strong><br>to trigger auto-conversion.
</div>

<script>
  const vscode = acquireVsCodeApi();
  function send(cmd) { vscode.postMessage({ command: cmd }); }

  window.addEventListener('message', ({ data }) => {
    if (data.type !== 'update') return;
    const { stats, last, usage, provider } = data;
    document.getElementById('total').textContent    = stats.totalConversions ?? '0';
    document.getElementById('lines').textContent    = (stats.totalLinesConverted ?? 0).toLocaleString();
    const provEl = document.getElementById('provider');
    const badge = provider === 'anthropic' ? 'Claude' : provider === 'openai' ? 'GPT-4o' : provider === 'gemini' ? 'Gemini' : provider === 'openrouter' ? 'OpenRouter' : '';
    provEl.textContent = provider ? provider + ' ' : '—';
    if (provider && badge) {
      const span = document.createElement('span');
      span.className = 'provider-badge';
      span.textContent = badge;
      provEl.appendChild(span);
    }

    if (usage) {
      const pct = Math.min(100, Math.round((usage.used / usage.limit) * 100));
      document.getElementById('rate-bar').style.width    = pct + '%';
      document.getElementById('rate-bar').style.background = pct > 80 ? '#ff4c4c' : '#00ffc6';
      document.getElementById('rate-used').textContent  = usage.used + ' / ' + usage.limit;
      document.getElementById('rate-reset').textContent = usage.resetInMinutes > 0 ? 'resets in ' + usage.resetInMinutes + 'm' : '';
    }

    if (last) {
      document.getElementById('last-card').style.display = '';
      const lc = document.getElementById('last-conv');
      lc.textContent = '';
      const fromEl = document.createElement('strong');
      fromEl.textContent = last.fromLang;
      const arrow = document.createElement('span');
      arrow.className = 'arrow';
      arrow.textContent = ' → ';
      const toEl = document.createElement('strong');
      toEl.textContent = last.toLang;
      lc.appendChild(fromEl);
      lc.appendChild(arrow);
      lc.appendChild(toEl);
      lc.appendChild(document.createElement('br'));
      lc.appendChild(document.createTextNode(last.fileName));
      lc.appendChild(document.createElement('br'));
      const ts = document.createElement('span');
      ts.style.color = '#555';
      ts.textContent = new Date(last.timestamp).toLocaleString();
      lc.appendChild(ts);
    }
  });
</script>
</body>
</html>`;
  }
}
