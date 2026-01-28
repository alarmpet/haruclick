# RLS 강화 이후 앱 기능 점검 체크리스트

목적: 공개(anon) 접근 차단 이후에도 앱 기능이 정상 동작하는지 확인.

## 사전 조건
- 로그인된 사용자 세션 확보
- 최신 스키마 적용 (`migrations/20260127_harden_public_rls.sql` 실행 완료)

## 앱 기능 점검
- 공지사항 화면 진입 시 목록이 정상 로딩된다
- 공지사항에서 비활성 공지는 노출되지 않는다
- 약관/개인정보 화면에서 문서가 정상 로딩된다
- 로그인 상태에서 OCR 스캔 결과 저장/편집이 정상 완료된다
- 비로그인 상태에서 공지/약관 접근 시 앱이 크래시 없이 안내 메시지를 보여준다

## DB 확인(선택)
아래 쿼리는 Supabase SQL Editor에서 확인용으로만 사용.

```sql
-- 공지사항: 활성 공지만 조회되는지
select id, title, is_active
from public.notices
where is_active = true
order by updated_at desc
limit 5;

-- 약관/개인정보: 유효 일자 조건 확인
select id, title, effective_date
from public.legal_documents
where effective_date <= current_date
order by effective_date desc;

-- OCR 로그: 본인 로그만 조회되는지(세션/유저 확인)
select id, user_id, created_at, result_type
from public.ocr_pipeline_logs
where user_id = auth.uid()
order by created_at desc
limit 5;

-- OCR 편집 피드백: 편집 후 insert 여부
select edit_id, user_id, edit_type, created_at
from public.ocr_user_edits
where user_id = auth.uid()
order by created_at desc
limit 5;
```

## 완료 기준
- 위 항목이 모두 정상 동작하거나, 비정상 항목에 대한 조치 계획이 기록됨
