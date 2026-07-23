-- Immutable identity controls used by Selected Resume Intelligence.
ALTER TABLE public.resumes
    ADD COLUMN IF NOT EXISTS resume_version INTEGER NOT NULL DEFAULT 1
        CHECK (resume_version >= 1),
    ADD COLUMN IF NOT EXISTS source_fingerprint VARCHAR(64),
    ADD COLUMN IF NOT EXISTS fingerprint_algorithm VARCHAR(20) NOT NULL DEFAULT 'sha256',
    ADD COLUMN IF NOT EXISTS fingerprinted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS resumes_owner_identity_idx
    ON public.resumes (user_id, id, resume_version)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS resumes_source_fingerprint_idx
    ON public.resumes (source_fingerprint)
    WHERE deleted_at IS NULL AND source_fingerprint IS NOT NULL;
