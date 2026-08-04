-- Cover letters were never persisted as actual files in Supabase Storage --
-- only ever as a JSON/text snapshot in applications.cover_letter_snapshot.
-- Unlike resumes (original-resumes / generated-resumes buckets), there was
-- no durable, storage-backed copy of a generated cover letter at all.
-- Adds a private 'cover-letters' bucket following the exact same
-- user-ID-prefixed-path convention as 'original-resumes' / 'generated-resumes'
-- (see 20260713000002_rls_storage_policies.sql), plus a column to track the
-- uploaded object's path per application.

INSERT INTO storage.buckets (id, name, public)
VALUES ('cover-letters', 'cover-letters', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users can upload their own cover letters"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'cover-letters' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can view their own cover letters"
ON storage.objects FOR SELECT
USING (bucket_id = 'cover-letters' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update their own cover letters"
ON storage.objects FOR UPDATE
USING (bucket_id = 'cover-letters' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own cover letters"
ON storage.objects FOR DELETE
USING (bucket_id = 'cover-letters' AND auth.uid()::text = (storage.foldername(name))[1]);

ALTER TABLE public.applications
    ADD COLUMN IF NOT EXISTS cover_letter_file_path TEXT;
