import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';

export interface CompilerResult {
  success: boolean;
  language: string;
  compiler: string;
  errors: CompilerError[];
  rawOutput: string;
}

export interface CompilerError {
  line?: number;
  column?: number;
  message: string;
  severity: 'error' | 'warning';
}

interface CompilerSpec {
  command: (filePath: string) => string;
  parseErrors: (output: string) => CompilerError[];
  extension: string;
  name: string;
}

const COMPILERS: Record<string, CompilerSpec> = {
  TypeScript: {
    command: (f) => `npx tsc --noEmit --strict "${f}"`,
    extension: '.ts',
    name: 'tsc',
    parseErrors: (output) => {
      const errors: CompilerError[] = [];
      for (const line of output.split('\n')) {
        const m = line.match(/\((\d+),(\d+)\):\s*(error|warning)\s+TS\d+:\s*(.+)/);
        if (m) errors.push({ line: parseInt(m[1]), column: parseInt(m[2]), message: m[4], severity: m[3] as 'error' | 'warning' });
      }
      return errors;
    },
  },
  Java: {
    command: (f) => `javac -d "${os.tmpdir()}" "${f}"`,
    extension: '.java',
    name: 'javac',
    parseErrors: (output) => {
      const errors: CompilerError[] = [];
      for (const line of output.split('\n')) {
        const m = line.match(/:?(\d+):\s*(error|warning):\s*(.+)/);
        if (m) errors.push({ line: parseInt(m[1]), message: m[3], severity: m[2] as 'error' | 'warning' });
      }
      return errors;
    },
  },
  Go: {
    command: (f) => `go build -o "${os.tmpdir()}${path.sep}langshift_check" "${f}"`,
    extension: '.go',
    name: 'go build',
    parseErrors: (output) => {
      const errors: CompilerError[] = [];
      for (const line of output.split('\n')) {
        const m = line.match(/:?(\d+)(?::(\d+))?:\s*(.+)/);
        if (m) errors.push({ line: parseInt(m[1]), column: m[2] ? parseInt(m[2]) : undefined, message: m[3], severity: 'error' });
      }
      return errors;
    },
  },
  Rust: {
    command: (f) => `rustc --edition 2021 --crate-type lib "${f}" -o "${os.tmpdir()}${path.sep}langshift_check"`,
    extension: '.rs',
    name: 'rustc',
    parseErrors: (output) => {
      const errors: CompilerError[] = [];
      for (const line of output.split('\n')) {
        const m = line.match(/^(error|warning)(?:\[E\d+\])?:\s*(.+)/);
        if (m) errors.push({ message: m[2], severity: m[1] as 'error' | 'warning' });
        const locM = line.match(/--> .+:(\d+):(\d+)/);
        if (locM && errors.length > 0) {
          errors[errors.length - 1].line = parseInt(locM[1]);
          errors[errors.length - 1].column = parseInt(locM[2]);
        }
      }
      return errors;
    },
  },
  'C++': {
    command: (f) => `g++ -fsyntax-only -std=c++17 "${f}"`,
    extension: '.cpp',
    name: 'g++',
    parseErrors: (output) => {
      const errors: CompilerError[] = [];
      for (const line of output.split('\n')) {
        const m = line.match(/:?(\d+):(\d+):\s*(error|warning):\s*(.+)/);
        if (m) errors.push({ line: parseInt(m[1]), column: parseInt(m[2]), message: m[4], severity: m[3] as 'error' | 'warning' });
      }
      return errors;
    },
  },
  C: {
    command: (f) => `gcc -fsyntax-only -std=c11 "${f}"`,
    extension: '.c',
    name: 'gcc',
    parseErrors: (output) => {
      const errors: CompilerError[] = [];
      for (const line of output.split('\n')) {
        const m = line.match(/:?(\d+):(\d+):\s*(error|warning):\s*(.+)/);
        if (m) errors.push({ line: parseInt(m[1]), column: parseInt(m[2]), message: m[4], severity: m[3] as 'error' | 'warning' });
      }
      return errors;
    },
  },
  Python: {
    command: (f) => `python -m py_compile "${f}"`,
    extension: '.py',
    name: 'python',
    parseErrors: (output) => {
      const errors: CompilerError[] = [];
      for (const line of output.split('\n')) {
        const m = line.match(/line (\d+)/);
        if (m) errors.push({ line: parseInt(m[1]), message: line.trim(), severity: 'error' });
      }
      return errors;
    },
  },
  'C#': {
    command: (f) => `dotnet build --no-restore "${path.dirname(f)}"`,
    extension: '.cs',
    name: 'dotnet',
    parseErrors: (output) => {
      const errors: CompilerError[] = [];
      for (const line of output.split('\n')) {
        const m = line.match(/\((\d+),(\d+)\):\s*(error|warning)\s+CS\d+:\s*(.+)/);
        if (m) errors.push({ line: parseInt(m[1]), column: parseInt(m[2]), message: m[4], severity: m[3] as 'error' | 'warning' });
      }
      return errors;
    },
  },
};

export class CompilerValidator {
  static isSupported(language: string): boolean {
    return language in COMPILERS;
  }

  static supportedLanguages(): string[] {
    return Object.keys(COMPILERS);
  }

  static async validate(code: string, language: string): Promise<CompilerResult> {
    const spec = COMPILERS[language];
    if (!spec) {
      return { success: true, language, compiler: 'none', errors: [], rawOutput: 'No compiler available for this language.' };
    }

    // Write to a temp file
    const tmpDir = path.join(os.tmpdir(), 'langshift-validate');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const tmpFile = path.join(tmpDir, `validate${spec.extension}`);
    fs.writeFileSync(tmpFile, code, 'utf8');

    try {
      const output = execSync(spec.command(tmpFile), {
        encoding: 'utf8',
        timeout: 30_000,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      return { success: true, language, compiler: spec.name, errors: [], rawOutput: output };
    } catch (e: any) {
      const stderr = e.stderr?.toString() ?? '';
      const stdout = e.stdout?.toString() ?? '';
      const combined = stderr + '\n' + stdout;
      const errors = spec.parseErrors(combined);
      return {
        success: errors.filter(e => e.severity === 'error').length === 0,
        language,
        compiler: spec.name,
        errors,
        rawOutput: combined.trim(),
      };
    } finally {
      // Cleanup temp file
      try { fs.unlinkSync(tmpFile); } catch { /* ignore temp cleanup failure */ }
    }
  }

  static toDiagnostics(result: CompilerResult, _document: vscode.TextDocument): vscode.Diagnostic[] {
    return result.errors.map(err => {
      const line = Math.max(0, (err.line ?? 1) - 1);
      const col = Math.max(0, (err.column ?? 1) - 1);
      const range = new vscode.Range(line, col, line, col + 20);
      const severity = err.severity === 'error'
        ? vscode.DiagnosticSeverity.Error
        : vscode.DiagnosticSeverity.Warning;
      const diag = new vscode.Diagnostic(range, `[${result.compiler}] ${err.message}`, severity);
      diag.source = 'LangShift';
      return diag;
    });
  }
}
