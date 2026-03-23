"""
Token Service - Centralized token access from database
Replaces environment variable usage with Token Management system
"""

from typing import Optional, Dict, Any
from functools import lru_cache
import logging
from app.services.token_manager_simple import get_token_manager

logger = logging.getLogger(__name__)


class TokenService:
    """
    Service for accessing tokens from the Token Management system
    This replaces all environment variable usage for API tokens
    """
    
    _instance = None
    _cache: Dict[str, str] = {}
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(TokenService, cls).__new__(cls)
            cls._instance._initialized = False
        return cls._instance
    
    def __init__(self):
        if self._initialized:
            return
        self._token_manager = get_token_manager()
        self._cache = {}
        self._initialized = True
    
    async def get_hostaway_token_for_city(self, city: str, tenant_id: str = None) -> Optional[str]:
        """
        Get Hostaway API token for a specific city with tenant awareness
        
        Args:
            city: City name (london, paris, algiers, lisbon, etc.)
            tenant_id: Optional tenant ID (will use context if not provided)
            
        Returns:
            Token value or None if not found
        """
        # Get tenant_id from context if not provided
        if not tenant_id:
            from .tenant_context import get_tenant_id
            tenant_id = get_tenant_id()
        
        cache_key = f"hostaway:{tenant_id}:{city.lower()}" if tenant_id else f"hostaway:{city.lower()}"
        
        # Check cache first
        if cache_key in self._cache:
            logger.debug(f"Using cached Hostaway token for {city} (tenant: {tenant_id})")
            return self._cache[cache_key]
        
        logger.info(f"=== HOSTAWAY TOKEN LOOKUP ===")
        logger.info(f"City: {city}")
        logger.info(f"Tenant ID: {tenant_id}")
        logger.info(f"==============================")
        
        # If we have a tenant_id, ONLY use tenant-specific tokens
        # This ensures we don't accidentally use the wrong tenant's token
        if tenant_id:
            token_value = await self._get_tenant_hostaway_token(tenant_id, city)
            if token_value:
                tail = token_value[-8:] if isinstance(token_value, str) else 'n/a'
                logger.info(f"✅ Found tenant-specific token for {city} (tenant: {tenant_id}) tail=...{tail}")
                self._cache[cache_key] = token_value
                return token_value
            else:
                logger.warning(f"⚠️ No tenant-specific Hostaway token found for tenant {tenant_id}, city {city}")
                # Don't fall back to other tenants' tokens!
                return None
        
        # Fallback: Try to get token directly from secure_tokens for the city
        try:
            from ..database import supabase
            
            # Query secure_tokens table directly for any token with the city
            result = (
                supabase.service
                .table('secure_tokens')
                .select('id, cities')
                .eq('token_type', 'hostaway')
                .eq('is_active', True)
                .execute()
            )
            
            if result.data:
                for token_data in result.data:
                    cities = token_data.get('cities', [])
                    if city.lower() in [c.lower() for c in cities]:
                        # Found a matching token, decrypt it
                        token_result = await self._token_manager.get_token(
                            token_id=token_data['id'],
                            decrypt=True
                        )
                        if token_result and token_result.get('value'):
                            token_value = token_result['value']
                            tail = token_value[-8:] if isinstance(token_value, str) else 'n/a'
                            self._cache[cache_key] = token_value
                            logger.info(f"Successfully retrieved Hostaway token for {city} from secure_tokens (token_id={token_data['id']} tail=...{tail})")
                            return token_value
        except Exception as e:
            logger.warning(f"Error querying secure_tokens directly: {str(e)}")
        
        # Final fallback to token manager's get_token_for_city
        try:
            token_data = await self._token_manager.get_token_for_city(
                token_key='hostaway_api',
                city=city.lower(),
                decrypt=True
            )
            
            if token_data and token_data.get('value'):
                token_value = token_data['value']
                tail = token_value[-8:] if isinstance(token_value, str) else 'n/a'
                self._cache[cache_key] = token_value
                logger.info(f"Successfully retrieved Hostaway token for {city} from Token Management (tail=...{tail})")
                return token_value
            else:
                logger.warning(f"No Hostaway token found for city: {city}")
                return None
                
        except Exception as e:
            logger.error(f"Failed to get Hostaway token for {city}: {str(e)}")
            return None
    
    async def _get_tenant_hostaway_token(self, tenant_id: str, city: str) -> Optional[str]:
        """Get Hostaway token for a specific tenant and city"""
        from ..database import supabase
        
        try:
            logger.info(f"Searching for Hostaway token: tenant={tenant_id}, city={city}")
            
            # First check secure_tokens table (new encrypted tokens)
            result = (
                supabase.service
                .table('secure_tokens')
                .select('id, token_name, cities, metadata')
                .eq('token_type', 'hostaway')
                .eq('is_active', True)
                .execute()
            )
            
            if result.data:
                logger.info(f"Found {len(result.data)} active Hostaway tokens in secure_tokens")
                for token_data in result.data:
                    # Check tenant_id in metadata
                    metadata = token_data.get('metadata', {})
                    if isinstance(metadata, str):
                        try:
                            import json
                            metadata = json.loads(metadata)
                        except:
                            metadata = {}
                    
                    token_tenant_id = metadata.get('tenant_id') if metadata else None
                    
                    # Log for debugging
                    logger.debug(f"Token {token_data['id']}: tenant_id={token_tenant_id}, cities={token_data.get('cities', [])}")
                    
                    # Skip if tenant doesn't match
                    if tenant_id and token_tenant_id != tenant_id:
                        logger.debug(f"Skipping token {token_data['id']} - tenant mismatch (wanted: {tenant_id}, got: {token_tenant_id})")
                        continue
                    
                    # Check if city matches
                    cities = token_data.get('cities', [])
                    if city.lower() in [c.lower() for c in cities]:
                        # Get decrypted token from token manager
                        logger.info(f"Found tenant-specific Hostaway token for {city} in secure_tokens (token_id: {token_data['id']}, tenant: {token_tenant_id})")
                        token_result = await self._token_manager.get_token(
                            token_id=token_data['id'],
                            decrypt=True,
                            tenant_id=tenant_id
                        )
                        if token_result and token_result.get('value'):
                            val = token_result['value']
                            tail = val[-8:] if isinstance(val, str) else 'n/a'
                            logger.info(
                                f"Successfully decrypted Hostaway token for tenant {tenant_id}, city {city} (token_id={token_data['id']} tail=...{tail})"
                            )
                            return val
                        else:
                            logger.warning(f"Failed to decrypt token {token_data['id']}")
            else:
                logger.info("No Hostaway tokens found in secure_tokens")
            
            # Fallback: Check api_tokens table (old unencrypted tokens)
            result = (
                supabase.service
                .table('api_tokens')
                .select('token, cities')
                .eq('tenant_id', tenant_id)
                .eq('token_type', 'hostaway')
                .eq('is_active', True)
                .execute()
            )
            
            if result.data:
                for token_data in result.data:
                    cities = token_data.get('cities', [])
                    if city.lower() in [c.lower() for c in cities]:
                        logger.info(f"Found tenant-specific Hostaway token for {city} in api_tokens")
                        return token_data.get('token')
            
            # Check hostaway_tokens table (legacy)
            result = (
                supabase.service
                .table('hostaway_tokens')
                .select('token, cities')
                .eq('tenant_id', tenant_id)
                .eq('is_active', True)
                .execute()
            )
            
            if result.data:
                for token_data in result.data:
                    cities = token_data.get('cities', [])
                    if city.lower() in [c.lower() for c in cities]:
                        logger.info(f"Found tenant-specific Hostaway token for {city} in hostaway_tokens")
                        return token_data.get('token')
            
        except Exception as e:
            import traceback
            error_msg = str(e) if str(e) else repr(e)
            logger.error(f"Error fetching tenant Hostaway token: {error_msg}")
            logger.error(f"Full traceback: {traceback.format_exc()}")

        return None
    
    async def get_stripe_secret_key(self, tenant_id: Optional[str] = None) -> Optional[str]:
        """
        Get Stripe secret key with tenant isolation
        
        Args:
            tenant_id: Tenant ID for isolation (will use context if not provided)
        
        Returns:
            Stripe secret key or None
        """
        # Get tenant_id from context if not provided
        if not tenant_id:
            from .tenant_context import get_tenant_id
            tenant_id = get_tenant_id()
        
        cache_key = f"stripe:secret:{tenant_id}" if tenant_id else "stripe:secret"
        
        if cache_key in self._cache:
            return self._cache[cache_key]
        
        try:
            token_data = await self._token_manager.get_token(
                token_key='stripe_secret_key',
                decrypt=True,
                tenant_id=tenant_id
            )
            
            if token_data and token_data.get('value'):
                self._cache[cache_key] = token_data['value']
                logger.info(f"Successfully retrieved Stripe secret key from Token Management (tenant: {tenant_id})")
                return token_data['value']
                
        except Exception as e:
            logger.error(f"Failed to get Stripe secret key for tenant {tenant_id}: {str(e)}")
        
        return None
    
    async def get_stripe_publishable_key(self, tenant_id: Optional[str] = None) -> Optional[str]:
        """
        Get Stripe publishable key with tenant isolation
        
        Args:
            tenant_id: Tenant ID for isolation (will use context if not provided)
        
        Returns:
            Stripe publishable key or None
        """
        # Get tenant_id from context if not provided
        if not tenant_id:
            from .tenant_context import get_tenant_id
            tenant_id = get_tenant_id()
        
        cache_key = f"stripe:publishable:{tenant_id}" if tenant_id else "stripe:publishable"
        
        if cache_key in self._cache:
            return self._cache[cache_key]
        
        try:
            token_data = await self._token_manager.get_token(
                token_key='stripe_publishable_key',
                decrypt=True,
                tenant_id=tenant_id
            )
            
            if token_data and token_data.get('value'):
                self._cache[cache_key] = token_data['value']
                logger.info(f"Successfully retrieved Stripe publishable key from Token Management (tenant: {tenant_id})")
                return token_data['value']
                
        except Exception as e:
            logger.error(f"Failed to get Stripe publishable key for tenant {tenant_id}: {str(e)}")
        
        return None
    
    async def get_stripe_webhook_secret(self, tenant_id: Optional[str] = None) -> Optional[str]:
        """
        Get Stripe webhook secret with tenant isolation
        
        Args:
            tenant_id: Tenant ID for isolation (will use context if not provided)
        
        Returns:
            Stripe webhook secret or None
        """
        # Get tenant_id from context if not provided
        if not tenant_id:
            from .tenant_context import get_tenant_id
            tenant_id = get_tenant_id()
        
        cache_key = f"stripe:webhook:{tenant_id}" if tenant_id else "stripe:webhook"
        
        if cache_key in self._cache:
            return self._cache[cache_key]
        
        try:
            token_data = await self._token_manager.get_token(
                token_key='stripe_webhook_secret',
                decrypt=True,
                tenant_id=tenant_id
            )
            
            if token_data and token_data.get('value'):
                self._cache[cache_key] = token_data['value']
                logger.info(f"Successfully retrieved Stripe webhook secret from Token Management (tenant: {tenant_id})")
                return token_data['value']
                
        except Exception as e:
            logger.error(f"Failed to get Stripe webhook secret for tenant {tenant_id}: {str(e)}")
        
        return None
    
    async def get_sendgrid_api_key(self) -> Optional[str]:
        """
        Get SendGrid API key
        
        Returns:
            SendGrid API key or None
        """
        cache_key = "sendgrid:api"
        
        if cache_key in self._cache:
            return self._cache[cache_key]
        
        try:
            token_data = await self._token_manager.get_token(
                token_key='sendgrid_api',
                decrypt=True
            )
            
            if token_data and token_data.get('value'):
                self._cache[cache_key] = token_data['value']
                logger.info("Successfully retrieved SendGrid API key from Token Management")
                return token_data['value']
                
        except Exception as e:
            logger.error(f"Failed to get SendGrid API key: {str(e)}")
        
        return None
    
    def clear_cache(self):
        """Clear the token cache"""
        self._cache.clear()
        logger.info("Token cache cleared")
    
    def clear_cache_for_service(self, service: str):
        """Clear cache for a specific service"""
        keys_to_remove = [k for k in self._cache.keys() if k.startswith(f"{service}:")]
        for key in keys_to_remove:
            del self._cache[key]
        logger.info(f"Cleared cache for service: {service}")


# Singleton instance
_token_service: Optional[TokenService] = None


def get_token_service() -> TokenService:
    """Get or create the singleton token service instance"""
    global _token_service
    if _token_service is None:
        _token_service = TokenService()
    return _token_service


# Compatibility wrapper for existing code
async def get_hostaway_token_for_city(city: str) -> Optional[str]:
    """
    Compatibility function for existing code
    
    Args:
        city: City name
        
    Returns:
        Token value or None
    """
    service = get_token_service()
    return await service.get_hostaway_token_for_city(city)
