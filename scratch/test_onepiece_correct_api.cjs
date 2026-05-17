const axios = require('axios');

async function test() {
    // We will try both slug-based and id-based variations
    const urls = [
        "https://coflix.dance/wp-json/apiflix/v1/series/one-piece/seasons/16/episodes/659",
        "https://coflix.dance/wp-json/apiflix/v1/series/17205/seasons/16/episodes/659",
        "https://coflix.dance/wp-json/apiflix/v1/series/one-piece/seasons/16",
        "https://coflix.dance/wp-json/apiflix/v1/series/17205/seasons/16"
    ];

    for (const url of urls) {
        try {
            console.log(`Querying: ${url}`);
            const res = await axios.get(url, {
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
                    "X-Requested-With": "XMLHttpRequest"
                },
                timeout: 5000
            });
            console.log(`SUCCESS! Status: ${res.status}`);
            console.log("Data keys/type:", typeof res.data, Array.isArray(res.data) ? `Array length: ${res.data.length}` : Object.keys(res.data || {}));
            console.log("Data preview:", JSON.stringify(res.data).substring(0, 500));
        } catch (e) {
            console.log(`Failed with status: ${e.response?.status || e.message}`);
        }
        console.log("-----------------------------------------");
    }
}

test();
