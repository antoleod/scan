/**
 * Trie data structure for efficient keyword matching
 * Supports prefix search and substring search
 */
export class Trie {
  private root: TrieNode = { children: new Map(), isWord: false };

  add(word: string): void {
    let node = this.root;
    for (const char of word.toLowerCase()) {
      if (!node.children.has(char)) {
        node.children.set(char, { children: new Map(), isWord: false });
      }
      node = node.children.get(char)!;
    }
    node.isWord = true;
  }

  /**
   * Check if text contains any word in the trie
   * More efficient than regex for many keywords
   */
  hasKeyword(text: string): boolean {
    const lower = text.toLowerCase();
    const words = lower.split(/\s+/);

    for (const word of words) {
      if (this.contains(word)) return true;
    }

    // Also check for substrings (e.g., "ibuprofen" in "taking ibuprofen daily")
    for (let i = 0; i < lower.length; i++) {
      let node = this.root;
      for (let j = i; j < lower.length; j++) {
        const char = lower[j];
        if (!node.children.has(char)) break;
        node = node.children.get(char)!;
        if (node.isWord && (j === lower.length - 1 || !lower[j + 1].match(/[a-z]/))) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Check if exact word is in trie
   */
  contains(word: string): boolean {
    let node = this.root;
    for (const char of word.toLowerCase()) {
      if (!node.children.has(char)) return false;
      node = node.children.get(char)!;
    }
    return node.isWord;
  }

  /**
   * Get all words starting with prefix
   */
  getWordsWithPrefix(prefix: string): string[] {
    let node = this.root;
    for (const char of prefix.toLowerCase()) {
      if (!node.children.has(char)) return [];
      node = node.children.get(char)!;
    }

    const results: string[] = [];
    this.dfsCollect(node, prefix, results);
    return results;
  }

  private dfsCollect(node: TrieNode, prefix: string, results: string[]): void {
    if (node.isWord) {
      results.push(prefix);
    }
    for (const [char, child] of node.children) {
      this.dfsCollect(child, prefix + char, results);
    }
  }
}

interface TrieNode {
  children: Map<string, TrieNode>;
  isWord: boolean;
}

/**
 * Create a trie from an array of words
 */
export function createTrieFromWords(words: string[]): Trie {
  const trie = new Trie();
  for (const word of words) {
    trie.add(word);
  }
  return trie;
}

/**
 * Create a trie from a Set of words
 */
export function createTrieFromSet(words: Set<string>): Trie {
  const trie = new Trie();
  for (const word of words) {
    trie.add(word);
  }
  return trie;
}
