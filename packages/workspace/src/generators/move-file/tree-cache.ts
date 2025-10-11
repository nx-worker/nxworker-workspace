import { Tree } from '@nx/devkit';

/**
 * In-memory cache for Tree read operations to reduce File I/O overhead.
 *
 * This cache stores the results of tree.read() and tree.children() calls
 * to avoid redundant File I/O. The cache is invalidated when files are modified.
 *
 * This optimization targets the 30-40% of time spent on File I/O operations
 * and complements existing caching strategies:
 * - AST caching (parsed ASTs and content)
 * - File existence caching (tree.exists results)
 * - Project source files caching (file lists per project)
 */
class TreeReadCache {
  private contentCache = new Map<string, string | null>();
  private childrenCache = new Map<string, string[]>();

  /**
   * Cached wrapper for tree.read()
   * @param tree - The Tree instance
   * @param filePath - Path to the file
   * @param encoding - File encoding
   * @returns File content or null if file doesn't exist
   */
  read(
    tree: Tree,
    filePath: string,
    encoding: BufferEncoding = 'utf-8',
  ): string | null {
    // Check cache first
    const cached = this.contentCache.get(filePath);
    if (cached !== undefined) {
      return cached;
    }

    // Read from tree and cache result
    const content = tree.read(filePath, encoding);
    this.contentCache.set(filePath, content);

    return content;
  }

  /**
   * Cached wrapper for tree.children()
   * @param tree - The Tree instance
   * @param dirPath - Directory path
   * @returns Array of child file/directory names
   */
  children(tree: Tree, dirPath: string): string[] {
    // Check cache first
    const cached = this.childrenCache.get(dirPath);
    if (cached !== undefined) {
      return cached;
    }

    // Get children from tree and cache result
    const children = tree.children(dirPath);
    this.childrenCache.set(dirPath, children);
    return children;
  }

  /**
   * Invalidates cache entry for a file after it's been written
   * @param filePath - Path to invalidate
   */
  invalidateFile(filePath: string): void {
    this.contentCache.delete(filePath);
  }

  /**
   * Invalidates cache entry for a directory
   * @param dirPath - Directory path to invalidate
   */
  invalidateDirectory(dirPath: string): void {
    this.childrenCache.delete(dirPath);
  }

  /**
   * Clears all caches. Should be called when starting a new operation.
   */
  clear(): void {
    this.contentCache.clear();
    this.childrenCache.clear();
  }

  /**
   * Returns cache statistics for monitoring/debugging
   */
  getStats(): {
    contentCacheSize: number;
    childrenCacheSize: number;
  } {
    return {
      contentCacheSize: this.contentCache.size,
      childrenCacheSize: this.childrenCache.size,
    };
  }
}

// Export a singleton instance for use across the move operation
export const treeReadCache = new TreeReadCache();
