import * as vscode from 'vscode';

/**
 * StreamingWebview — shows converted code appearing character-by-character
 * in a dedicated webview panel with syntax highlighting and a live cursor.
 */
export class StreamingWebview {
  private panel: vscode.WebviewPanel | null = null;
  private accumulated = '';
  private language = '';

  show(fromLang: string, toLang: string): void {
    this.accumulated = '';
    this.language = toLang;

    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Beside);
    } else {
      this.panel = vscode.window.createWebviewPanel(
        'langshiftStreaming',
        `LangShift: ${fromLang} → ${toLang}`,
        vscode.ViewColumn.Beside,
        { enableScripts: true, retainContextWhenHidden: true }
      );
      this.panel.onDidDispose(() => { this.panel = null; });
    }

    this.panel.webview.html = this.getHTML(fromLang, toLang);
  }

  appendChunk(text: string): void {
    this.accumulated += text;
    this.panel?.webview.postMessage({ type: 'chunk', text });
  }

  finish(success: boolean, confidence?: number): void {
    this.panel?.webview.postMessage({
      type: 'done',
      success,
      confidence,
      totalLines: this.accumulated.split('\n').length,
    });
  }

  getAccumulated(): string {
    return this.accumulated;
  }

  dispose(): void {
    this.panel?.dispose();
    this.panel = null;
  }

  private getHTML(fromLang: string, toLang: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';"/>
<style>
  :root {
    --bg: #0d0d0d;
    --surface: #161616;
    --border: #242424;
    --text: #e0e0e0;
    --accent: #00ffc6;
    --accent2: #00a8ff;
    --muted: #666;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace;
    background: var(--bg); color: var(--text);
    padding: 0; font-size: 13px; line-height: 1.6;
    overflow: hidden; height: 100vh;
  }
  .header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 20px;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
  }
  .title {
    font-weight: 700; font-size: .85rem;
    background: linear-gradient(120deg, var(--accent), var(--accent2));
    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
  }
  .status {
    display: flex; align-items: center; gap: 8px;
    font-size: .75rem; color: var(--muted);
  }
  .status-dot {
    width: 8px; height: 8px; border-radius: 50%;
    background: var(--accent);
    animation: pulse 1.5s ease-in-out infinite;
  }
  .status-dot.done { animation: none; background: #00ff88; }
  .status-dot.error { animation: none; background: #ff4c4c; }
  @keyframes pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.4; transform: scale(0.8); }
  }
  .code-container {
    height: calc(100vh - 90px);
    overflow-y: auto;
    padding: 16px 20px;
    counter-reset: line;
  }
  .code-container::-webkit-scrollbar { width: 6px; }
  .code-container::-webkit-scrollbar-thumb {
    background: var(--border); border-radius: 3px;
  }
  pre {
    white-space: pre-wrap;
    word-wrap: break-word;
    font-size: 13px;
    line-height: 1.6;
    tab-size: 4;
  }
  .cursor {
    display: inline-block;
    width: 2px; height: 1.1em;
    background: var(--accent);
    animation: blink 0.8s step-end infinite;
    vertical-align: text-bottom;
    margin-left: 1px;
  }
  @keyframes blink {
    0%, 50% { opacity: 1; }
    51%, 100% { opacity: 0; }
  }
  .footer {
    position: fixed; bottom: 0; left: 0; right: 0;
    padding: 8px 20px;
    background: var(--surface);
    border-top: 1px solid var(--border);
    display: flex; justify-content: space-between;
    font-size: .7rem; color: var(--muted);
  }
  .confidence-badge {
    display: inline-flex; align-items: center; gap: 4px;
    padding: 2px 8px; border-radius: 10px;
    font-weight: 700; font-size: .72rem;
  }
  .confidence-high { background: #0d2a1a; color: #00ff88; border: 1px solid #1a4a2a; }
  .confidence-mid  { background: #2a2a0d; color: #ffc107; border: 1px solid #4a4a1a; }
  .confidence-low  { background: #2a0d0d; color: #ff4c4c; border: 1px solid #4a1a1a; }
</style>
</head>
<body>
<div class="header">
  <div class="title">⚡ ${fromLang} → ${toLang}</div>
  <div class="status">
    <span class="status-dot" id="statusDot"></span>
    <span id="statusText">Streaming...</span>
  </div>
</div>
<div class="code-container">
  <pre id="code"></pre><span class="cursor" id="cursor"></span>
</div>
<div class="footer">
  <span id="lineCount">0 lines</span>
  <span id="confidenceContainer"></span>
</div>
<script>
  const codeEl = document.getElementById('code');
  const cursorEl = document.getElementById('cursor');
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const lineCount = document.getElementById('lineCount');
  const confidenceContainer = document.getElementById('confidenceContainer');
  let lines = 0;

  function escapeHtml(text) {
    return text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  window.addEventListener('message', (event) => {
    const msg = event.data;
    if (msg.type === 'chunk') {
      codeEl.textContent += msg.text;
      lines = (codeEl.textContent.match(/\\n/g) || []).length + 1;
      lineCount.textContent = lines + ' lines';
      // Auto-scroll to bottom
      const container = document.querySelector('.code-container');
      container.scrollTop = container.scrollHeight;
    } else if (msg.type === 'done') {
      cursorEl.style.display = 'none';
      statusDot.classList.add(msg.success ? 'done' : 'error');
      statusText.textContent = msg.success ? 'Complete' : 'Failed';
      lineCount.textContent = msg.totalLines + ' lines';
      if (msg.confidence) {
        const cls = msg.confidence >= 80 ? 'high' : msg.confidence >= 50 ? 'mid' : 'low';
        confidenceContainer.innerHTML = '<span class="confidence-badge confidence-' + cls + '">' + msg.confidence + '/100 confidence</span>';
      }
    }
  });
</script>
</body>
</html>`;
  }
}
