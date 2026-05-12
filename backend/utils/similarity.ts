import type { SearchResult } from './types.js';

/**
 * Aggressive normalization of titles
 */
export function normalizeTitle(title: string): string {
    if (!title) return "";
    
    // Mapping of special/accented characters
    const replacements: Record<string, string> = {
        'œ': 'oe',
        'æ': 'ae',
        'é': 'e', 'è': 'e', 'ê': 'e', 'ë': 'e',
        'à': 'a', 'â': 'a', 'ä': 'a',
        'î': 'i', 'ï': 'i',
        'ô': 'o', 'ö': 'o',
        'ù': 'u', 'û': 'u', 'ü': 'u',
        'ç': 'c',
        'ñ': 'n',
        'ÿ': 'y'
    };

    let result = title.toLowerCase();
    
    for (const [char, rep] of Object.entries(replacements)) {
        result = result.split(char).join(rep);
    }

    // Convert Roman numerals to numbers (basic support for sequels)
    result = result
        .replace(/\s+iii\b/g, ' 3')
        .replace(/\s+ii\b/g, ' 2')
        .replace(/\s+iv\b/g, ' 4')
        .replace(/\s+v\b/g, ' 5');

    // Remove non-alphanumeric (except spaces) and extra whitespace
    return result
        .replace(/[^\w\s]/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Similarity algorithm (The "Brain")
 * Returns a score from 0 to 1
 */
export function calculateSimilarity(query: string, target: string, releaseYear?: string, targetYear?: string): number {
    const q = normalizeTitle(query);
    const tRaw = normalizeTitle(target);
    
    // Handle subtitles (e.g., "Movie : Subtitle" -> compare only "Movie" if needed)
    const tParts = target.toLowerCase().split(/[:|]/);
    const tMain = normalizeTitle(tParts[0]);
    
    if (q === tRaw || q === tMain) return 1.0;

    let score = 0;
    
    // 1. Year match (Critical: +0.4)
    if (releaseYear && targetYear) {
        const y1 = releaseYear.toString();
        const y2 = targetYear.toString();
        if (y1 === y2) {
            score += 0.4;
        } else {
            // Check if off by 1 year (sometimes release dates differ by country)
            if (Math.abs(parseInt(y1) - parseInt(y2)) <= 1) {
                score += 0.2;
            } else {
                // Only punish heavily if titles don't match perfectly
                if (q !== tRaw && q !== tMain) {
                    score -= 0.3;
                }
            }
        }
    }

    // 2. Keyword correspondence and order (+0.4)
    const qWords = q.split(' ').filter(w => w.length > 1);
    const tWords = tRaw.split(' ').filter(w => w.length > 1);
    
    if (qWords.length === 0) return 0;
    
    let matches = 0;
    let orderScore = 0;
    
    qWords.forEach((word, idx) => {
        const targetIdx = tWords.indexOf(word);
        if (targetIdx !== -1) {
            matches++;
            // Check if word order is similar
            if (Math.abs(idx - targetIdx) <= 1) orderScore += 1;
        }
    });
    
    const keywordMatchRatio = matches / qWords.length;
    const orderMatchRatio = qWords.length > 1 ? orderScore / (qWords.length - 1) : 1;
    
    // Bonus for matching specific movie titles or locations (villes)
    score += (keywordMatchRatio * 0.30) + (orderMatchRatio * 0.10);

    // 3. Length proportion (+0.2)
    const lengthSim = 1 - Math.abs(q.length - tRaw.length) / Math.max(q.length, tRaw.length);
    score += lengthSim * 0.2;

    // 4. Exact prefix match bonus
    if (tRaw.startsWith(q)) score += 0.1;

    return Math.max(0, Math.min(1, score));
}

/**
 * Filter and rank results by confidence
 */
export function rankResults(results: SearchResult[], query: string, year?: string): SearchResult[] {
    return results
        .map(res => ({
            ...res,
            score: calculateSimilarity(query, res.title, year, res.releaseYear)
        }))
        .filter(res => (res.score || 0) > 0.6) // Lower threshold for "potential" matches
        .sort((a, b) => (b.score || 0) - (a.score || 0));
}
