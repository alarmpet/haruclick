import fetch from 'node-fetch';

async function fetchKleagueSchedule(year, month) {
    const start = new Date(year, month - 1, 1).toISOString().split('T')[0];
    const end = new Date(year, month, 0).toISOString().split('T')[0];

    console.log(`[Test] Fetching K-League schedule from ${start} to ${end}`);

    const url = `https://api-gw.sports.naver.com/schedule/games?fields=basic,schedule,football,manualRelayUrl&upperCategoryId=kfootball&fromDate=${start}&toDate=${end}&size=500`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            console.error(`Status: ${response.status} ${response.statusText}`);
            return;
        }

        const data = await response.json();
        const games = data.result?.games || [];

        console.log(`Found ${games.length} games.`);

        if (games.length > 0) {
            // Check the first K League 1 game
            const kleagueGames = games.filter(g => g.categoryName === 'K리그1');
            console.log(`K League 1 games: ${kleagueGames.length}`);

            if (kleagueGames.length > 0) {
                console.log(JSON.stringify(kleagueGames[0], null, 2));
            } else {
                console.log(JSON.stringify(games[0], null, 2));
            }
        }
    } catch (error) {
        console.error('Fetch error:', error);
    }
}

// Test with 2024-April
fetchKleagueSchedule(2024, 4);
