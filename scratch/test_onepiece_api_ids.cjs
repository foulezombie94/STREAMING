const axios = require('axios');

async function testUrl(url) {
    try {
        console.log(`Querying: ${url}`);
        const res = await axios.get(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
                "X-Requested-With": "XMLHttpRequest"
            }
        });
        
        if (res.data) {
            console.log(`  Success!`);
            if (res.data.episodes && Array.isArray(res.data.episodes)) {
                console.log(`  - Episodes count: ${res.data.episodes.length}`);
                if (res.data.episodes.length > 0) {
                    console.log(`  - First episode: number=${res.data.episodes[0].number}, url=${res.data.episodes[0].links?.[0]?.url}`);
                    console.log(`  - Last episode: number=${res.data.episodes[res.data.episodes.length - 1].number}, url=${res.data.episodes[res.data.episodes.length - 1].links?.[0]?.url}`);
                }
            } else {
                console.log(`  - Keys in response:`, Object.keys(res.data));
            }
        }
    } catch (e) {
        console.log(`  Error:`, e.message);
    }
}

async function run() {
    // Test if Season 1 works with data-id "175532"
    await testUrl("https://coflix.dance/wp-json/apiflix/v1/series/17205/175532");
    
    console.log("\n-----------------------------------------\n");
    
    // Test if Season 16 works with data-id "175547"
    await testUrl("https://coflix.dance/wp-json/apiflix/v1/series/17205/175547");
}

run();
