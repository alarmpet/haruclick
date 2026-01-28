-- Harden RLS policies for support/legal/OCR tables.

-- 1) notices: authenticated users can read active notices
ALTER TABLE public.notices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can view active notices" ON public.notices;
DROP POLICY IF EXISTS "Authenticated can view active notices" ON public.notices;
CREATE POLICY "Authenticated can view active notices"
    ON public.notices FOR SELECT TO authenticated
    USING (is_active);

-- 2) legal_documents: authenticated users can read current docs
ALTER TABLE public.legal_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can read legal documents" ON public.legal_documents;
DROP POLICY IF EXISTS "Authenticated can read legal documents" ON public.legal_documents;
CREATE POLICY "Authenticated can read legal documents"
    ON public.legal_documents FOR SELECT TO authenticated
    USING (effective_date <= CURRENT_DATE);

-- 3) ocr_pipeline_logs: users can read own logs, service role can read all
ALTER TABLE public.ocr_pipeline_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can read ocr logs" ON public.ocr_pipeline_logs;
DROP POLICY IF EXISTS "Users can read own ocr logs" ON public.ocr_pipeline_logs;
DROP POLICY IF EXISTS "Service role can read ocr logs" ON public.ocr_pipeline_logs;
CREATE POLICY "Users can read own ocr logs"
    ON public.ocr_pipeline_logs FOR SELECT TO authenticated
    USING (user_id = auth.uid());
CREATE POLICY "Service role can read ocr logs"
    ON public.ocr_pipeline_logs FOR SELECT TO service_role
    USING (auth.role() = 'service_role');

-- 4) ocr_user_edits: normalize insert policy
ALTER TABLE public.ocr_user_edits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can insert edits" ON public.ocr_user_edits;
DROP POLICY IF EXISTS "Users can insert their own edits" ON public.ocr_user_edits;
CREATE POLICY "Users can insert their own edits"
    ON public.ocr_user_edits FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Service role full access edits" ON public.ocr_user_edits;
CREATE POLICY "Service role full access edits"
    ON public.ocr_user_edits FOR ALL TO service_role
    USING (auth.role() = 'service_role');

-- 5) approved_fewshots: ensure service role policy is scoped
ALTER TABLE public.approved_fewshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access fewshots" ON public.approved_fewshots;
CREATE POLICY "Service role full access fewshots"
    ON public.approved_fewshots FOR ALL TO service_role
    USING (auth.role() = 'service_role');
