import { chromium } from 'playwright';
import fs from 'fs';

async function test() {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        viewport: { width: 1920, height: 1080 }
    });
    const page = await context.newPage();

    // NAVER Sports KBO Schedule (Desktop)
    await page.goto('https://sports.naver.com/kbaseball/schedule/index', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    const html = await page.content();

    fs.writeFileSync('naver_kbo_test.html', html);
    console.log('Saved to naver_kbo_test.html');
    await browser.close();
}

test();
