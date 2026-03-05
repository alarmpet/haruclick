-- ==========================================================
-- fix_duplicate_interest_categories.sql
-- 관심 카테고리 채널 중복 데이터 제거 및 재발 방지
-- 
-- 실행 방법: Supabase Dashboard > SQL Editor에서 실행
-- 작성일: 2026-03-05
-- ==========================================================

-- [1단계] 중복 행 확인 (실행 안 해도 되지만 확인용)
SELECT name, parent_id, COUNT(*) as cnt
FROM interest_categories
GROUP BY name, parent_id
HAVING COUNT(*) > 1;

-- [2단계] 중복 행 삭제 (각 name+parent_id 조합에서 가장 오래된 1개만 남김)
DELETE FROM interest_categories
WHERE id IN (
    SELECT id FROM (
        SELECT id,
               ROW_NUMBER() OVER (
                   PARTITION BY name, parent_id
                   ORDER BY created_at ASC  -- 가장 오래된 것을 보존 (sort_order 빠른 것)
               ) as rn
        FROM interest_categories
    ) ranked
    WHERE rn > 1
);

-- [3단계] 재발 방지를 위한 Unique Constraint 추가
-- name + parent_id 조합이 중복되면 INSERT할 수 없게 막음
ALTER TABLE interest_categories
ADD CONSTRAINT uq_interest_categories_name_parent
    UNIQUE (name, parent_id);

-- [4단계] 결과 확인
SELECT id, name, parent_id, is_leaf, sort_order, icon
FROM interest_categories
ORDER BY sort_order ASC, name;
