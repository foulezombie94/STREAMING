const axios = require('axios');
const cheerio = require('cheerio');

async function run() {
    try {
        const url = "https://coflix.band/animes/one-piece/";
        console.log(`Fetching: ${url}`);
        const res = await axios.get(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
            }
        });
        
        const $ = cheerio.load(res.data);
        console.log("=== Season selectors in DOM ===");
        $('input[name="seasons"]').each((i, el) => {
            console.log(`Input ${i+1}:`, {
                season: $(el).attr('data-season'),
                id: $(el).attr('data-id'),
                postId: $(el).attr('post-id'),
                text: $(el).parent().text().trim()
            });
        });
        
        console.log("\n=== Episode links initially present in DOM ===");
        const episodes = [];
        $('.episode a').each((i, el) => {
            episodes.push({
                text: $(el).text().trim(),
                href: $(el).attr('href')
            });
        });
        console.log(`Found ${episodes.length} episodes initially rendered:`);
        console.log(episodes.slice(0, 10));
        console.log("...");
        console.log(episodes.slice(-10));
        
    } catch (e) {
        console.log("Error:", e.message);
    }
}

run();
