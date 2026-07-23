-- Generic agentic workflow persistence. Contains orchestration metadata only.
CREATE TABLE IF NOT EXISTS public.workflow_runs (
    workflow_id UUID PRIMARY KEY,
    owner_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    request_id TEXT NOT NULL,
    status TEXT NOT NULL,
    revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
    state JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS workflow_runs_request_id_idx
    ON public.workflow_runs (request_id);
CREATE INDEX IF NOT EXISTS workflow_runs_owner_id_idx
    ON public.workflow_runs (owner_id);
CREATE INDEX IF NOT EXISTS workflow_runs_status_idx
    ON public.workflow_runs (status);

CREATE TABLE IF NOT EXISTS public.workflow_checkpoints (
    checkpoint_id UUID PRIMARY KEY,
    workflow_id UUID NOT NULL
        REFERENCES public.workflow_runs(workflow_id) ON DELETE CASCADE,
    node_name TEXT,
    revision INTEGER NOT NULL CHECK (revision > 0),
    state JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    invalidated_at TIMESTAMPTZ,
    UNIQUE (workflow_id, revision)
);

CREATE INDEX IF NOT EXISTS workflow_checkpoints_workflow_revision_idx
    ON public.workflow_checkpoints (workflow_id, revision DESC);

ALTER TABLE public.workflow_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_checkpoints ENABLE ROW LEVEL SECURITY;

-- Backend service connections manage workflow state. No direct client access
-- policy is added deliberately.
