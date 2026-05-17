const axios = require('axios');

async function test() {
    try {
        const query = "one piece";
        const url = `https://coflix.dance/suggest.php?query=${encodeURIComponent(query)}`;
        console.log(`Searching Coflix for "${query}"...`);
        
        const res = await axios.get(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
                "X-Requested-With": "XMLHttpRequest"
            }
        });
        
        console.log(`Found ${res.data.length} results:`);
        res.data.forEach((r, i) => {
            console.log(`${i+1}. Title: "${r.title || r.post_title}", Type: ${r.post_type || r.type}, URL: ${r.url}`);
        });
    } catch (e) {
        console.log("Error:", e.message);
    }
}
test();
