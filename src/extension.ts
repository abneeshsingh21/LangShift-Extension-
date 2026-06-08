import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ConversionEngine } from './core/ConversionEngine';
import { SecurityManager } from './security/SecurityManager';
import { RateLimiter } from './security/RateLimiter';
import { ConversionHistory } from './core/ConversionHistory';
import { BackupManager } from './core/BackupManager';
import { LanguageDetector } from './core/LanguageDetector';
import { ConversionCache } from './core/ConversionCache';
import { AuditLog } from './core/AuditLog';
import { CompilerValidator } from './core/CompilerValidator';
import { ImportResolver } from './core/ImportResolver';
import { AutoFixer } from './core/AutoFixer';
import { DiagnosticsManager } from './core/DiagnosticsManager';
import { TeamSettings } from './config/TeamSettings';
import { StatusBarProvider } from './providers/StatusBarProvider';
import { StreamingWebview } from './providers/StreamingWebview';
import { SidebarProvider } from './providers/SidebarProvider';
import { DiffProvider } from './providers/DiffProvider';
import { Logger } from './utils/Logger';
import { ConfigManager } from './utils/ConfigManager';
import { TelemetryService } from './utils/TelemetryService';

// Module-level singletons (initialised in activate)
let engine:    ConversionEngine;
let security:  SecurityManager;
let limiter:   RateLimiter;
let history:   ConversionHistory;
let backup:    BackupManager;
let logger:    Logger;
let telemetry: TelemetryService;
let sidebar:   SidebarProvider;
let cache:     ConversionCache;
let audit:     AuditLog;
let statusBar: StatusBarProvider;
let diagnostics: DiagnosticsManager;
let streaming: StreamingWebview;

