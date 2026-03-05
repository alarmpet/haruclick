import { chromium } from 'playwright';
import fs from 'fs';

async function test() {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 13_2_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.0.3 Mobile/15E148 Safari/604.1'
    });
    const page = await context.newPage();

    const endpoints = [];

    page.on('response', async (response) => {
        const url = response.url();
        if (url.includes('schedule') || url.includes('api') || url.includes('kbo') || url.includes('kbaseball')) {
            if (response.request().resourceType() === 'fetch' || response.request().resourceType() === 'xhr') {
                endpoints.push(url);
            }
        }
    });

    await page.goto('https://m.sports.naver.com/kbaseball/schedule/index', { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    fs.writeFileSync('naver_apis.txt', [...new Set(endpoints)].join('\n'));
    console.log('Saved to naver_apis.txt');

    await browser.close();
}

test();
