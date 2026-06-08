import * as vscode from 'vscode';
import { CompilerValidator, CompilerResult } from './CompilerValidator';

/**
 * Manages VS Code diagnostic collections for LangShift.
 * Shows compiler errors as squiggly underlines in the editor.
 */
export class DiagnosticsManager {
  private collection: vscode.DiagnosticCollection;

  constructor() {
    this.collection = vscode.languages.createDiagnosticCollection('langshift');
  }

  /**
   * Run compiler validation on a file and show results as diagnostics.
   */
  async validateAndShow(document: vscode.TextDocument, language: string): Promise<CompilerResult | null> {
    if (!CompilerValidator.isSupported(language)) return null;

    const code = document.getText();
    const result = await CompilerValidator.validate(code, language);

    const diagnostics = CompilerValidator.toDiagnostics(result, document);
    this.collection.set(document.uri, diagnostics);

    return result;
  }

  /**
   * Set diagnostics for a specific URI from a pre-computed result.
   */
  setFromResult(uri: vscode.Uri, result: CompilerResult, document: vscode.TextDocument): void {
    const diagnostics = CompilerValidator.toDiagnostics(result, document);
    this.collection.set(uri, diagnostics);
  }

  /**
   * Clear all LangShift diagnostics.
   */
  clear(): void {
    this.collection.clear();
  }

  /**
   * Clear diagnostics for a specific file.
   */
  clearFile(uri: vscode.Uri): void {
    this.collection.delete(uri);
  }

  dispose(): void {
    this.collection.dispose();
  }
}
