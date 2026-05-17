const axios = require('axios');
const cheerio = require('cheerio');

async function test() {
    try {
        const url = "https://coflix.dance/animes/one-piece/";
        console.log(`Fetching ${url}...`);
        const res = await axios.get(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
            }
        });
        const $ = cheerio.load(res.data);
        
        console.log("=== Searching for season-change scripts ===");
        $('script').each((i, el) => {
            const html = $(el).html() || "";
            if (html.includes('seasons') || html.includes('saison') || html.includes('change') || html.includes('click') || html.includes('radio')) {
                console.log(`Script ${i}: (contains keywords) length=${html.length}`);
                console.log(html);
                console.log("-----------------------------------------");
            }
        });
        
        // Also check external scripts
        console.log("=== Checking external scripts src ===");
        $('script[src]').each((i, el) => {
            console.log(`External script: ${$(el).attr('src')}`);
        });
        
    } catch (e) {
        console.log("Error:", e.message);
    }
}
test();
