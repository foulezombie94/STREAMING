const axios = require('axios');

async function run() {
    try {
        const url = "https://coflix.dance/suggest.php?query=one+piece";
        console.log(`Querying: ${url}`);
        const res = await axios.get(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
                "X-Requested-With": "XMLHttpRequest"
            }
        });
        
        if (Array.isArray(res.data)) {
            console.log(`Found ${res.data.length} results:`);
            res.data.forEach((item, index) => {
                console.log(`${index + 1}. Title: "${item.title || item.post_title}"`);
                console.log(`   ID: ${item.id || item.ID}`);
                console.log(`   URL: ${item.url}`);
                console.log(`   Type: ${item.post_type}`);
                console.log("-----------------------------------------");
            });
        } else {
            console.log("Response is not an array:", res.data);
        }
    } catch (e) {
        console.log("Error:", e.message);
    }
}

run();
