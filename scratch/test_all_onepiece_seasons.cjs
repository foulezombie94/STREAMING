const axios = require('axios');

const seasonIds = {
    "1": "175532",
    "2": "175533",
    "3": "175534",
    "4": "175535",
    "5": "175536",
    "6": "175537",
    "7": "175538",
    "8": "175539",
    "9": "175540",
    "10": "175541",
    "11": "175542",
    "12": "175543",
    "13": "175544",
    "14": "175545",
    "15": "175546",
    "16": "175547",
    "17": "175548",
    "18": "175549",
    "19": "175550",
    "20": "175551",
    "21": "56860",
    "22": "175552"
};

async function testSeason(seasonNum, dataId) {
    try {
        const url = `https://coflix.dance/wp-json/apiflix/v1/series/17205/${dataId}`;
        const res = await axios.get(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
                "X-Requested-With": "XMLHttpRequest"
            },
            timeout: 5000
        });
        
        let count = 0;
        let range = "N/A";
        if (res.data && res.data.episodes) {
            const eps = Array.isArray(res.data.episodes) ? res.data.episodes : Object.values(res.data.episodes);
            count = eps.length;
            if (count > 0) {
                const sorted = eps.sort((a, b) => parseInt(a.number) - parseInt(b.number));
                range = `Ep ${sorted[0].number} to Ep ${sorted[sorted.length - 1].number}`;
            }
        }
        console.log(`Season ${seasonNum} (ID: ${dataId}): count=${count}, range=${range}`);
    } catch (e) {
        console.log(`Season ${seasonNum} (ID: ${dataId}): Error: ${e.message}`);
    }
}

async function run() {
    for (const [seasonNum, dataId] of Object.entries(seasonIds)) {
        await testSeason(seasonNum, dataId);
    }
}

run();
