const axios = require('axios');

async function testSeason(seasonNum) {
    try {
        const seriesId = "17205"; // One Piece post_id on Coflix
        const url = `https://coflix.dance/wp-json/apiflix/v1/series/${seriesId}/${seasonNum}`;
        console.log(`Querying Coflix API for Season ${seasonNum}: ${url}`);
        
        const res = await axios.get(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
                "X-Requested-With": "XMLHttpRequest"
            }
        });
        
        if (res.data) {
            console.log(`Success! Data returned:`);
            console.log(`- Season Name: "${res.data.name}"`);
            if (res.data.episodes && Array.isArray(res.data.episodes)) {
                console.log(`- Episodes count: ${res.data.episodes.length}`);
                if (res.data.episodes.length > 0) {
                    console.log(`- First episode details:`, {
                        id: res.data.episodes[0].id,
                        number: res.data.episodes[0].number,
                        name: res.data.episodes[0].name,
                        linksCount: res.data.episodes[0].links?.length
                    });
                    console.log(`- Last episode details:`, {
                        id: res.data.episodes[res.data.episodes.length - 1].id,
                        number: res.data.episodes[res.data.episodes.length - 1].number,
                        name: res.data.episodes[res.data.episodes.length - 1].name,
                        linksCount: res.data.episodes[res.data.episodes.length - 1].links?.length
                    });
                    
                    // Log a few middle episodes too
                    console.log("- Sample episode numbers:", res.data.episodes.slice(0, 10).map(e => e.number));
                }
            } else {
                console.log(`- No episodes array found in response.`);
            }
        }
    } catch (e) {
        console.log(`Error Season ${seasonNum}:`, e.message);
    }
}

async function run() {
    await testSeason("1");
    console.log("\n-----------------------------------------\n");
    await testSeason("16");
}

run();