// ─── ACTIVATE ────────────────────────────────────────────────────────────────
export async function activate(context: vscode.ExtensionContext): Promise<void> {
  logger      = new Logger(context);
  security    = new SecurityManager(context);
  limiter     = new RateLimiter(context);
  history     = new ConversionHistory(context);
  backup      = new BackupManager(context);
  telemetry   = new TelemetryService(context);
  cache       = new ConversionCache(context);
  audit       = new AuditLog();
  engine      = new ConversionEngine(security, limiter, history, backup, logger, telemetry, cache, audit);
  sidebar     = new SidebarProvider(context.extensionUri, history, limiter, cache);
  statusBar   = new StatusBarProvider(cache);
  diagnostics = new DiagnosticsManager();
  streaming   = new StreamingWebview();

  context.subscriptions.push({ dispose: () => statusBar.dispose() });
  context.subscriptions.push({ dispose: () => diagnostics.dispose() });
  context.subscriptions.push({ dispose: () => streaming.dispose() });

  logger.info('LangShift activating…');

  // Sidebar
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('langshift.sidebar', sidebar)
  );

  // ── Core: watch for file renames ─────────────────────────────────────────
  context.subscriptions.push(
    vscode.workspace.onDidRenameFiles(async ({ files }) => {
      if (!ConfigManager.getConfig().autoConvertOnRename) return;
      for (const { oldUri, newUri } of files) {
        await handleRename(oldUri, newUri, context);
      }
    })
  );

  // ── Commands ──────────────────────────────────────────────────────────────
  context.subscriptions.push(

    // Manual convert (editor title / context menu)
    vscode.commands.registerCommand('langshift.convertFile', async (uri?: vscode.Uri) => {
      const fileUri = uri ?? vscode.window.activeTextEditor?.document.uri;
      if (!fileUri) return warn('Open a file first, or right-click a file in Explorer.');
      await manualConvert(fileUri, context);
    }),

    // Batch folder convert
    vscode.commands.registerCommand('langshift.convertFolder', async (uri?: vscode.Uri) => {
      if (!uri) return warn('Right-click a folder in Explorer to use this command.');
      await folderConvert(uri, context);
    }),

    // Show quick-pick history + diff
    vscode.commands.registerCommand('langshift.showHistory', async () => {
      const all = history.getAll();
      if (all.length === 0) return info('No conversions yet.');

      const items = all.slice(0, 25).map(r => ({
        label:       `$(history) ${r.fromLang} → ${r.toLang}`,
        description: r.fileName,
        detail:      `${new Date(r.timestamp).toLocaleString()}  •  ${r.linesConverted} lines  •  ${r.model ?? r.provider}`,
        id:          r.id,
      }));

      const pick = await vscode.window.showQuickPick(items, {
        title: 'LangShift: Conversion History',
        placeHolder: 'Select to view diff',
        matchOnDetail: true,
      });
      if (!pick) return;
      const rec = history.getById((pick as typeof items[number]).id);
      if (rec) await DiffProvider.showHistoricalDiff(rec);
    }),

    // Dashboard webview
    vscode.commands.registerCommand('langshift.openDashboard', () => {
      DiffProvider.openDashboard(context, history, limiter, cache);
    }),

    // Configure any provider's API key
    vscode.commands.registerCommand('langshift.configureApiKey', async () => {
      await security.promptAndStoreApiKey();
      sidebar.refresh();
    }),

    // Delete a stored key
    vscode.commands.registerCommand('langshift.deleteApiKey', async () => {
      await security.promptDeleteApiKey();
      sidebar.refresh();
    }),

    // Undo last conversion via backup
    vscode.commands.registerCommand('langshift.undoLastConversion', async () => {
      const last = history.getLast();
      if (!last) return info('No recent conversion to undo.');
      if (!last.backupId) return warn('No backup available for last conversion.');
      const ok = await backup.restore(last.backupId);
      if (ok) {
        await history.deleteById(last.id);
        sidebar.refresh();
        vscode.window.showInformationMessage(`↩ LangShift: Restored ${last.fileName}`);
      }
    }),

    // Cancel active conversion
    vscode.commands.registerCommand('langshift.cancelConversion', () => {
      engine.cancelActive();
    }),

    // Export audit log
    vscode.commands.registerCommand('langshift.exportAuditLog', async () => {
      const csvPath = await audit.exportCsv();
      if (csvPath) {
        const doc = await vscode.workspace.openTextDocument(csvPath);
        await vscode.window.showTextDocument(doc);
        info('Audit log exported as CSV.');
      } else {
        info('No audit entries to export.');
      }
    }),

    // Clear cache
    vscode.commands.registerCommand('langshift.clearCache', async () => {
      await cache.clear();
      sidebar.refresh();
      info('Conversion cache cleared.');
    }),

    // Validate last conversion with compiler
    vscode.commands.registerCommand('langshift.validateConversion', async () => {
      const last = history.getLast();
      if (!last || !last.convertedCode) return info('No recent conversion to validate.');
      if (!CompilerValidator.isSupported(last.toLang)) {
        return info(`Compiler validation not available for ${last.toLang}. Supported: ${CompilerValidator.supportedLanguages().join(', ')}`);
      }
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: '🔍 LangShift: Validating with compiler...' },
        async () => {
          const result = await CompilerValidator.validate(last.convertedCode!, last.toLang);
          if (result.success) {
            vscode.window.showInformationMessage(`✅ ${result.compiler}: Code compiles cleanly!`);
          } else {
            const errCount = result.errors.filter(e => e.severity === 'error').length;
            const warnCount = result.errors.filter(e => e.severity === 'warning').length;
            vscode.window.showWarningMessage(
              `⚠️ ${result.compiler}: ${errCount} error(s), ${warnCount} warning(s). Check Output panel.`,
              'View Errors'
            ).then(action => {
              if (action === 'View Errors') {
                logger.error(`Compiler validation:\n${result.rawOutput}`);
                logger.show();
              }
            });
          }
        }
      );
    }),

    // Resolve missing imports
    vscode.commands.registerCommand('langshift.resolveImports', async () => {
      const last = history.getLast();
      if (!last || !last.convertedCode) return info('No recent conversion to check.');
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: '📦 LangShift: Checking imports...' },
        async () => {
          const missing = await ImportResolver.resolve(last.convertedCode!, last.toLang);
          if (missing.length === 0) {
            vscode.window.showInformationMessage('✅ All imports resolved — no missing packages.');
          } else {
            const items = missing.map(m => ({
              label: `$(package) ${m.packageName}`,
              description: m.importStatement,
              detail: `Install: ${m.installCommand}`,
              command: m.installCommand,
            }));
            const pick = await vscode.window.showQuickPick(items, {
              title: `LangShift: ${missing.length} Missing Package(s)`,
              placeHolder: 'Select to copy install command',
            });
            if (pick) {
              await vscode.env.clipboard.writeText(pick.command);
              info(`Copied: ${pick.command}`);
            }
          }
        }
      );
    }),

    // Create team settings template
    vscode.commands.registerCommand('langshift.createTeamSettings', async () => {
      const filePath = await TeamSettings.createTemplate();
      if (filePath) {
        const doc = await vscode.workspace.openTextDocument(filePath);
        await vscode.window.showTextDocument(doc);
        info('Team settings template created. Commit to share with your team.');
      }
    }),

    // Auto-fix last conversion using compiler feedback loop
    vscode.commands.registerCommand('langshift.autoFixConversion', async () => {
      const last = history.getLast();
      if (!last || !last.convertedCode) return info('No recent conversion to fix.');
      if (!CompilerValidator.isSupported(last.toLang)) {
        return info(`Auto-fix not available for ${last.toLang}.`);
      }
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: '🔧 LangShift: Auto-fixing with compiler feedback...' },
        async () => {
          const result = await AutoFixer.fix(
            last.convertedCode!, last.toLang, security, logger,
          );
          if (result.fixed) {
            // Write the fixed code to the output file
            const outPath = last.filePath.replace(
              path.extname(last.filePath),
              LanguageDetector.getExtension(last.toLang) ?? path.extname(last.filePath)
            );
            fs.writeFileSync(outPath, result.code, 'utf8');
            vscode.window.showInformationMessage(`✅ Auto-fix: ${result.message}`);
            sidebar.refresh();
            statusBar.update();
          } else {
            vscode.window.showInformationMessage(`ℹ️ ${result.message}`);
          }
        }
      );
    }),

    // Clear diagnostics
    vscode.commands.registerCommand('langshift.clearDiagnostics', () => {
      diagnostics.clear();
      info('Diagnostics cleared.');
    }),
  );

  await checkFirstRun(context);

  logger.info('LangShift activated.');
  telemetry.track('extension_activated');
}

