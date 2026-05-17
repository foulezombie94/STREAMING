const axios = require('axios');

async function test() {
    try {
        const url = "https://coflix.dance/wp-json/apiflix/v1/series/17205/16";
        console.log(`Fetching ${url}...`);
        
        const res = await axios.get(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
                "X-Requested-With": "XMLHttpRequest"
            }
        });
        
        console.log("Raw response keys:", Object.keys(res.data || {}));
        console.log("Raw response data:", JSON.stringify(res.data).substring(0, 1000));
    } catch (e) {
        console.log("Error:", e.message);
    }
}
test();
