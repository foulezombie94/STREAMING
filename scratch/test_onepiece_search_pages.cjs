const axios = require('axios');
const cheerio = require('cheerio');

async function testPage(pageNum) {
    try {
        const url = `https://coflix.dance/page/${pageNum}/?s=one+piece`;
        console.log(`Fetching ${url}...`);
        
        const res = await axios.get(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
            }
        });
        
        const $ = cheerio.load(res.data);
        const results = [];
        
        $('.result-item').each((_, el) => {
            const link = $(el).find('a').attr('href');
            const pTitle = $(el).find('.title a').text().trim();
            const pYear = $(el).find('.year').text().trim();
            
            if (link && pTitle) {
                results.push({
                    title: pTitle,
                    url: link,
                    type: link.includes('/series/') || link.includes('/animes/') ? 'series' : 'movie',
                    releaseYear: pYear
                });
            }
        });
        
        console.log(`Page ${pageNum} found ${results.length} results:`);
        results.forEach((r, i) => {
            console.log(`  - Title: "${r.title}", Type: ${r.type}, URL: ${r.url}`);
        });
        return results.length > 0;
    } catch (e) {
        console.log(`Page ${pageNum} error:`, e.message);
        return false;
    }
}

async function run() {
    for (let i = 1; i <= 5; i++) {
        const active = await testPage(i);
        if (!active) break;
    }
}

run();
