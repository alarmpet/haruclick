create table if not exists ocr_cache (
    id uuid primary key default uuid_generate_v4(),
    image_hash text not null unique,
    result jsonb,
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now()
);

create index if not exists idx_ocr_cache_hash on ocr_cache (image_hash);
