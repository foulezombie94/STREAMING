const axios = require('axios');

async function test() {
    try {
        const url = "https://coflix.dance/wp-content/themes/imovie/dist/main.js";
        console.log(`Fetching ${url}...`);
        
        const res = await axios.get(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
            }
        });
        
        const content = res.data;
        console.log(`Script length: ${content.length} characters`);
        
        // Let's search for keywords and print surrounding text
        const keywords = ['seasons', 'season', 'data-season', 'drp-seasons', 'get_episode', 'post-id', 'data-id', 'action'];
        
        keywords.forEach(kw => {
            const index = content.indexOf(kw);
            if (index !== -1) {
                console.log(`\nFound keyword "${kw}" at index ${index}:`);
                console.log(content.substring(Math.max(0, index - 200), Math.min(content.length, index + 300)));
                console.log("-----------------------------------------");
            } else {
                console.log(`Keyword "${kw}" not found.`);
            }
        });
        
    } catch (e) {
        console.log("Error:", e.message);
    }
}
test();
