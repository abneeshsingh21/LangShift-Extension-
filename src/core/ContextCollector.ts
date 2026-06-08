import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export interface ContextFile {
  relativePath: string;
  content: string;
}

export class ContextCollector {
  static readonly MAX_CONTEXT_FILES = 5;
  static readonly MAX_LINES_PER_FILE = 200;

  static async collect(
    fileUri: vscode.Uri,
    fromLang: string,
    maxFiles = this.MAX_CONTEXT_FILES,
    maxLinesPerFile = this.MAX_LINES_PER_FILE,
  ): Promise<ContextFile[]> {
    const sourceCode = fs.readFileSync(fileUri.fsPath, 'utf8');
    const dir = path.dirname(fileUri.fsPath);
    const imports = this.extractImports(sourceCode, fromLang);
    const contextFiles: ContextFile[] = [];

    for (const imp of imports) {
      if (contextFiles.length >= maxFiles) break;
      const resolved = this.resolveImport(imp, dir, fromLang);
      if (resolved && fs.existsSync(resolved)) {
        try {
          const content = fs.readFileSync(resolved, 'utf8');
          const trimmed = content.split('\n').slice(0, maxLinesPerFile).join('\n');
          contextFiles.push({ relativePath: path.relative(dir, resolved), content: trimmed });
        } catch { /* skip unreadable files */ }
      }
    }

    return contextFiles;
  }

  private static extractImports(code: string, lang: string): string[] {
    const imports: string[] = [];
    const lines = code.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      switch (lang) {
        case 'Python': {
          // from foo import bar OR import foo
          const fromMatch = trimmed.match(/^from\s+(\.{0,2}\w[\w.]*)\s+import/);
          if (fromMatch) imports.push(fromMatch[1]);
          const impMatch = trimmed.match(/^import\s+(\.{0,2}\w[\w.]*)/);
          if (impMatch && !impMatch[1].startsWith('__')) imports.push(impMatch[1]);
          break;
        }
        case 'JavaScript':
        case 'TypeScript':
        case 'JSX': {
          // import X from './foo' OR require('./foo')
          const esMatch = trimmed.match(/(?:import|export).*from\s+['"](\.{1,2}\/[^'"]+)['"]/);
          if (esMatch) imports.push(esMatch[1]);
          const reqMatch = trimmed.match(/require\(['"](\.{1,2}\/[^'"]+)['"]\)/);
          if (reqMatch) imports.push(reqMatch[1]);
          break;
        }
        case 'Go': {
          const goMatch = trimmed.match(/^\s*"(\.\/.+)"/);
          if (goMatch) imports.push(goMatch[1]);
          break;
        }
        case 'Java':
        case 'Kotlin':
        case 'Scala': {
          // import com.foo.Bar → look for Bar.java in same dir
          const jMatch = trimmed.match(/^import\s+[\w.]+\.(\w+)\s*;?/);
          if (jMatch) imports.push(jMatch[1]);
          break;
        }
        case 'Rust': {
          const rustMatch = trimmed.match(/^(?:use|mod)\s+(\w+)/);
          if (rustMatch) imports.push(rustMatch[1]);
          break;
        }
        case 'C':
        case 'C++': {
          const cMatch = trimmed.match(/^#include\s+"([^"]+)"/);
          if (cMatch) imports.push(cMatch[1]);
          break;
        }
        case 'Ruby': {
          const rbMatch = trimmed.match(/^require(?:_relative)?\s+['"](.+)['"]/);
          if (rbMatch) imports.push(rbMatch[1]);
          break;
        }
        case 'PHP': {
          const phpMatch = trimmed.match(/^(?:require|include)(?:_once)?\s+['"](.+)['"]/);
          if (phpMatch) imports.push(phpMatch[1]);
          break;
        }
      }
    }

    // Deduplicate
    return [...new Set(imports)];
  }

  private static resolveImport(imp: string, dir: string, lang: string): string | null {
    // For relative imports in JS/TS/Go/C/C++/Ruby/PHP, resolve directly
    if (imp.startsWith('./') || imp.startsWith('../')) {
      const extensions = this.getExtensions(lang);
      // Try exact path first
      const exact = path.resolve(dir, imp);
      if (fs.existsSync(exact)) return exact;
      // Try with extensions
      for (const ext of extensions) {
        const withExt = path.resolve(dir, imp + ext);
        if (fs.existsSync(withExt)) return withExt;
        // Try index file
        const indexFile = path.resolve(dir, imp, 'index' + ext);
        if (fs.existsSync(indexFile)) return indexFile;
      }
      return null;
    }

    // For Python dotted imports: foo.bar → foo/bar.py or foo/bar/__init__.py
    if (lang === 'Python') {
      const parts = imp.split('.');
      const asPath = path.resolve(dir, ...parts);
      if (fs.existsSync(asPath + '.py')) return asPath + '.py';
      if (fs.existsSync(path.join(asPath, '__init__.py'))) return path.join(asPath, '__init__.py');
      return null;
    }

    // For Java/Kotlin: look for ClassName.java in same directory
    if (lang === 'Java' || lang === 'Kotlin' || lang === 'Scala') {
      const ext = lang === 'Java' ? '.java' : lang === 'Kotlin' ? '.kt' : '.scala';
      const filePath = path.resolve(dir, imp + ext);
      if (fs.existsSync(filePath)) return filePath;
      return null;
    }

    // For Rust: look for mod_name.rs
    if (lang === 'Rust') {
      const filePath = path.resolve(dir, imp + '.rs');
      if (fs.existsSync(filePath)) return filePath;
      const modPath = path.resolve(dir, imp, 'mod.rs');
      if (fs.existsSync(modPath)) return modPath;
      return null;
    }

    // For C/C++ quoted includes
    if (lang === 'C' || lang === 'C++') {
      const filePath = path.resolve(dir, imp);
      if (fs.existsSync(filePath)) return filePath;
      return null;
    }

    return null;
  }

  private static getExtensions(lang: string): string[] {
    switch (lang) {
      case 'JavaScript': return ['.js', '.mjs', '.cjs'];
      case 'TypeScript': return ['.ts', '.tsx'];
      case 'JSX': return ['.jsx', '.js'];
      case 'Python': return ['.py'];
      case 'Go': return ['.go'];
      case 'Ruby': return ['.rb'];
      case 'PHP': return ['.php'];
      default: return [];
    }
  }
}
