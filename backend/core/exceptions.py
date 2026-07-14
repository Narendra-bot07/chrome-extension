from fastapi import Request, status
from fastapi.responses import JSONResponse

class BaseAppException(Exception):
    """Base exception for the application."""
    def __init__(self, message: str, status_code: int = status.HTTP_400_BAD_REQUEST):
        self.message = message
        self.status_code = status_code
        super().__init__(message)

class CredentialError(BaseAppException):
    def __init__(self, message: str = "Invalid credentials or authorization header."):
        super().__init__(message, status_code=status.HTTP_401_UNAUTHORIZED)

class CreditsExhaustedError(BaseAppException):
    def __init__(self, message: str = "Insufficient credits to complete this operation."):
        super().__init__(message, status_code=status.HTTP_402_PAYMENT_REQUIRED)

class RecordNotFoundError(BaseAppException):
    def __init__(self, message: str = "Requested resource not found."):
        super().__init__(message, status_code=status.HTTP_404_NOT_FOUND)

class UnsupportedFileError(BaseAppException):
    def __init__(self, message: str = "Unsupported file extension or format."):
        super().__init__(message, status_code=status.HTTP_400_BAD_REQUEST)

async def global_exception_handler(request: Request, exc: Exception):
    if isinstance(exc, BaseAppException):
        return JSONResponse(
            status_code=exc.status_code,
            content={"status": "error", "detail": exc.message}
        )
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"status": "error", "detail": f"Internal Server Error: {str(exc)}"}
    )
