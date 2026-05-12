const axios = require('axios');
const cheerio = require('cheerio');
const { Buffer } = require('buffer');

async function test() {
    try {
        const res = await axios.get('https://coflix.date/film/mortal-kombat-ii/');
        const $ = cheerio.load(res.data);
        console.log("SHOW VIDEO:");
        $('li[onclick*="showVideo"], div[onclick*="showVideo"]').each((i, el) => {
            const onclick = $(el).attr('onclick');
            const match = onclick.match(/showVideo\(['"]([^'"]+)['"]/);
            if (match) {
                console.log(Buffer.from(match[1], 'base64').toString());
            }
        });
        console.log("IFRAMES:");
        $('iframe').each((i, el) => {
            console.log($(el).attr('src'));
        });
    } catch (e) {
        console.log(e.message);
    }
}
test();
