const fs = require('fs');
const filepath = 'c:/Users/petbl/minsim/app/_layout.tsx';

let content = fs.readFileSync(filepath, 'utf8');

if (!content.includes('name="settings/interests"')) {
    const targetBlock = `<Tabs.Screen
                        name="settings/calendar-sync"
                        options={{
                            href: null,
                        }}
                    />`;

    const replacementBlock = `${targetBlock}
                    <Tabs.Screen
                        name="settings/interests"
                        options={{
                            href: null,
                        }}
                    />`;

    content = content.replace(targetBlock, replacementBlock);
    fs.writeFileSync(filepath, content);
    console.log('[1/2] app/_layout.tsx - settings/interests hide settings added!');
} else {
    console.log('[1/2] app/_layout.tsx already updated.');
}

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('[2/2] Failed to execute DB Seeding: Error - Missing Supabase credentials in .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function seedCategories() {
    console.log('\n[2/2] Starting DB Seeding for interest_categories...');

    const categories = [
        { name: '공연 (연극/뮤지컬)', is_leaf: false, sort_order: 1, icon: '🎭', theme_color: '#FF6B6B' },
        { name: '전시 (미술/박물관)', is_leaf: false, sort_order: 2, icon: '🖼️', theme_color: '#4D96FF' },
        { name: '지역 축제', is_leaf: false, sort_order: 3, icon: '🎪', theme_color: '#6BCB77' },
        { name: '팝업 스토어', is_leaf: false, sort_order: 4, icon: '🛍️', theme_color: '#FFD93D' },
        { name: '스포츠 중계/행사', is_leaf: false, sort_order: 5, icon: '🏃', theme_color: '#FF8A08' }
    ];

    for (const cat of categories) {
        // 중복 방지 체크
        const { data: exist } = await supabase.from('interest_categories').select('id').eq('name', cat.name).single();
        if (exist) {
            console.log(`- Skip: [${cat.name}] already exists.`);
            continue;
        }

        const { error } = await supabase.from('interest_categories').insert(cat);
        if (error) {
            console.error(`- Error inserting [${cat.name}]:`, error.message);
        } else {
            console.log(`- Success: Inserted [${cat.name}]`);
        }
    }

    console.log('\n✅ All Done! You can check the app UI now.');
}

seedCategories();
