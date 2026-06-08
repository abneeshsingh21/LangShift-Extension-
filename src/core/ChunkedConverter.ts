export interface ChunkResult {
  index: number;
  originalChunk: string;
  convertedChunk: string;
}

/**
 * Split large source files into logical chunks for conversion.
 * This helps with:
 * - Files that exceed AI token limits
 * - Better accuracy on very long files
 * - Progress reporting per chunk
 */
export class ChunkedConverter {
  private static readonly MAX_LINES_PER_CHUNK = 200;
  private static readonly MIN_LINES_FOR_CHUNKING = 400;

  /**
   * Determine if a file should be chunked.
   */
  static shouldChunk(code: string): boolean {
    return code.split('\n').length > this.MIN_LINES_FOR_CHUNKING;
  }

  /**
   * Split code into logical chunks at class/function boundaries.
   */
  static split(code: string, language: string): string[] {
    const lines = code.split('\n');
    if (lines.length <= this.MIN_LINES_FOR_CHUNKING) return [code];

    const chunks: string[] = [];
    let currentChunk: string[] = [];
    const headerLines: string[] = []; // imports, package declarations
    let inHeader = true;

    // Patterns that indicate a logical break point
    const breakPatterns = this.getBreakPatterns(language);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Collect header (imports, package, module declarations)
      if (inHeader) {
        if (this.isHeaderLine(trimmed, language)) {
          headerLines.push(line);
          continue;
        }
        if (trimmed === '' && currentChunk.length === 0) {
          headerLines.push(line);
          continue;
        }
        inHeader = false;
      }

      currentChunk.push(line);

      // Check if we should split here
      if (currentChunk.length >= this.MAX_LINES_PER_CHUNK) {
        // Look for a good break point within the next 20 lines
        const breakAt = this.findBreakPoint(lines, i + 1, breakPatterns);
        if (breakAt > i) {
          // Add lines until break point
          for (let j = i + 1; j <= breakAt; j++) {
            currentChunk.push(lines[j]);
          }
          i = breakAt;
        }
        chunks.push(this.assembleChunk(headerLines, currentChunk));
        currentChunk = [];
      }
    }

    if (currentChunk.length > 0) {
      chunks.push(this.assembleChunk(headerLines, currentChunk));
    }

    return chunks.length > 0 ? chunks : [code];
  }

  /**
   * Reassemble converted chunks, removing duplicate headers.
   */
  static reassemble(chunks: string[], language: string): string {
    if (chunks.length <= 1) return chunks[0] || '';

    const firstChunk = chunks[0];
    const restChunks = chunks.slice(1).map(chunk => {
      // Remove duplicate imports/headers from subsequent chunks
      const lines = chunk.split('\n');
      const bodyStart = lines.findIndex(l => !this.isHeaderLine(l.trim(), language) && l.trim() !== '');
      return bodyStart > 0 ? lines.slice(bodyStart).join('\n') : chunk;
    });

    return [firstChunk, ...restChunks].join('\n\n');
  }

  private static assembleChunk(header: string[], body: string[]): string {
    if (header.length === 0) return body.join('\n');
    return [...header, '', ...body].join('\n');
  }

  private static isHeaderLine(line: string, language: string): boolean {
    if (line === '') return false;
    switch (language) {
      case 'Python':
        return /^(import |from |#!|"""|''')/.test(line);
      case 'JavaScript': case 'TypeScript': case 'JSX': case 'TSX':
        return /^(import |export .* from |const .* = require|'use strict')/.test(line);
      case 'Java': case 'Kotlin': case 'Scala':
        return /^(package |import )/.test(line);
      case 'Go':
        return /^(package |import )/.test(line);
      case 'Rust':
        return /^(use |mod |extern crate )/.test(line);
      case 'C': case 'C++':
        return /^(#include |#pragma |#define |#ifndef |#ifdef |using namespace)/.test(line);
      case 'C#':
        return /^(using |namespace )/.test(line);
      case 'Ruby':
        return /^(require |require_relative |gem )/.test(line);
      case 'PHP':
        return /^(<\?php|use |namespace |require|include)/.test(line);
      default:
        return /^(import |from |require |use |include |#include )/.test(line);
    }
  }

  private static getBreakPatterns(language: string): RegExp[] {
    const common = [/^\s*$/, /^\s*\/\//,  /^\s*#/]; // Blank lines, comments
    switch (language) {
      case 'Python':
        return [...common, /^class /, /^def /, /^async def /];
      case 'JavaScript': case 'TypeScript': case 'JSX': case 'TSX':
        return [...common, /^export /, /^class /, /^function /, /^const .* = /, /^async function /];
      case 'Java': case 'Kotlin': case 'C#':
        return [...common, /^\s*(public|private|protected|internal) /, /^\s*class /, /^\s*interface /];
      case 'Go':
        return [...common, /^func /, /^type /];
      case 'Rust':
        return [...common, /^pub /, /^fn /, /^impl /, /^struct /, /^enum /];
      default:
        return common;
    }
  }

  private static findBreakPoint(lines: string[], startIdx: number, patterns: RegExp[]): number {
    const searchLimit = Math.min(startIdx + 20, lines.length);
    for (let i = startIdx; i < searchLimit; i++) {
      const line = lines[i];
      if (patterns.some(p => p.test(line))) return i - 1;
    }
    return startIdx; // No good break found, break here
  }
}
