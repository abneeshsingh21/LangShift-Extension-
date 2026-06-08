import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

interface BackupEntry {
  id:           string;
  originalPath: string;
  backupPath:   string;
  timestamp:    number;
}

export class BackupManager {
  private readonly DIR    = '.langshift-backups';
  private readonly KEY    = 'langshift.backups';
  private readonly LIMIT  = 50;

  constructor(private context: vscode.ExtensionContext) {}

  /** Write a backup and return its id. Throws on failure. */
  async create(fileUri: vscode.Uri, content: string): Promise<string> {
    const id        = `ls_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const backupDir = this.backupDir(fileUri.fsPath);

    fs.mkdirSync(backupDir, { recursive: true });

    // Drop a .gitignore once so backups never reach git
    const gi = path.join(backupDir, '.gitignore');
    if (!fs.existsSync(gi)) fs.writeFileSync(gi, '*\n');

    const backupPath = path.join(backupDir, `${id}_${path.basename(fileUri.fsPath)}`);
    fs.writeFileSync(backupPath, content, 'utf8');

    const entries = this.all();
    entries.push({ id, originalPath: fileUri.fsPath, backupPath, timestamp: Date.now() });
    await this.context.globalState.update(this.KEY, entries);

    // Trim old backups (fire-and-forget)
    this.pruneOld().catch(() => {});

    return id;
  }

  /** Restore a backup by id. Opens the restored file. Returns false if not found. */
  async restore(backupId: string): Promise<boolean> {
    const entry = this.all().find(b => b.id === backupId);

    if (!entry) {
      vscode.window.showErrorMessage(`LangShift: No backup found with id ${backupId}.`);
      return false;
    }
    if (!fs.existsSync(entry.backupPath)) {
      vscode.window.showErrorMessage(`LangShift: Backup file is missing (${entry.backupPath}).`);
      return false;
    }

    const content = fs.readFileSync(entry.backupPath, 'utf8');

    // Atomic restore: write to tmp then rename
    const tmp = entry.originalPath + '.langshift-restore.tmp';
    try {
      fs.writeFileSync(tmp, content, 'utf8');
      fs.renameSync(tmp, entry.originalPath);
    } catch (e: any) {
      try { fs.unlinkSync(tmp); } catch { /* ignore cleanup failure */ }
      vscode.window.showErrorMessage(`LangShift: Restore failed — ${e.message}`);
      return false;
    }

    const doc = await vscode.workspace.openTextDocument(entry.originalPath);
    await vscode.window.showTextDocument(doc);
    return true;
  }

  hasBackup(id: string): boolean {
    return this.all().some(b => b.id === id);
  }

  private all(): BackupEntry[] {
    return this.context.globalState.get<BackupEntry[]>(this.KEY, []);
  }

  private async pruneOld(): Promise<void> {
    const entries = this.all();
    if (entries.length <= this.LIMIT) return;

    // entries[0] = oldest (push appends), entries[last] = newest
    // Keep the NEWEST entries (tail), delete the OLDEST (head)
    const toDelete = entries.slice(0, entries.length - this.LIMIT);
    for (const e of toDelete) {
      try { if (fs.existsSync(e.backupPath)) fs.unlinkSync(e.backupPath); } catch { /* ignore stale backup cleanup failure */ }
    }
    await this.context.globalState.update(this.KEY, entries.slice(entries.length - this.LIMIT));
  }

  private backupDir(filePath: string): string {
    // Put backups at workspace root, not next to the file
    const root = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(filePath))?.uri.fsPath
               ?? path.dirname(filePath);
    return path.join(root, this.DIR);
  }
}
