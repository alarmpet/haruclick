# Supabase Database Setup

To enable the database functionality for Minsim, please follow these steps:

1. **Create a Supabase Project**:
   - Go to [Supabase](https://supabase.com) and create a new project.

2. **Run SQL Query**:
   - Go to the **SQL Editor** in your Supabase dashboard.
   - Copy and paste the contents of `SUPABASE_SCHEMA.sql` (located in the project root) and run it. This will create core tables like `events`, `ledger`, `bank_transactions`, `polls`, and `votes`.
   - If you are upgrading an existing DB that still has the legacy `gifticons` table, run `migrations/20260127_drop_gifticons.sql` once after the schema is applied.
   - (Optional) Verify cleanup with `check_gifticon_cleanup.sql`.
   - If you want to tighten public RLS policies for notices/legal/OCR logs, run `migrations/20260127_harden_public_rls.sql`.

3. **Configure Environment Variables**:
   - Create a file named `.env` in the root directory of the project.
   - Add your Supabase URL and Anon Key:

     ```
     EXPO_PUBLIC_SUPABASE_URL=your_supabase_project_url
     EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
     ```

4. **Restart the Server**:
   - Stop the current server and run `auto-run.bat` again to load the environment variables.

Now your app will save and load data from your live database!