// ─── RENAME HANDLER ───────────────────────────────────────────────────────────
async function handleRename(
  oldUri: vscode.Uri,
  newUri: vscode.Uri,
  context: vscode.ExtensionContext,
): Promise<void> {
  const oldExt = extOf(oldUri.fsPath);
  const newExt = extOf(newUri.fsPath);

  if (!oldExt || !newExt || oldExt === newExt) return;

  const fromLang = LanguageDetector.fromExtension(oldExt);
  const toLang   = LanguageDetector.fromExtension(newExt);
  if (!fromLang || !toLang) return;

  const fileName = path.basename(newUri.fsPath);
  const config   = ConfigManager.getConfig();

  // Compatibility hint
  const note = LanguageDetector.compatibilityNote(fromLang, toLang);

  if (config.showConfirmationDialog) {
    const buttons: string[] = ['Convert', 'Preview Diff', 'Skip'];
    const action = await vscode.window.showInformationMessage(
      `🔄 LangShift: ${fileName} — Convert ${fromLang} → ${toLang}?`,
      { detail: note ?? undefined, modal: false },
      ...buttons
    );
    if (!action || action === 'Skip') return;

    if (action === 'Preview Diff' || config.showDiffBeforeApply) {
      await previewAndConfirm(newUri, fromLang, toLang, context);
      return;
    }
  }

  if (config.showDiffBeforeApply) {
    await previewAndConfirm(newUri, fromLang, toLang, context);
    return;
  }

  await runConversion(newUri, fromLang, toLang, context);
}

// ─── PREVIEW DIFF THEN CONFIRM ────────────────────────────────────────────────
async function previewAndConfirm(
  fileUri:  vscode.Uri,
  fromLang: string,
  toLang:   string,
  _context: vscode.ExtensionContext,
): Promise<void> {
  let previewResult: Awaited<ReturnType<typeof engine.preview>> | undefined;

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: '🔄 LangShift: Generating preview…', cancellable: true },
    async (_progress, token) => {
      token.onCancellationRequested(() => engine.cancelActive());
      previewResult = await engine.preview({ fileUri, fromLang, toLang });
    }
  );

  if (!previewResult?.success || !previewResult.convertedCode) {
    warn(previewResult?.error ?? 'Preview failed — could not get converted code.');
    return;
  }

  // Show diff WITHOUT writing to disk
  const originalCode = fs.readFileSync(fileUri.fsPath, 'utf8');
  await DiffProvider.showPreviewDiff(originalCode, previewResult.convertedCode, fromLang, toLang);

  // Ask user to accept or reject
  const action = await vscode.window.showInformationMessage(
    `✅ Preview ready: ${fromLang} → ${toLang} (${previewResult.linesConverted} lines)${previewResult.cacheHit ? ' ⚡ cached' : ''}${previewResult.confidence ? ` • ${previewResult.confidence}/100 confidence` : ''}. Apply?`,
    'Apply', 'Discard'
  );

  if (action === 'Apply') {
    // Now do the actual conversion (which writes to disk)
    await runConversion(fileUri, fromLang, toLang, _context);
  } else {
    info('Preview discarded — no changes made.');
  }
}

