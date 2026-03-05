import fs from 'fs';
import * as cheerio from 'cheerio';

const html = fs.readFileSync('naver_kbo_test.html', 'utf8');
const $ = cheerio.load(html);

console.log('Mobile structure detected, parsing items...');
const events = [];

$('.MatchBox_match_item__WiPhj').each((i, el) => {
    const timeText = $(el).find('.MatchBox_time__Zt5-d').text().replace('경기 시간', '').trim();
    const titleText = $(el).find('.MatchBoxHeadToHeadArea_match_title__BEYNt').text().trim();

    // Some tabs might have separate team logic
    const homeTeam = $(el).find('.MatchBoxTeamArea_team__0QcOQ').eq(0).text().trim();
    const awayTeam = $(el).find('.MatchBoxTeamArea_team__0QcOQ').eq(1).text().trim();

    events.push({
        time: timeText,
        title: titleText,
        homeTeam,
        awayTeam,
        fullText: $(el).text()
    });
});

console.log('Found events:', events.length);
events.slice(0, 5).forEach(e => console.log(e));
