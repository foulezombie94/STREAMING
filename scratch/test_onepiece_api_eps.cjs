const axios = require('axios');

async function run() {
    try {
        const url = "https://coflix.dance/wp-json/apiflix/v1/series/17205/175547";
        console.log(`Querying One Piece Season 16 episodes: ${url}`);
        const res = await axios.get(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
                "X-Requested-With": "XMLHttpRequest"
            }
        });
        
        if (res.data && Array.isArray(res.data.episodes)) {
            console.log(`Total episodes in Season 16 on Coflix: ${res.data.episodes.length}`);
            const eps = res.data.episodes;
            
            console.log("First episode in Season 16 on Coflix:");
            console.log({
                number: eps[0].number,
                id: eps[0].id,
                links: eps[0].links
            });
            
            console.log("\nLast episode in Season 16 on Coflix:");
            console.log({
                number: eps[eps.length - 1].number,
                id: eps[eps.length - 1].id,
                links: eps[eps.length - 1].links
            });

            console.log("\nSample episode numbers in Season 16 on Coflix:");
            console.log(eps.slice(0, 15).map(e => e.number));
            
            // Search for episode 659 or 660
            const ep659 = eps.find(e => parseInt(e.number) === 659);
            console.log("\nEpisode 659 details:");
            console.log(ep659);

            const ep660 = eps.find(e => parseInt(e.number) === 660);
            console.log("\nEpisode 660 details:");
            console.log(ep660);
        } else {
            console.log("No episodes found or invalid data structure");
        }
    } catch (e) {
        console.log("Error:", e.message);
    }
}

run();
