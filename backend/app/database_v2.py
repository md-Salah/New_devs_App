from typing import Any, Optional
from supabase import create_client, Client
from .config import settings
from .core.tenant_context import get_user_token
import logging

logger = logging.getLogger(__name__)


class TenantAwareSupabase:
    """Wrapper that creates a new Supabase client with the user's token for RLS.
    
    This approach creates a new client for each request with the user's bearer token,
    ensuring RLS policies work correctly.
    """

    def __init__(self, base: Client) -> None:
        self._base = base
        self._clients_cache = {}

    def _get_client(self) -> Client:
        """Get a Supabase client with the appropriate auth token."""
        token = get_user_token()
        
        if token:
            # Create a new client with the user's token for RLS
            # This ensures the database sees the request as coming from the user
            if token not in self._clients_cache:
                logger.debug(f"Creating new Supabase client with user token (first 20 chars): {token[:20]}...")
                try:
                    # Create client with user's token
                    client = create_client(
                        settings.supabase_url,
                        token,  # Use the user's JWT token as the key
                        options={
                            "auto_refresh_token": False,  # Don't auto-refresh since this is a per-request token
                            "persist_session": False,
                            "storage_key": None,
                        }
                    )
                    self._clients_cache[token] = client
                    logger.debug("Successfully created user-authenticated Supabase client")
                except Exception as e:
                    logger.error(f"Failed to create user-authenticated client: {str(e)}")
                    return self._base
            
            # Clean cache if it gets too large
            if len(self._clients_cache) > 100:
                self._clients_cache.clear()
            
            return self._clients_cache[token]
        else:
            # No user token, use service role
            logger.debug("No user token found, using service role client")
            return self._base

    # PostgREST entry points
    def table(self, name: str):
        """Access a table with the user's auth context."""
        client = self._get_client()
        return client.table(name)

    # Alias for compatibility
    def from_(self, name: str):
        """Access a table with the user's auth context (alias for table)."""
        return self.table(name)

    def rpc(self, fn: str, params: Optional[dict] = None):
        """Call an RPC function with the user's auth context."""
        client = self._get_client()
        return client.rpc(fn, params or {})

    # Expose underlying clients unchanged
    @property
    def auth(self):
        """Access auth methods (always uses service role)."""
        return self._base.auth

    @property
    def storage(self):
        """Access storage methods."""
        client = self._get_client()
        return client.storage

    @property
    def service(self) -> Client:
        """Access the underlying service-role client for trusted server-side queries.
        Use sparingly and always scope by tenant_id derived from the user's token/claims.
        """
        return self._base

    def __getattr__(self, item: str) -> Any:
        # Fallback passthrough for any other attributes
        return getattr(self._base, item)


# Base Supabase client with service role for admin ops
_base_client: Client = create_client(
    settings.supabase_url,
    settings.supabase_service_role_key,
)

# Export tenant-aware wrapper used across the app
supabase: TenantAwareSupabase = TenantAwareSupabase(_base_client)