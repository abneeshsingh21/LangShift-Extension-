import { execFileSync } from 'child_process';

export interface MissingImport {
  packageName: string;
  importStatement: string;
  installCommand: string;
}

export class ImportResolver {
  static async resolve(code: string, language: string): Promise<MissingImport[]> {
    const imports = this.extractPackageImports(code, language);
    const missing: MissingImport[] = [];

    for (const imp of imports) {
      if (!this.isSafePackageName(imp.packageName, language)) continue;
      const installed = this.isInstalled(imp.packageName, language);
      if (!installed) {
        missing.push({
          packageName: imp.packageName,
          importStatement: imp.statement,
          installCommand: this.getInstallCommand(imp.packageName, language),
        });
      }
    }

    return missing;
  }

  private static extractPackageImports(code: string, language: string): Array<{ packageName: string; statement: string }> {
    const results: Array<{ packageName: string; statement: string }> = [];
    const lines = code.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();

      switch (language) {
        case 'JavaScript':
        case 'TypeScript': {
          // import X from 'package' (NOT relative ./)
          const esm = trimmed.match(/(?:import|export).*from\s+['"]([^./][^'"]*)['"]/);
          if (esm) {
            const pkg = esm[1].startsWith('@') ? esm[1].split('/').slice(0, 2).join('/') : esm[1].split('/')[0];
            results.push({ packageName: pkg, statement: trimmed });
          }
          // const X = require('package')
          const cjs = trimmed.match(/require\(['"]([^./][^'"]*)['"]\)/);
          if (cjs) {
            const pkg = cjs[1].startsWith('@') ? cjs[1].split('/').slice(0, 2).join('/') : cjs[1].split('/')[0];
            results.push({ packageName: pkg, statement: trimmed });
          }
          break;
        }
        case 'Python': {
          // import package / from package import X
          const pyImp = trimmed.match(/^(?:from\s+|import\s+)([a-zA-Z_][a-zA-Z0-9_]*)/);
          if (pyImp) {
            // Skip stdlib modules
            const STDLIB = new Set(['os', 'sys', 'math', 'json', 're', 'datetime', 'collections', 'itertools', 'functools', 'typing', 'pathlib', 'io', 'csv', 'hashlib', 'logging', 'unittest', 'threading', 'multiprocessing', 'socket', 'http', 'urllib', 'abc', 'copy', 'enum', 'dataclasses', 'contextlib', 'subprocess', 'shutil', 'tempfile', 'glob', 'argparse', 'time', 'random', 'string', 'struct', 'textwrap', 'traceback', 'warnings', 'weakref', 'xml', 'zipfile', 'base64', 'binascii', 'codecs', 'configparser', 'decimal', 'fractions', 'heapq', 'inspect', 'operator', 'pickle', 'pprint', 'queue', 'signal', 'sqlite3', 'statistics', 'uuid']);
            if (!STDLIB.has(pyImp[1])) {
              results.push({ packageName: pyImp[1], statement: trimmed });
            }
          }
          break;
        }
        case 'Go': {
          const goImp = trimmed.match(/^\s*"([^.][^"]+)\//);
          if (goImp) {
            // Full module path
            const modMatch = trimmed.match(/"([^"]+)"/);
            if (modMatch) results.push({ packageName: modMatch[1], statement: trimmed });
          }
          break;
        }
        case 'Rust': {
          const rustImp = trimmed.match(/^use\s+([a-z_][a-z0-9_]*)/);
          if (rustImp) {
            const STDLIB = new Set(['std', 'core', 'alloc', 'collections', 'test']);
            if (!STDLIB.has(rustImp[1])) {
              results.push({ packageName: rustImp[1], statement: trimmed });
            }
          }
          break;
        }
        case 'Java': {
          const javaImp = trimmed.match(/^import\s+([a-z][a-z0-9]*\.)/)
          if (javaImp) {
            // Skip java. and javax.
            if (!trimmed.startsWith('import java.') && !trimmed.startsWith('import javax.')) {
              const pkg = trimmed.match(/^import\s+([\w.]+)/);
              if (pkg) results.push({ packageName: pkg[1], statement: trimmed });
            }
          }
          break;
        }
      }
    }

    // Deduplicate by package name
    const seen = new Set<string>();
    return results.filter(r => {
      if (seen.has(r.packageName)) return false;
      seen.add(r.packageName);
      return true;
    });
  }

  private static isInstalled(packageName: string, language: string): boolean {
    if (!this.isSafePackageName(packageName, language)) return false;

    try {
      switch (language) {
        case 'JavaScript':
        case 'TypeScript':
          // Check node_modules
          execFileSync('npm', ['ls', packageName, '--depth=0'], { encoding: 'utf8', stdio: 'pipe', timeout: 5000 });
          return true;
        case 'Python':
          execFileSync('python', ['-c', `import ${packageName}`], { encoding: 'utf8', stdio: 'pipe', timeout: 5000 });
          return true;
        case 'Go':
          execFileSync('go', ['list', packageName], { encoding: 'utf8', stdio: 'pipe', timeout: 5000 });
          return true;
        default:
          return true; // Assume installed for unsupported languages
      }
    } catch {
      return false;
    }
  }

  private static getInstallCommand(packageName: string, language: string): string {
    switch (language) {
      case 'JavaScript':
      case 'TypeScript': return `npm install ${packageName}`;
      case 'Python':     return `pip install ${packageName}`;
      case 'Go':         return `go get ${packageName}`;
      case 'Rust':       return `cargo add ${packageName}`;
      case 'Ruby':       return `gem install ${packageName}`;
      case 'PHP':        return `composer require ${packageName}`;
      case 'Java':       return `<!-- Add to pom.xml or build.gradle -->`;
      default:           return `Install ${packageName} manually`;
    }
  }

  private static isSafePackageName(packageName: string, language: string): boolean {
    switch (language) {
      case 'JavaScript':
      case 'TypeScript':
        return /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/i.test(packageName);
      case 'Python':
        return /^[A-Za-z_][A-Za-z0-9_]*$/.test(packageName);
      case 'Go':
        return /^[A-Za-z0-9][A-Za-z0-9._~:/-]*$/.test(packageName);
      case 'Rust':
      case 'Ruby':
      case 'PHP':
        return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(packageName);
      case 'Java':
        return /^[A-Za-z_][A-Za-z0-9_.]*$/.test(packageName);
      default:
        return /^[A-Za-z0-9][A-Za-z0-9._@:/-]*$/.test(packageName);
    }
  }
}
