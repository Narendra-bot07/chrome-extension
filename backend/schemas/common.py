from pydantic import BaseModel
from typing import Generic, TypeVar, Optional, List

T = TypeVar("T")

class APIResponse(BaseModel, Generic[T]):
    status: str = "success"
    message: Optional[str] = None
    data: Optional[T] = None

class PaginatedResponse(BaseModel, Generic[T]):
    total: int
    page: int
    size: int
    items: List[T]
