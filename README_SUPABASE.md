# Supabase Database Setup

To enable the database functionality for Minsim, please follow these steps:

1. **Create a Supabase Project**:
   - Go to [Supabase](https://supabase.com) and create a new project.

2. **Run SQL Query**:
   - Go to the **SQL Editor** in your Supabase dashboard.
   - Copy and paste the contents of `SUPABASE_SCHEMA.sql` (located in the project root) and run it. this will create the `events` table.

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
