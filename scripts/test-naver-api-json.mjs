import fetch from 'node-fetch';

async function fetchKboSchedule(year, month) {
    // Generate start and end dates for the month
    const start = new Date(year, month - 1, 1).toISOString().split('T')[0];
    const end = new Date(year, month, 0).toISOString().split('T')[0];

    console.log(`[Test] Fetching schedule from ${start} to ${end}`);

    const url = `https://api-gw.sports.naver.com/schedule/games?fields=basic,schedule,baseball,manualRelayUrl&upperCategoryId=kbaseball&fromDate=${start}&toDate=${end}&size=500`;

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
            // Check the first KBO regular season game
            const kboGames = games.filter(g => g.categoryName === 'KBO리그');
            console.log(`Regular KBO games: ${kboGames.length}`);

            if (kboGames.length > 0) {
                console.log(JSON.stringify(kboGames[0], null, 2));
            } else {
                console.log(JSON.stringify(games[0], null, 2));
            }
        }
    } catch (error) {
        console.error('Fetch error:', error);
    }
}

// Test with 2024-April
fetchKboSchedule(2024, 4);
