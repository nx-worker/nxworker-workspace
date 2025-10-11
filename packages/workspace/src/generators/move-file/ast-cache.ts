import { Tree, logger } from '@nx/devkit';
import * as jscodeshift from 'jscodeshift';
import type { Collection } from 'jscodeshift';

// Create parser instance once and reuse it for better performance
const j = jscodeshift.withParser('tsx');

/**
 * Cache for storing parsed ASTs to avoid re-parsing files during a move operation.
 * This is particularly beneficial when multiple update operations touch the same files.
 */
class ASTCache {
  private contentCache = new Map<string, string>();
  private astCache = new Map<string, Collection>();
  private parseAttempts = new Map<string, boolean>(); // Track files that failed to parse

  /**
   * Gets the file content, using cache if available.
   */
  getContent(tree: Tree, filePath: string): string | null {
    // Check cache first
    const cached = this.contentCache.get(filePath);
    if (cached !== undefined) {
      return cached;
    }

    // Read from tree
    const content = tree.read(filePath, 'utf-8');
    if (!content) {
      return null;
    }

    // Cache the content
    this.contentCache.set(filePath, content);
    return content;
  }

  /**
   * Gets the parsed AST for a file, using cache if available.
   * Returns null if the file cannot be parsed or doesn't exist.
   */
  getAST(tree: Tree, filePath: string): Collection | null {
    // Check if this file previously failed to parse
    if (this.parseAttempts.get(filePath) === false) {
      return null;
    }

    // Check cache first
    const cached = this.astCache.get(filePath);
    if (cached !== undefined) {
      return cached;
    }

    // Get content (from cache or read)
    const content = this.getContent(tree, filePath);
    if (!content || content.trim().length === 0) {
      return null;
    }

    // Try to parse
    try {
      const ast = j(content);
      this.astCache.set(filePath, ast);
      this.parseAttempts.set(filePath, true);
      return ast;
    } catch (error) {
      // Mark as failed to avoid repeated parse attempts
      this.parseAttempts.set(filePath, false);
      logger.warn(
        `Unable to parse ${filePath}. Caching parse failure. Error: ${error}`,
      );
      return null;
    }
  }

  /**
   * Invalidates the cache entry for a file after it has been modified.
   * This ensures subsequent reads get the updated content.
   */
  invalidate(filePath: string): void {
    this.contentCache.delete(filePath);
    this.astCache.delete(filePath);
    this.parseAttempts.delete(filePath);
  }

  /**
   * Clears all cached data. Useful when starting a new move operation.
   */
  clear(): void {
    this.contentCache.clear();
    this.astCache.clear();
    this.parseAttempts.clear();
  }

  /**
   * Returns cache statistics for monitoring/debugging.
   */
  getStats(): {
    contentCacheSize: number;
    astCacheSize: number;
    failedParseCount: number;
  } {
    let failedParseCount = 0;
    for (const failed of this.parseAttempts.values()) {
      if (!failed) failedParseCount++;
    }

    return {
      contentCacheSize: this.contentCache.size,
      astCacheSize: this.astCache.size,
      failedParseCount,
    };
  }
}

// Export a singleton instance for use across the move operation
export const astCache = new ASTCache();

// Export the parser for direct use where needed
export { j };
