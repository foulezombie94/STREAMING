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
        
        console.log("=== Season list items HTML ===");
        $('.sc-seasons li').each((i, el) => {
            console.log(`LI ${i}: text="${$(el).text().trim()}", html="${$(el).html()}", attrs=`, el.attribs);
        });
        
    } catch (e) {
        console.log("Error:", e.message);
    }
}
test();
