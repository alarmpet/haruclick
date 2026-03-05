import { chromium } from 'playwright';
import * as cheerio from 'cheerio';
import fs from 'fs';

async function scrapeNaverKbo() {
    console.log(`[Sync KBO] Launching Playwright...`);
    const browser = await chromium.launch({ headless: true });

    try {
        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
            viewport: { width: 1920, height: 1080 }
        });
        const page = await context.newPage();

        await page.setDefaultNavigationTimeout(20000);

        // Naver Sports Desktop Schedule
        const url = 'https://sports.news.naver.com/kbaseball/schedule/index.nhn';
        console.log(`[Sync KBO] Navigating to ${url}`);

        // networkidle 상태까지 대기 (AJAX 데이터 패치 완료 보장)
        await page.goto(url, { waitUntil: 'networkidle' });

        // 추가로 스케줄 리스트나 '데이터 없음' UI가 나타날 때까지 대기
        try {
            await page.waitForSelector('#_monthlyScheduleList, .sch_tb, .np_schedule_no_data', { timeout: 10000 });
        } catch (e) {
            console.log("Could not find schedule selector... printing html length");
        }

        const html = await page.content();
        fs.writeFileSync('naver_kbo_test.html', html);
        console.log(`[Sync KBO] Saved HTML to naver_kbo_test.html. Length: ${html.length}`);

        const $ = cheerio.load(html);

        const scheduleList = $('#_monthlyScheduleList');
        console.log(`[Sync KBO] _monthlyScheduleList length: ${scheduleList.length}`);

        const eventsData = [];

        // _monthlyScheduleList 하위의 tr(테이블로우) 또는 div 분석
        // 네이버 스포츠 PC KBO 일정표는: 
        // <table class="tb_sch"> 하위에 tr 로 각 구장이 나옴
        // 부모 <div class="sch_tb"> 에 날짜 <span class="day"> 가 있음
        // 또는 ul > li 단위로 구성

        const days = $('.sch_tb');
        console.log(`[Sync KBO] Days found: ${days.length}`);

        days.each((i, dayEl) => {
            const dateStr = $(dayEl).find('.day').text().trim(); // ex) "03.04 (화)"
            if (!dateStr) return;

            const [month, day] = dateStr.split(' ')[0].split('.');
            if (!month || !day) return;

            // 월/일
            const eventDate = `2026-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;

            // 당일 경기 목록
            $(dayEl).find('tbody tr').each((j, tr) => {
                const timeText = $(tr).find('.time').text().trim(); // "18:30"
                const teamsFull = $(tr).find('.play').text().trim(); // "SSG 배영수 VS 키움 정찬헌" 등
                const stadium = $(tr).find('td:nth-child(4)').text().trim() || $(tr).find('.stadium').text().trim();

                if (!timeText || !teamsFull || teamsFull.includes('경기없음') || teamsFull.includes('취소')) return;

                // teamsFull: "SSG VS 키움"
                let awayTeam = '', homeTeam = '';
                const parts = teamsFull.split('VS');
                if (parts.length === 2) {
                    // 보통 VS 옆에 선발투수 이름도 있어서 순수 팀명만 추출하기 어려움. 
                    // 네이버는 <span> 엘리먼트로 팀명 분리해둠
                    awayTeam = $(tr).find('.play span').eq(0).text().trim() || parts[0].trim().split(' ')[0];
                    homeTeam = $(tr).find('.play span').eq(1).text().trim() || parts[1].trim().split(' ')[0];
                }

                if (awayTeam && homeTeam) {
                    console.log(`[Parsed] ${eventDate} ${timeText} | ${awayTeam} vs ${homeTeam} | ${stadium || '구장미상'}`);
                    eventsData.push({ eventDate, timeText, awayTeam, homeTeam, stadium });
                }
            });
        });

        console.log(`[Sync KBO] Total parsed matches: ${eventsData.length}`);

    } catch (error) {
        console.error(`[Sync KBO] Fail:`, error);
    } finally {
        await browser.close();
    }
}

scrapeNaverKbo();
