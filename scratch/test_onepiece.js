const TMDB_API_KEY = 'e1a2bb6a3ed288feb5d767908732e751';
const mediaId = '37854'; // One Piece

async function run() {
    try {
        const res = await fetch(`https://api.themoviedb.org/3/tv/${mediaId}?api_key=${TMDB_API_KEY}&language=fr-FR`);
        const data = await res.json();
        
        console.log("Season details:");
        for (const s of data.seasons) {
            if (s.season_number === 0) continue; // Skip specials
            const sRes = await fetch(`https://api.themoviedb.org/3/tv/${mediaId}/season/${s.season_number}?api_key=${TMDB_API_KEY}&language=fr-FR`);
            const sData = await sRes.json();
            if (sData.episodes && sData.episodes.length > 0) {
                const first = sData.episodes[0].episode_number;
                const last = sData.episodes[sData.episodes.length - 1].episode_number;
                console.log(`Season ${s.season_number} (${s.name}): count=${s.episode_count}, first_ep_num=${first}, last_ep_num=${last}`);
            } else {
                console.log(`Season ${s.season_number} (${s.name}): count=${s.episode_count}, no episodes returned`);
            }
        }
    } catch (e) {
        console.error(e);
    }
}

run();
