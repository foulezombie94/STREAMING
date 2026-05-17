const axios = require('axios');

async function run() {
    try {
        const url = "https://coflix.dance/wp-json/apiflix/v1/series/17205/175547";
        console.log(`Querying: ${url}`);
        const res = await axios.get(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
                "X-Requested-With": "XMLHttpRequest"
            }
        });
        
        console.log("episodes type:", typeof res.data.episodes);
        console.log("episodes keys or length:", Array.isArray(res.data.episodes) ? res.data.episodes.length : Object.keys(res.data.episodes || {}));
        
        if (res.data.episodes) {
            const firstKey = Object.keys(res.data.episodes)[0];
            console.log("First episode key:", firstKey);
            console.log("First episode data:", res.data.episodes[firstKey]);
        }
    } catch (e) {
        console.log("Error:", e.message);
    }
}

run();
