import type { SearchResult } from './types.js';

/**
 * Aggressive normalization of titles for Coflix
 */
export function normalizeTitle(query: string): string {
    if (!query) return "";

    const replacements: Record<string, string> = {
        "\u00e0": "a", "\u00e1": "a", "\u00e2": "a", "\u00e3": "a", "\u00e4": "a", "\u00e5": "a",
        "\u00e8": "e", "\u00e9": "e", "\u00ea": "e", "\u00eb": "e",
        "\u00ec": "i", "\u00ed": "i", "\u00ee": "i", "\u00ef": "i",
        "\u00f2": "o", "\u00f3": "o", "\u00f4": "o", "\u00f5": "o", "\u00f6": "o",
        "\u00f9": "u", "\u00fa": "u", "\u00fb": "u", "\u00fc": "u",
        "\u00fd": "y", "\u00ff": "y", "\u00f1": "n", "\u00e7": "c",
        "\u0153": "oe", "\u00e6": "ae",
        "\u00c0": "A", "\u00c1": "A", "\u00c2": "A", "\u00c3": "A", "\u00c4": "A", "\u00c5": "A",
        "\u00c8": "E", "\u00c9": "E", "\u00ca": "E", "\u00cb": "E",
        "\u00cc": "I", "\u00cd": "I", "\u00ce": "I", "\u00cf": "I",
        "\u00d2": "O", "\u00d3": "O", "\u00d4": "O", "\u00d5": "O", "\u00d6": "O",
        "\u00d9": "U", "\u00da": "U", "\u00db": "U", "\u00dc": "U",
        "\u00dd": "Y", "\u0178": "Y", "\u00d1": "N", "\u00c7": "C",
        "\u0152": "OE", "\u00c6": "AE"
    };

    let normalized = query;
    for (const [special, normal] of Object.entries(replacements)) {
        normalized = normalized.split(special).join(normal);
    }

    return normalized.toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .replace(/\s+/g, " ")
        .trim();
}

/**
 * Enhanced similarity calculation inspired by legacy code
 */
export function calculateSimilarity(s1: string, s2: string): number {
    const norm1 = normalizeTitle(s1);
    const norm2 = normalizeTitle(s2);

    if (norm1 === norm2) return 1.0;

    // Check for exact number matches (Critical for sequels)
    const extractNumbers = (str: string) => (str.match(/\b\d+\b/g) || []).map(n => parseInt(n));
    const nums1 = extractNumbers(norm1);
    const nums2 = extractNumbers(norm2);

    if (nums1.length > 0 || nums2.length > 0) {
        const common = nums1.filter(n => nums2.includes(n));
        if (common.length === 0 && (nums1.length > 0 && nums2.length > 0)) {
            return 0.2; // Numbers mismatch is a strong negative signal
        }
    }

    // Boost if one is a prefix of another
    if (norm2.startsWith(norm1) || norm1.startsWith(norm2)) {
        const ratio = Math.min(norm1.length, norm2.length) / Math.max(norm1.length, norm2.length);
        return 0.8 + (ratio * 0.15);
    }

    // Word based similarity
    const words1 = norm1.split(' ').filter(w => w.length > 2);
    const words2 = norm2.split(' ').filter(w => w.length > 2);
    
    if (words1.length === 0 || words2.length === 0) return 0;

    let matches = 0;
    words1.forEach(w => {
        if (words2.some(w2 => w2.includes(w) || w.includes(w2))) {
            matches++;
        }
    });

    const score = matches / Math.max(words1.length, words2.length);
    return score;
}

/**
 * Rank results based on title similarity and release year
 */
export function rankResults(results: SearchResult[], targetTitle: string, targetYear?: string): SearchResult[] {
    const scored = results.map(res => {
        let score = calculateSimilarity(targetTitle, res.title);
        
        // Year bonus/penalty
        if (targetYear && res.releaseYear) {
            if (res.releaseYear === targetYear) {
                score += 0.1;
            } else {
                score -= 0.3;
            }
        }

        return { ...res, score: Math.min(score, 1.0) };
    });

    return scored
        .filter(res => (res.score || 0) > 0.4)
        .sort((a, b) => (b.score || 0) - (a.score || 0));
}
