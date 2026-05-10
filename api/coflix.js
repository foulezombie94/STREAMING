const axios = require('axios');
const cheerio = require('cheerio');

const COFLIX_BASE_URL = "https://coflix.date";
const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Referer": COFLIX_BASE_URL + "/",
    "Origin": COFLIX_BASE_URL
};

function normalizeTitle(title) {
    return title.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w\s]/gi, ' ').replace(/\s+/g, ' ').trim();
}

function getHostName(url) {
    const u = url.toLowerCase();
    if (u.includes("vidoza")) return "Vidoza";
    if (u.includes("uqload")) return "Uqload";
    if (u.includes("upstream")) return "Upstream";
    if (u.includes("dood")) return "DoodStream";
    if (u.includes("streamtape")) return "Streamtape";
    if (u.includes("voe")) return "VOE";
    if (u.includes("mixdrop")) return "MixDrop";
    if (u.includes("evoload")) return "Evoload";
    if (u.includes("sendvid")) return "SendVid";
    if (u.includes("sibnet")) return "Sibnet";
    if (u.includes("ok.ru")) return "OK.ru";
    
    try {
        const domain = new URL(url).hostname.replace('www.', '');
        return domain.charAt(0).toUpperCase() + domain.slice(1);
    } catch (e) {
        return "Direct";
    }
}

async function extractPlayers(pageUrl) {
    if (!pageUrl) return [];
    if (typeof pageUrl === 'object' && pageUrl.url) pageUrl = pageUrl.url;

    try {
        const res = await axios.get(pageUrl, { headers: HEADERS, timeout: 5000 });
        const $ = cheerio.load(res.data);
        let iframeSrc = $("iframe").attr("src");
        let container = res.data;

        if (iframeSrc) {
            if (iframeSrc.startsWith("/")) iframeSrc = COFLIX_BASE_URL + iframeSrc;
            const iframeRes = await axios.get(iframeSrc, { headers: HEADERS, timeout: 5000 });
            container = iframeRes.data;
        }

        const $if = cheerio.load(container);
        const players = [];
        $if('li[onclick*="showVideo"]').each((i, el) => {
            const onClick = $if(el).attr("onclick");
            const base64Match = onClick.match(/showVideo\(['"]([^'"]+)['"]/);
            if (base64Match && base64Match[1]) {
                const decodedUrl = Buffer.from(base64Match[1], 'base64').toString('utf8');
                const quality = $if(el).find("span").text().trim() || "HD";
                const langInfo = $if(el).find("p").text().toLowerCase();
                let lang = "VF";
                if (langInfo.includes("vostfr")) lang = "VOSTFR";
                else if (langInfo.includes("english") || langInfo.includes("vo")) lang = "VO";
                const host = getHostName(decodedUrl);
                players.push({ name: host, url: decodedUrl, lang: lang, quality: quality });
            }
        });

        return players;
    } catch (e) {
        return [];
    }
}

async function searchCoflix(title, type) {
    try {
        const query = normalizeTitle(title);
        const url = `${COFLIX_BASE_URL}/suggest.php?query=${encodeURIComponent(query)}`;
        const res = await axios.get(url, { headers: HEADERS, timeout: 5000 });
        if (!Array.isArray(res.data)) return [];
        const filtered = res.data.filter(item => {
            const pType = item.post_type.toLowerCase();
            if (type === "movie") return pType === "movies" || pType === "movie";
            return pType === "series" || pType === "tvshows" || pType === "tvshow" || pType === "tv";
        });
        return filtered;
    } catch (e) {
        return [];
    }
}

export default async function handler(req, res) {
    const { path } = req.query;
    // path format: movie/:tmdbId or tv/:tmdbId/:season/:episode
    const parts = (req.url.split('?')[0]).split('/').filter(Boolean).slice(2); // Remove /api/coflix
    
    const type = parts[0]; // movie or tv
    const tmdbId = parts[1];
    const title = req.query.title;

    if (!title) return res.status(400).json({ success: false, error: "Title is required" });

    try {
        if (type === 'movie') {
            const results = await searchCoflix(title, "movie");
            if (results.length === 0) return res.json({ success: true, sources: [] });
            const players = await extractPlayers(results[0].url);
            return res.json({ success: true, tmdbId, sources: players });
        } else if (type === 'tv') {
            const season = parts[2];
            const episode = parts[3];
            const results = await searchCoflix(title, "tv");
            if (results.length === 0) return res.json({ success: true, sources: [] });

            const seriesId = results[0].ID;
            const seriesSlug = results[0].url.split('/').filter(Boolean).pop();
            
            const patterns = [
                `${COFLIX_BASE_URL}/wp-json/apiflix/v1/series/${seriesId}/${season}`,
                `${COFLIX_BASE_URL}/series/${seriesSlug}-saison-${season}-episode-${episode}/`
            ];

            for (const url of patterns) {
                try {
                    if (url.includes('wp-json')) {
                        const apiRes = await axios.get(url, { headers: HEADERS, timeout: 4000 });
                        if (apiRes.data && Array.isArray(apiRes.data.episodes)) {
                            const targetEpisode = apiRes.data.episodes.find(ep => parseInt(ep.number) === parseInt(episode));
                            if (targetEpisode && targetEpisode.links) {
                                const players = await extractPlayers(targetEpisode.links);
                                if (players.length > 0) return res.json({ success: true, sources: players });
                            }
                        }
                    } else {
                        const players = await extractPlayers(url);
                        if (players.length > 0) return res.json({ success: true, sources: players });
                    }
                } catch (err) {}
            }
            return res.json({ success: true, sources: [] });
        }
        
        res.status(404).json({ success: false, error: "Route not found" });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}
