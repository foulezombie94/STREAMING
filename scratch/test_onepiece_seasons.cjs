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
        
        console.log("=== Season list in the HTML ===");
        const seasons = [];
        $('.drp-seasons a, .drp-seasons div, .sc-seasons a, .sc-seasons li').each((i, el) => {
            seasons.push({
                tag: el.tagName,
                text: $(el).text().trim(),
                href: $(el).attr('href'),
                class: $(el).attr('class'),
                id: $(el).attr('id'),
                data: $(el).attr('data-season') || $(el).attr('data-id') || $(el).data()
            });
        });
        console.log(seasons);
        
        console.log("\n=== Checking all elements in .sc-seasons ===");
        console.log($('.sc-seasons').html());
    } catch (e) {
        console.log("Error:", e.message);
    }
}
test();
