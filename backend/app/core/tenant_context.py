"""
Minimal tenant context for storing user tokens and tenant IDs in request context.
"""
from contextvars import ContextVar
from typing import Optional

# Context variable to store the user's token for the current request
_user_token: ContextVar[Optional[str]] = ContextVar('user_token', default=None)

# Context variable to store the tenant ID for the current request
_tenant_id: ContextVar[Optional[str]] = ContextVar('tenant_id', default=None)

def set_user_token(token: str) -> None:
    """Set the user token for the current request context."""
    _user_token.set(token)

def get_user_token() -> Optional[str]:
    """Get the user token from the current request context."""
    return _user_token.get()

def clear_user_token() -> None:
    """Clear the user token from the current request context."""
    _user_token.set(None)

def set_tenant_id(tenant_id: str) -> None:
    """Set the tenant ID for the current request context."""
    _tenant_id.set(tenant_id)

def get_tenant_id() -> Optional[str]:
    """Get the tenant ID from the current request context."""
    return _tenant_id.get()

def clear_tenant_id() -> None:
    """Clear the tenant ID from the current request context."""
    _tenant_id.set(None)
