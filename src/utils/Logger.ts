import * as vscode from 'vscode';

type Level = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

const LEVEL_PRIORITY: Record<Level, number> = {
  DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3,
};

export class Logger {
  private channel: vscode.OutputChannel;
  private minLevel: Level = 'INFO';

  constructor(context: vscode.ExtensionContext) {
    this.channel = vscode.window.createOutputChannel('LangShift');
    context.subscriptions.push(this.channel);
  }

  setLevel(level: Level): void {
    this.minLevel = level;
  }

  debug(msg: string): void { this.log('DEBUG', msg); }
  info (msg: string): void { this.log('INFO',  msg); }
  warn (msg: string): void { this.log('WARN',  msg); }
  error(msg: string, err?: Error | unknown): void {
    this.log('ERROR', msg);
    if (err instanceof Error && err.stack) {
      this.channel.appendLine(`  Stack: ${err.stack}`);
    }
  }

  show(): void { this.channel.show(true); }

  private log(level: Level, msg: string): void {
    if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[this.minLevel]) return;
    const ts   = new Date().toISOString();
    const line = `[${ts}] [${level.padEnd(5)}] ${msg}`;
    this.channel.appendLine(line);
    if (level === 'ERROR') console.error(`LangShift: ${msg}`);
    if (level === 'WARN')  console.warn(`LangShift: ${msg}`);
  }
}
