import { writeFileSync } from 'fs';
import axios from 'axios';

async function runAudit() {
    console.log("Fetching PageSpeed Insights for https://movieverse-gules.vercel.app...");
    try {
        const url = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=https://movieverse-gules.vercel.app&strategy=mobile';
        const response = await axios.get(url);
        const lighthouse = response.data.lighthouseResult;
        
        const score = lighthouse.categories.performance.score * 100;
        const FCP = lighthouse.audits['first-contentful-paint'].displayValue;
        const LCP = lighthouse.audits['largest-contentful-paint'].displayValue;
        const TBT = lighthouse.audits['total-blocking-time'].displayValue;
        const CLS = lighthouse.audits['cumulative-layout-shift'].displayValue;
        const SpeedIndex = lighthouse.audits['speed-index'].displayValue;

        console.log(`\n============================`);
        console.log(`🚀 LIGHTHOUSE PERFORMANCE SCORE: ${score}/100`);
        console.log(`============================`);
        console.log(`FCP (First Contentful Paint): ${FCP}`);
        console.log(`LCP (Largest Contentful Paint): ${LCP}`);
        console.log(`TBT (Total Blocking Time): ${TBT}`);
        console.log(`CLS (Cumulative Layout Shift): ${CLS}`);
        console.log(`Speed Index: ${SpeedIndex}\n`);

        console.log("=== TOP OPPORTUNITIES & DIAGNOSTICS ===");
        const audits = lighthouse.audits;
        const failingAudits = [];
        for (const [key, audit] of Object.entries(audits)) {
            if (audit.score !== null && audit.score < 0.9 && audit.details) {
                failingAudits.push({
                    id: key,
                    title: audit.title,
                    score: audit.score,
                    description: audit.description,
                    displayValue: audit.displayValue
                });
            }
        }

        failingAudits.sort((a, b) => a.score - b.score);
        failingAudits.slice(0, 10).forEach(f => {
            console.log(`❌ [${f.id}] ${f.title} (${Math.round(f.score * 100)}/100)`);
            if (f.displayValue) console.log(`   Value: ${f.displayValue}`);
            console.log(`   Desc: ${f.description}\n`);
        });

        // Save raw output
        writeFileSync('scratch/pagespeed_results.json', JSON.stringify(lighthouse, null, 2));
    } catch (e) {
        console.error("Error running PageSpeed audit:", e.message);
    }
}

runAudit();