// ─── MANUAL CONVERT ───────────────────────────────────────────────────────────
async function manualConvert(
  fileUri: vscode.Uri,
  context: vscode.ExtensionContext,
): Promise<void> {
  const fromLang = LanguageDetector.fromFilePath(fileUri.fsPath);
  if (!fromLang) return warn(`Unsupported file type: ${path.extname(fileUri.fsPath)}`);

  const langs = LanguageDetector.getAllLanguages().filter(l => l !== fromLang);
  const pick = await vscode.window.showQuickPick(
    langs.map(l => ({
      label:       l,
      description: LanguageDetector.getExtension(l) ?? '',
      detail:      LanguageDetector.compatibilityNote(fromLang, l) ?? undefined,
    })),
    { title: `LangShift: Convert ${fromLang} to…`, placeHolder: 'Select target language', matchOnDetail: true }
  );
  if (!pick) return;

  if (ConfigManager.getConfig().showDiffBeforeApply) {
    await previewAndConfirm(fileUri, fromLang, pick.label, context);
    return;
  }

  await runConversion(fileUri, fromLang, pick.label, context);
}

// ─── FOLDER BATCH CONVERT ─────────────────────────────────────────────────────
async function folderConvert(
  folderUri: vscode.Uri,
  _context:  vscode.ExtensionContext,
): Promise<void> {
  const langs = LanguageDetector.getAllLanguages();

  const fromPick = await vscode.window.showQuickPick(langs, {
    title: 'LangShift Batch Convert — Step 1 of 2',
    placeHolder: 'Source language (files in this language will be converted)',
  });
  if (!fromPick) return;

  const toPick = await vscode.window.showQuickPick(langs.filter(l => l !== fromPick), {
    title: 'LangShift Batch Convert — Step 2 of 2',
    placeHolder: 'Target language',
  });
  if (!toPick) return;

  const fromExt = (LanguageDetector.getExtension(fromPick) ?? '').slice(1);
  if (!fromExt) return warn(`No extension mapping for ${fromPick}.`);

  const files = await vscode.workspace.findFiles(
    new vscode.RelativePattern(folderUri, `**/*.${fromExt}`),
    '**/{node_modules,.git,.langshift-backups}/**'
  );

  if (files.length === 0) return info(`No ${fromPick} files found in this folder.`);

  const confirm = await vscode.window.showWarningMessage(
    `Convert ${files.length} ${fromPick} file(s) → ${toPick}? A backup will be created for each.`,
    { modal: true },
    `Convert ${files.length} Files`,
    'Cancel'
  );
  if (confirm !== `Convert ${files.length} Files`) return;

  let done = 0, failed = 0;

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'LangShift: Batch converting…', cancellable: true },
    async (progress, token) => {
      for (const file of files) {
        if (token.isCancellationRequested) break;

        const name = path.basename(file.fsPath);
        progress.report({ increment: 100 / files.length, message: `${name} (${done + failed + 1}/${files.length})` });

        const result = await engine.convert({ fileUri: file, fromLang: fromPick, toLang: toPick });
        if (result.success) done++;
        else { failed++; logger.error(`Batch: failed ${name} — ${result.error}`); }

        // Stagger requests to avoid hitting provider rate limits
        if (!token.isCancellationRequested) await sleep(ConfigManager.getConfig().batchDelayMs);
      }
    }
  );

  sidebar.refresh();
  vscode.window.showInformationMessage(
    `✅ LangShift batch done: ${done} converted, ${failed} failed.`
  );
}

