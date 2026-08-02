from contextvars import ContextVar
from typing import Optional

# Thread-safe async context variables
_request_id: ContextVar[Optional[str]] = ContextVar("request_id", default=None)
_trace_id: ContextVar[Optional[str]] = ContextVar("trace_id", default=None)
_workflow_id: ContextVar[Optional[str]] = ContextVar("workflow_id", default=None)
_job_id: ContextVar[Optional[str]] = ContextVar("job_id", default=None)

def get_request_id() -> Optional[str]:
    return _request_id.get()

def set_request_id(val: Optional[str]):
    _request_id.set(val)

def get_trace_id() -> Optional[str]:
    return _trace_id.get()

def set_trace_id(val: Optional[str]):
    _trace_id.set(val)

def get_workflow_id() -> Optional[str]:
    return _workflow_id.get()

def set_workflow_id(val: Optional[str]):
    _workflow_id.set(val)

def get_job_id() -> Optional[str]:
    return _job_id.get()

def set_job_id(val: Optional[str]):
    _job_id.set(val)

def clear_context():
    _request_id.set(None)
    _trace_id.set(None)
    _workflow_id.set(None)
    _job_id.set(None)
