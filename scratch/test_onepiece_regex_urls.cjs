const axios = require('axios');

const urls = [
    "https://coflix.dance/episode/one-piece-659/",
    "https://coflix.dance/episode/one-piece-659-vostfr/",
    "https://coflix.dance/episode/one-piece-659-vf/",
    "https://coflix.dance/episode/one-piece-episode-659/",
    "https://coflix.dance/episode/one-piece-episode-659-vostfr/",
    "https://coflix.dance/episode/one-piece-episode-659-vf/",
    "https://coflix.dance/episode/one-piece-saison-16-episode-659/",
    "https://coflix.dance/episode/one-piece-saison-16-episode-659-vostfr/",
    "https://coflix.dance/episode/one-piece-saison-16-episode-659-vf/",
    "https://coflix.dance/one-piece-659/",
    "https://coflix.dance/one-piece-episode-659/",
    "https://coflix.dance/episode/one-piece-16x659/",
    // Let's also check a few other season prefixes just in case they are misaligned
    "https://coflix.dance/episode/one-piece-1x659/",
    "https://coflix.dance/episode/one-piece-saison-1-episode-659/",
    "https://coflix.dance/episode/one-piece-16-episode-659/",
    "https://coflix.dance/episode/one-piece-s16e659/"
];

async function checkUrl(url) {
    try {
        const res = await axios.get(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
            },
            timeout: 5000
        });
        console.log(`Success (200): ${url}`);
        return true;
    } catch (e) {
        // Ignored
        return false;
    }
}

async function run() {
    console.log("Probing possible URLs for episode 659...");
    let found = false;
    for (const url of urls) {
        const ok = await checkUrl(url);
        if (ok) found = true;
    }
    if (!found) {
        console.log("No working URL pattern found for episode 659.");
    }
}

run();
