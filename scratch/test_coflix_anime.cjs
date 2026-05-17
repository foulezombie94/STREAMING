const axios = require('axios');
const cheerio = require('cheerio');

async function test() {
    try {
        const query = "one piece";
        const url = `https://coflix.dance/suggest.php?query=${encodeURIComponent(query)}`;
        console.log(`Searching Coflix for "${query}" at url: ${url}...`);
        
        const res = await axios.get(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
                "X-Requested-With": "XMLHttpRequest"
            }
        });
        
        console.log("Search results:");
        console.log(JSON.stringify(res.data, null, 2));
        
        // Let's find the URL for the anime (if any)
        const anime = res.data.find(r => r.url && (r.url.includes('/animes/') || r.url.includes('/anime/')) && !r.url.includes('live-action') && !r.url.includes('-2023'));
        if (anime) {
            console.log(`\nFound anime URL: ${anime.url}`);
            console.log("Fetching anime page...");
            const pageRes = await axios.get(anime.url, {
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
                }
            });
            const $ = cheerio.load(pageRes.data);
            
            // Let's print some episode links to see their structure
            console.log("\nSome episode links found on page:");
            const links = [];
            $('a[href*="episode"]').each((i, el) => {
                links.push({
                    text: $(el).text().trim(),
                    href: $(el).attr('href')
                });
            });
            console.log(links.slice(0, 15));
        } else {
            console.log("\nNo anime found in results.");
        }
    } catch (e) {
        console.log("Error:", e.message);
    }
}
test();
