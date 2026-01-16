-- Create feedbacks table
create table if not exists public.feedbacks (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete set null,
  type text check (type in ('bug', 'feature', 'other')) not null,
  content text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS
alter table public.feedbacks enable row level security;

-- Policy: Users can insert their own feedback (or anonymous if we allow)
create policy "Authenticated users can insert feedback"
  on public.feedbacks for insert
  with check (auth.role() = 'authenticated');

-- Policy: Admin can read all (assuming we have admin role or check email)
-- For now, maybe just let service role read, or authenticated users read own?
-- Let's keep it simple: insert only for users.
