const axios = require('axios');

async function run() {
    try {
        const url = "https://coflix.dance/wp-json/apiflix/v1/series/17205/10";
        const res = await axios.get(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
                "X-Requested-With": "XMLHttpRequest"
            }
        });
        
        if (res.data && res.data.episodes) {
            const eps = Array.isArray(res.data.episodes) ? res.data.episodes : Object.values(res.data.episodes);
            console.log(`Found ${eps.length} episodes in Season 10`);
            console.log("First episode details:", {
                number: eps[0].number,
                links: eps[0].links
            });
        }
    } catch (e) {
        console.log("Error:", e.message);
    }
}

run();
