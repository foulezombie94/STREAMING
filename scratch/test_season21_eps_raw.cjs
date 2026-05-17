const axios = require('axios');

async function run() {
    try {
        const url = "https://coflix.dance/wp-json/apiflix/v1/series/17205/21";
        const res = await axios.get(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
                "X-Requested-With": "XMLHttpRequest"
            }
        });
        
        if (res.data && res.data.episodes) {
            const eps = Array.isArray(res.data.episodes) ? res.data.episodes : Object.values(res.data.episodes);
            console.log("Raw first episode fields:", Object.keys(eps[0]));
            console.log("Raw first episode links field:", JSON.stringify(eps[0].links));
            console.log("Raw first episode details:", JSON.stringify(eps[0]));
        }
    } catch (e) {
        console.log("Error:", e.message);
    }
}

run();
