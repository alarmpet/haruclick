create table if not exists ocr_text_cache (
  id uuid primary key default uuid_generate_v4(),
  image_hash text not null unique,
  result jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_ocr_text_cache_hash on ocr_text_cache(image_hash);
