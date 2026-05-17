const axios = require('axios');

async function testSeason(seasonNum) {
    try {
        const url = `https://coflix.dance/wp-json/apiflix/v1/series/17205/${seasonNum}`;
        const res = await axios.get(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
                "X-Requested-With": "XMLHttpRequest"
            },
            timeout: 5000
        });
        
        let count = 0;
        let range = "N/A";
        let episodesIsNull = false;
        
        if (res.data) {
            if (res.data.episodes === null) {
                episodesIsNull = true;
            } else if (res.data.episodes) {
                const eps = Array.isArray(res.data.episodes) ? res.data.episodes : Object.values(res.data.episodes);
                count = eps.length;
                if (count > 0) {
                    const sorted = eps.sort((a, b) => parseInt(a.number) - parseInt(b.number));
                    range = `Ep ${sorted[0].number} to Ep ${sorted[sorted.length - 1].number}`;
                }
            }
        }
        console.log(`Season ${seasonNum}: episodesIsNull=${episodesIsNull}, count=${count}, range=${range}`);
    } catch (e) {
        console.log(`Season ${seasonNum}: Error: ${e.message}`);
    }
}

async function run() {
    for (let i = 1; i <= 22; i++) {
        await testSeason(i.toString());
    }
}

run();
