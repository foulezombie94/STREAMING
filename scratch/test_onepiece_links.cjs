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
        console.log("Searching for episode 659 and 660 links in the HTML...");
        
        const links = [];
        $('a').each((i, el) => {
            const href = $(el).attr('href') || "";
            if (href.includes('659') || href.includes('660') || href.includes('658')) {
                links.push({
                    text: $(el).text().trim(),
                    href: href,
                    html: $(el).html()
                });
            }
        });
        
        console.log("Matching links found:");
        console.log(links);
        
        // Also let's print the first 5 episode links to see formatting
        console.log("\nFirst 5 episode links on the page:");
        const allEpisodes = [];
        $('a[href*="episode"]').each((i, el) => {
            allEpisodes.push({
                text: $(el).text().trim(),
                href: $(el).attr('href')
            });
        });
        console.log(allEpisodes.slice(0, 5));
        
        console.log("\nLast 5 episode links on the page:");
        console.log(allEpisodes.slice(-5));
        
    } catch (e) {
        console.log("Error:", e.message);
    }
}
test();
