import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
if (!process.env.SUPABASE_URL && !process.env.EXPO_PUBLIC_SUPABASE_URL) {
    dotenv.config({ path: '.env' });
}

const supabaseUrl = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Error: Missing Supabase URL or Anon Key in .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const SPORTS_CATEGORIES = [
    { name: 'KBO (프로야구)', icon: '⚾', sort_order: 101 },
    { name: 'EPL (프리미어리그)', icon: '⚽', sort_order: 102 },
    { name: 'K리그', icon: '⚽', sort_order: 103 },
    { name: '라리가', icon: '⚽', sort_order: 104 },
    { name: '분데스리가', icon: '⚽', sort_order: 105 },
    { name: 'MLB (메이저리그)', icon: '⚾', sort_order: 106 },
    { name: 'NBA (프로농구)', icon: '🏀', sort_order: 107 },
    { name: 'FIFA 월드컵 2026', icon: '🏆', sort_order: 108 },
    { name: 'LA 올림픽 2028', icon: '🥇', sort_order: 109 }
];

async function seedSports() {
    console.log('--- Starting Sports Categories Seeding ---');

    // 1. Get first user to act as calendar owner
    const { data: users, error: userErr } = await supabase.auth.admin.listUsers();
    if (userErr || !users || users.users.length === 0) {
        console.error('Failed to fetch a user to own the shared calendars. Please sign up first.');
        process.exit(1);
    }
    const adminUser = users.users.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))[0];
    const adminUserId = adminUser.id;
    console.log(`Using admin user ID: ${adminUserId} (${adminUser.email})`);

    // 2. Ensure parent '스포츠' category exists
    let { data: parentCat, error: parentErr } = await supabase
        .from('interest_categories')
        .select('id')
        .eq('name', '스포츠')
        .single();

    if (parentErr && parentErr.code !== 'PGRST116') {
        console.error('Error fetching parent category:', parentErr);
        process.exit(1);
    }

    if (!parentCat) {
        // Find existing non-leaf '스포츠 중계/행사' or create '스포츠'
        const { data: newParent, error: insertParentErr } = await supabase
            .from('interest_categories')
            .insert({
                name: '스포츠',
                icon: '⚽',
                is_leaf: false,
                sort_order: 100
            })
            .select('id')
            .single();

        if (insertParentErr) {
            console.error('Error inserting parent category:', insertParentErr);
            process.exit(1);
        }
        parentCat = newParent;
        console.log(`Created parent category '스포츠' [${parentCat.id}]`);
    } else {
        console.log(`Found existing parent category '스포츠' [${parentCat.id}]`);
    }

    // 3. Insert child categories and calendars
    for (const cat of SPORTS_CATEGORIES) {
        // Check if category exists
        const { data: existCat } = await supabase
            .from('interest_categories')
            .select('id, target_calendar_id')
            .eq('name', cat.name)
            .single();

        if (existCat) {
            console.log(`- Skip: [${cat.name}] already exists.`);
            continue;
        }

        // Create Calendar
        const { data: newCal, error: calErr } = await supabase
            .from('calendars')
            .insert({
                name: `${cat.name} 캘린더`,
                owner_id: adminUserId,
                color: '#10B981', // Emerald green default
                calendar_type: 'interest'
            })
            .select('id')
            .single();

        if (calErr) {
            console.error(`- Error creating calendar for [${cat.name}]:`, calErr.message);
            continue;
        }

        // Add admin as owner in calendar_members
        const { error: memErr } = await supabase
            .from('calendar_members')
            .insert({
                calendar_id: newCal.id,
                user_id: adminUserId,
                role: 'owner'
            });

        if (memErr) {
            console.error(`- Error adding member for [${cat.name}]:`, memErr.message);
        }

        // Insert Category
        const { error: catErr } = await supabase
            .from('interest_categories')
            .insert({
                name: cat.name,
                parent_id: parentCat.id,
                icon: cat.icon,
                is_leaf: true,
                sort_order: cat.sort_order,
                target_calendar_id: newCal.id
            });

        if (catErr) {
            console.error(`- Error inserting category [${cat.name}]:`, catErr.message);
        } else {
            console.log(`- Success: [${cat.name}] -> Calendar ID: ${newCal.id}`);
        }
    }

    console.log('--- Done Seeding Sports ---');
}

seedSports();
