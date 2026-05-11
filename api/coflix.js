const axios = require("axios");
const cheerio = require("cheerio");
const { Buffer } = require("buffer");

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
};

// --- LOGIQUE DE NORMALISATION (RECOPIÉE) ---
function normalizeCoflixQuery(query) {
    if (!query) return query;
    const replacements = {
        "\u00e0": "a", "\u00e1": "a", "\u00e2": "a", "\u00e3": "a", "\u00e4": "a", "\u00e5": "a",
        "\u00e8": "e", "\u00e9": "e", "\u00ea": "e", "\u00eb": "e",
        "\u00ec": "i", "\u00ed": "i", "\u00ee": "i", "\u00ef": "i",
        "\u00f2": "o", "\u00f3": "o", "\u00f4": "o", "\u00f5": "o", "\u00f6": "o",
        "\u00f9": "u", "\u00fa": "u", "\u00fb": "u", "\u00fc": "u",
        "\u00fd": "y", "\u00ff": "y", "\u00f1": "n", "\u00e7": "c",
        "\u0153": "oe", "\u00e6": "ae", "\u00c0": "A", "\u00c7": "C"
    };
    let normalized = query;
    for (const [special, normal] of Object.entries(replacements)) {
        normalized = normalized.split(special).join(normal);
    }
    return normalized;
}

function calculateTitleSimilarity(title1, title2) {
    if (!title1 || !title2) return 0;
    const t1 = title1.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const t2 = title2.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (t1 === t2) return 1.0;
    if (t2.includes(t1) || t1.includes(t2)) return 0.8;
    return 0;
}

// --- LOGIQUE D'EXTRACTION (RECOPIÉE & ADAPTÉE) ---
async function extractFromIframe(iframeSrc) {
    try {
        const cleanSrc = iframeSrc.replace('&ads=true', '');
        // Bridge AllOrigins pour éviter le 403 sur Vercel
        const bridgeUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(cleanSrc)}`;
        const bridgeRes = await axios.get(bridgeUrl, { timeout: 8000 });
        
        if (bridgeRes.data && bridgeRes.data.contents) {
            const $if = cheerio.load(bridgeRes.data.contents);
            const players = [];
            
            let playerItems = $if('li[onclick*="showVideo"]');
            if (!playerItems.length) playerItems = $if("div li[onclick]");

            playerItems.each((i, el) => {
                const onClick = $if(el).attr('onclick') || "";
                const base64Match = onClick.match(/showVideo\(['"]([^'"]+)['"]/);
                if (base64Match && base64Match[1]) {
                    try {
                        const decoded = Buffer.from(base64Match[1], 'base64').toString('utf-8');
                        const info = $if(el).find("p").text().trim();
                        const quality = $if(el).find("span").text().trim();
                        
                        players.push({
                            name: `${new URL(decoded).hostname.replace('www.', '').split('.')[0].toUpperCase()} - ${info || 'Server'}`,
                            url: decoded,
                            lang: info.toLowerCase().includes("vostfr") ? "VOSTFR" : "VF",
                            quality: quality || "HD"
                        });
                    } catch (e) {}
                }
            });
            return players;
        }
    } catch (e) {
        console.error(`[Coflix] Iframe extract failed: ${e.message}`);
    }
    return [];
}

async function getPlayersFromPage(url) {
    try {
        const response = await axios.get(url, { headers: HEADERS, timeout: 8000 });
        const $ = cheerio.load(response.data);

        let iframe = $("main div div div article div:nth-child(2) div:nth-child(1) aside div div iframe");
        if (!iframe.length) iframe = $("article iframe");
        if (!iframe.length) iframe = $("iframe");

        if (iframe.length > 0) {
            const src = iframe.attr("src");
            if (src && src.includes('lecteurvideo')) {
                return await extractFromIframe(src);
            } else if (src) {
                return [{ name: "Direct", url: src, lang: "VF", quality: "HD" }];
            }
        }
    } catch (e) {
        console.error(`[Coflix] Page extract failed: ${e.message}`);
    }
    return [];
}

// --- HANDLER VERCEL ---
module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const { query, title, type, season, episode, path } = req.query;
    let searchTerm = query || title;
    let s = season, e = episode, t = type;

    // Parsing du path si présent (Vercel rewrite)
    if (path) {
        const parts = path.split('/');
        if (parts[0] === 'tv' || parts[0] === 'movie') t = parts[0];
        if (t === 'tv' && parts.length >= 4) { s = parts[2]; e = parts[3]; }
    }

    if (!searchTerm) return res.status(400).json({ error: "Title missing" });

    try {
        const normalized = normalizeCoflixQuery(searchTerm);
        const searchRes = await axios.get(`https://coflix.date/suggest.php?query=${encodeURIComponent(normalized)}`, { headers: HEADERS });
        
        if (!Array.isArray(searchRes.data)) return res.json({ results: [] });

        const results = searchRes.data.map(item => ({
            title: item.title,
            url: item.url,
            id: item.ID,
            type: item.post_type,
            similarity: calculateTitleSimilarity(searchTerm, item.title)
        })).sort((a, b) => b.similarity - a.similarity);

        const match = results[0];
        if (!match || match.similarity < 0.5) return res.json({ results: [] });

        // Cas SÉRIE
        if (t === 'tv' && s && e) {
            try {
                const apiRes = await axios.get(`https://coflix.date/wp-json/apiflix/v1/series/${match.id}/${s}`, { headers: HEADERS });
                if (apiRes.data && apiRes.data.episodes) {
                    const ep = apiRes.data.episodes.find(ep => parseInt(ep.number) === parseInt(e));
                    if (ep && ep.links) {
                        const epUrl = ep.links.startsWith('http') ? ep.links : `https://coflix.date${ep.links}`;
                        const players = await getPlayersFromPage(epUrl);
                        return res.json({ results: players });
                    }
                }
            } catch (err) {}
            
            // Fallback Slug
            const slug = match.url.split('/').filter(Boolean).pop();
            const fallbackUrl = `https://coflix.date/episode/${slug}-${s}x${e}/`;
            const players = await getPlayersFromPage(fallbackUrl);
            return res.json({ results: players });
        }

        // Cas FILM
        const players = await getPlayersFromPage(match.url);
        return res.json({ results: players });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
