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
        
        console.log("=== Checking for <select> elements (dropdowns) ===");
        $('select').each((i, el) => {
            console.log(`Select ID: "${$(el).attr('id')}", Class: "${$(el).attr('class')}", Name: "${$(el).attr('name')}"`);
            $(el).find('option').each((j, opt) => {
                console.log(`  Option value: "${$(opt).attr('value')}", text: "${$(opt).text().trim()}"`);
            });
        });

        console.log("=== Checking for buttons/links that look like seasons or tabs ===");
        $('.season-selector, .seasons, .season, [class*="season"], [class*="saison"], [id*="season"], [id*="saison"]').each((i, el) => {
            console.log(`Element tag: ${el.tagName}, ID: "${$(el).attr('id')}", Class: "${$(el).attr('class')}"`);
            console.log("Content:", $(el).text().trim().substring(0, 100));
        });

        console.log("=== Checking scripts that might contain data or API calls ===");
        $('script').each((i, el) => {
            const html = $(el).html() || "";
            if (html.includes('episode') || html.includes('season') || html.includes('saison') || html.includes('apiflix')) {
                console.log(`Script ${i}: (contains keywords) length=${html.length}`);
                if (html.length < 500) {
                    console.log(html);
                } else {
                    console.log(html.substring(0, 500) + "\n... [TRUNCATED] ...");
                }
            }
        });

        console.log("=== Checking classes of elements containing the episode list ===");
        $('*[class*="episode"], *[class*="list"]').each((i, el) => {
            if ($(el).find('a').length > 0) {
                console.log(`El tag: ${el.tagName}, Class: "${$(el).attr('class')}", links count: ${$(el).find('a').length}`);
            }
        });

    } catch (e) {
        console.log("Error:", e.message);
    }
}
test();
