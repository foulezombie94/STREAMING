const axios = require('axios');
const cheerio = require('cheerio');

async function checkUrl(url) {
    try {
        console.log(`Checking URL: ${url}`);
        const res = await axios.get(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
            }
        });
        
        console.log(`  Status: ${res.status}`);
        const $ = cheerio.load(res.data);
        console.log(`  Title: "${$('title').text().trim()}"`);
        
        // Find if players exist on this page
        const players = [];
        $('[onclick*="Video"], [onclick*="Player"], [onclick*="show"], [data-url], [data-link], iframe').each((_, el) => {
            const onclick = $(el).attr('onclick') || "";
            const dataUrl = $(el).attr('data-url') || "";
            const dataLink = $(el).attr('data-link') || "";
            if (onclick || dataUrl || dataLink) {
                players.push({ onclick, dataUrl, dataLink });
            }
        });
        console.log(`  Found ${players.length} elements that could contain player links.`);
        
    } catch (e) {
        console.log(`  Error: ${e.message} (Status: ${e.response?.status})`);
    }
}

async function run() {
    await checkUrl("https://coflix.dance/episode/one-piece-16x659/");
    console.log("-----------------------------------------");
    await checkUrl("https://coflix.dance/episode/one-piece-16x660/");
}

run();
