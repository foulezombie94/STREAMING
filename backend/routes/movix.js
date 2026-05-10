const express = require("express");
const router = express.Router();
const axios = require("axios");

const TMDB_API_KEY = process.env.TMDB_API_KEY || "e1a2bb6a3ed288feb5d767908732e751";
const MOVIX_API_URL = "https://api.movix.cash/api";
const MOVIX_MAIN_URL = "https://movix.cash/api";

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "application/json",
  "Referer": "https://movix.cash/",
  "Origin": "https://movix.cash"
};

/**
 * Fetch sources from a specific Movix provider.
 */
async function fetchProviderSources(provider, type, tmdbId, season, episode) {
    const baseUrls = [MOVIX_API_URL, MOVIX_MAIN_URL];
    
    for (const baseUrl of baseUrls) {
        let url = "";
        if (type === "movie") {
            url = `${baseUrl}/${provider}/movie/${tmdbId}`;
        } else {
            url = `${baseUrl}/${provider}/tv/${tmdbId}/s/${season}/e/${episode}`;
        }

        try {
            const res = await axios.get(url, { headers: HEADERS, timeout: 4000 });
            if (res.data && res.data.success) {
                const players = res.data.all || res.data.sources || res.data.player_links || [];
                const found = players.map(p => ({
                    name: p.host_name || p.name || provider,
                    url: p.url || p.link,
                    lang: p.language || p.lang || "VF",
                    quality: p.quality || "HD",
                    provider: provider
                }));
                if (found.length > 0) return found;
            }
        } catch (e) {
            // Silently try next base URL
        }
    }
    return [];
}

/**
 * Fetch links from Frembed (often used by Movix as fallback)
 */
async function fetchFrembedSources(tmdbId) {
    try {
        const url = `https://frembed.click/api/public/v1/movies/${tmdbId}`;
        const res = await axios.get(url, { timeout: 3000 });
        if (res.data && res.data.status === 200 && res.data.result) {
            return [{
                name: "Frembed",
                url: `https://frembed.click/api/film.php?id=${tmdbId}`,
                lang: "VF/VOSTFR",
                quality: "HD",
                provider: "frembed"
            }];
        }
    } catch (e) {}
    return [];
}

router.get("/movie/:tmdbId", async (req, res) => {
    const { tmdbId } = req.params;
    const providers = ["fstream", "wiflix", "cpasmal", "purstream"];
    
    try {
        const results = await Promise.allSettled([
            ...providers.map(p => fetchProviderSources(p, "movie", tmdbId)),
            fetchFrembedSources(tmdbId)
        ]);

        let allSources = [];
        results.forEach(r => { 
            if (r.status === "fulfilled" && Array.isArray(r.value)) {
                allSources = [...allSources, ...r.value]; 
            }
        });

        // Filter out duplicates based on URL
        const uniqueSources = Array.from(new Map(allSources.map(s => [s.url, s])).values());
        
        res.json({
            success: true,
            tmdb_id: tmdbId,
            players: {
                vf: uniqueSources.filter(s => s.lang === "VF" || s.lang === "Français"),
                vostfr: uniqueSources.filter(s => s.lang === "VOSTFR" || s.lang === "VOSTFR")
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get("/tv/:tmdbId/:season/:episode", async (req, res) => {
    const { tmdbId, season, episode } = req.params;
    const providers = ["fstream", "wiflix", "cpasmal", "purstream"];
    
    try {
        const results = await Promise.allSettled(providers.map(p => fetchProviderSources(p, "tv", tmdbId, season, episode)));
        let allSources = [];
        results.forEach(r => { 
            if (r.status === "fulfilled" && Array.isArray(r.value)) {
                allSources = [...allSources, ...r.value]; 
            }
        });

        const uniqueSources = Array.from(new Map(allSources.map(s => [s.url, s])).values());
        
        res.json({
            success: true,
            tmdb_id: tmdbId,
            season,
            episode,
            players: {
                vf: uniqueSources.filter(s => s.lang === "VF"),
                vostfr: uniqueSources.filter(s => s.lang === "VOSTFR")
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
