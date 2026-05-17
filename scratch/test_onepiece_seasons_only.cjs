const axios = require('axios');
const cheerio = require('cheerio');

async function test() {
    try {
        const url = "https://coflix.dance/animes/one-piece/";
        const res = await axios.get(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
            }
        });
        const $ = cheerio.load(res.data);
        console.log("=== Dropdown text and items ===");
        
        $('.drp-seasons a').each((i, el) => {
            console.log(`Link: text="${$(el).text().trim()}", href="${$(el).attr('href')}"`);
        });

        console.log("\n=== Checking all interactive season elements ===");
        $('.sc-seasons li, .sc-seasons a').each((i, el) => {
            console.log(`Element: tag=${el.tagName}, text="${$(el).text().trim()}", href="${$(el).attr('href')}", class="${$(el).attr('class')}"`);
        });
        
    } catch (e) {
        console.log("Error:", e.message);
    }
}
test();
