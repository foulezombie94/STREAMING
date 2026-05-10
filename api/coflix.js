import * as cheerio from 'cheerio';

const COFLIX_BASE_URL = "https://coflix.date";
const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Referer": COFLIX_BASE_URL + "/",
    "Origin": COFLIX_BASE_URL
};

function normalizeTitle(title) {
    if (!title) return "";
    return title.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w\s]/gi, ' ').replace(/\s+/g, ' ').trim();
}

function getHostName(url) {
    if (!url) return "Direct";
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
    try {
        const response = await fetch(pageUrl, { headers: HEADERS });
        const html = await response.text();
        const $ = cheerio.load(html);
        
        let iframeSrc = $("iframe").attr("src");
        let container = html;

        if (iframeSrc) {
            if (iframeSrc.startsWith("/")) iframeSrc = COFLIX_BASE_URL + iframeSrc;
            const iframeResponse = await fetch(iframeSrc, { headers: HEADERS });
            container = await iframeResponse.text();
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

                players.push({
                    name: getHostName(decodedUrl),
                    url: decodedUrl,
                    lang: lang,
                    quality: quality
                });
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
        const response = await fetch(url, { headers: HEADERS });
        const data = await response.json();
        
        if (!Array.isArray(data)) return [];
        
        return data.filter(item => {
            const pType = (item.post_type || "").toLowerCase();
            if (type === "movie") return pType === "movies" || pType === "movie";
            return pType === "series" || pType === "tvshows" || pType === "tvshow" || pType === "tv";
        });
    } catch (e) {
        return [];
    }
}

export default async function handler(req, res) {
    try {
        res.setHeader('Content-Type', 'application/json');

        const { path, title } = req.query;
        if (!path || !title) return res.status(400).json({ success: false, error: "Missing path or title" });

        const parts = path.split('/').filter(Boolean);
        const type = parts[0]; 
        const tmdbId = parts[1];

        if (type === 'movie') {
            const results = await searchCoflix(title, "movie");
            if (results.length === 0) return res.json({ success: true, sources: [] });
            const players = await extractPlayers(results[0].url);
            return res.json({ success: true, tmdbId, sources: players });
        } 
        
        if (type === 'tv') {
            const season = parts[2];
            const episode = parts[3];
            const results = await searchCoflix(title, "tv");
            if (results.length === 0) return res.json({ success: true, sources: [] });

            const seriesId = results[0].ID;
            const seriesSlug = (results[0].url || "").split('/').filter(Boolean).pop();
            if (!seriesSlug) return res.json({ success: true, sources: [] });

            // Try WP-JSON
            try {
                const apiPath = `${COFLIX_BASE_URL}/wp-json/apiflix/v1/series/${seriesId}/${season}`;
                const apiRes = await fetch(apiPath, { headers: HEADERS });
                const apiData = await apiRes.json();
                if (apiData && Array.isArray(apiData.episodes)) {
                    const targetEp = apiData.episodes.find(ep => parseInt(ep.number) === parseInt(episode));
                    if (targetEp && targetEp.links) {
                        const players = await extractPlayers(targetEp.links);
                        if (players.length > 0) return res.json({ success: true, sources: players });
                    }
                }
            } catch (err) {}

            // Try HTML Direct
            const htmlPath = `${COFLIX_BASE_URL}/series/${seriesSlug}-saison-${season}-episode-${episode}/`;
            const players = await extractPlayers(htmlPath);
            return res.json({ success: true, sources: players });
        }

        return res.status(404).json({ success: false, error: "Type not supported" });

    } catch (error) {
        return res.status(200).json({ success: false, error: error.message });
    }
}