// ─── RUN CONVERSION WITH PROGRESS + POST ACTIONS ─────────────────────────────
async function runConversion(
  fileUri:  vscode.Uri,
  fromLang: string,
  toLang:   string,
  _context: vscode.ExtensionContext,
): Promise<void> {
  let result: Awaited<ReturnType<typeof engine.convert>> = { success: false, error: 'Conversion did not complete.' };
  const config = ConfigManager.getConfig();
  if (config.streaming) {
    streaming.show(fromLang, toLang);
  }

  await vscode.window.withProgress(
    {
      location:    vscode.ProgressLocation.Notification,
      title:       `🔄 LangShift: ${fromLang} → ${toLang}`,
      cancellable: true,
    },
    async (progress, token) => {
      token.onCancellationRequested(() => engine.cancelActive());
      statusBar.showConverting(fromLang, toLang);
      progress.report({ increment: 10, message: 'Sending to AI…' });
      result = await engine.convert({
        fileUri,
        fromLang,
        toLang,
        onStreamChunk: config.streaming ? text => streaming.appendChunk(text) : undefined,
        onStreamDone: config.streaming ? (success, confidence) => streaming.finish(success, confidence) : undefined,
      });
      progress.report({ increment: 100, message: result.success ? 'Done!' : 'Failed.' });
    }
  );

  sidebar.refresh();
  statusBar.update();

  if (!result.success) {
    const action = await vscode.window.showErrorMessage(
      `❌ LangShift: ${result.error}`,
      'Configure Key', 'Open Log'
    );
    if (action === 'Configure Key') vscode.commands.executeCommand('langshift.configureApiKey');
    if (action === 'Open Log')      logger.show();
    statusBar.showError(result.error ?? 'Unknown error');
    return;
  }

  const parts = [`✅ ${fromLang} → ${toLang}: ${result.linesConverted} lines converted`];
  if (result.cacheHit) parts.push('⚡ cached');
  if (result.confidence) parts.push(`${result.confidence}/100 confidence`);
  if (result.fallbackUsed) parts.push(`via ${result.providerUsed}`);
  if (result.piiRedacted && result.piiRedacted > 0) parts.push(`${result.piiRedacted} PII items scrubbed`);

  const action = await vscode.window.showInformationMessage(
    parts.join(' • ') + '.',
    'View Diff', 'Validate', 'Undo', 'Dismiss'
  );

  statusBar.showSuccess(fromLang, toLang, result.linesConverted ?? 0, result.confidence);

  if (action === 'View Diff' && result.historyId) {
    const rec = history.getById(result.historyId);
    if (rec) await DiffProvider.showHistoricalDiff(rec);
  }
  if (action === 'Validate' && result.historyId) {
    vscode.commands.executeCommand('langshift.validateConversion');
  }
  if (action === 'Undo' && result.historyId) {
    const rec = history.getById(result.historyId);
    if (rec?.backupId) {
      await backup.restore(rec.backupId);
      await history.deleteById(rec.id);
      sidebar.refresh();
      statusBar.update();
      info(`Restored ${path.basename(fileUri.fsPath)}.`);
    }
  }
}

// ─── FIRST RUN ONBOARDING ─────────────────────────────────────────────────────
async function checkFirstRun(context: vscode.ExtensionContext): Promise<void> {
  if (process.env.LANGSHIFT_TEST === '1') return;
  if (await security.hasApiKey()) return;
  const dismissed = context.globalState.get<boolean>('langshift.setupDismissed', false);
  if (dismissed) return;

  const action = await vscode.window.showInformationMessage(
    '👋 Welcome to LangShift! Configure an AI provider API key to start converting code.',
    'Configure Now', 'Later'
  );

  if (action === 'Configure Now') {
    await security.promptAndStoreApiKey();
  } else {
    await context.globalState.update('langshift.setupDismissed', true);
  }
}

// ─── DEACTIVATE ───────────────────────────────────────────────────────────────
export function deactivate(): void {
  engine?.cancelActive();
  statusBar?.dispose();
  diagnostics?.dispose();
  streaming?.dispose();
  logger?.info('LangShift deactivated.');
  telemetry?.track('extension_deactivated');
}

// ─── UTILS ────────────────────────────────────────────────────────────────────
function extOf(filePath: string): string | null {
  const m = filePath.match(/\.([^./\\]+)$/);
  return m ? m[1].toLowerCase() : null;
}
function warn(msg: string): void {
  vscode.window.showWarningMessage(`LangShift: ${msg}`);
}
function info(msg: string): void {
  vscode.window.showInformationMessage(`LangShift: ${msg}`);
}
function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
