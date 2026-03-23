"""
Token Access Service
Simple interface for application code to access tokens
Replaces direct environment variable access
"""

import os
from typing import Optional, Dict, Any
from functools import lru_cache
import asyncio
from app.services.token_manager_simple import get_token_manager
import logging

logger = logging.getLogger(__name__)


class TokenAccess:
    """
    Service for accessing tokens in application code
    Provides a simple interface similar to environment variables
    """
    
    def __init__(self):
        """Initialize token access service"""
        self._token_manager = get_token_manager()
        self._cache: Dict[str, str] = {}
        self._use_env_fallback = os.getenv('USE_ENV_TOKEN_FALLBACK', 'true').lower() == 'true'
    
    async def get_hostaway_token(self, city: str) -> Optional[str]:
        """
        Get Hostaway API token for a specific city
        
        Args:
            city: City name (london, paris, algiers, lisbon)
            
        Returns:
            Token value or None if not found
        """
        cache_key = f"hostaway_api_{city.lower()}"
        
        # Check cache first
        if cache_key in self._cache:
            return self._cache[cache_key]
        
        try:
            # Use the get_token_for_city method for Hostaway tokens
            # This method handles multi-city tokens correctly
            token_data = await self._token_manager.get_token_for_city(
                token_key='hostaway_api',
                city=city.lower(),
                decrypt=True
            )
            
            if token_data and token_data.get('value'):
                self._cache[cache_key] = token_data['value']
                logger.info(f"Successfully retrieved Hostaway token for {city}")
                return token_data['value']
            
        except Exception as e:
            logger.error(f"Failed to get Hostaway token for {city}: {str(e)}")
        
        # Fallback to environment variable if enabled
        if self._use_env_fallback:
            env_key = f"HOSTAWAY_API_{city.upper()}"
            env_value = os.getenv(env_key)
            if env_value:
                logger.info(f"Using environment variable fallback for {env_key}")
                self._cache[cache_key] = env_value
                return env_value
        
        logger.warning(f"No Hostaway token found for city {city}")
        return None
    
    async def get_stripe_secret_key(self) -> Optional[str]:
        """
        Get Stripe secret key
        
        Returns:
            Stripe secret key or None
        """
        return await self._get_token_with_fallback(
            'stripe_secret_key',
            'STRIPE_SECRET_KEY'
        )
    
    async def get_stripe_publishable_key(self) -> Optional[str]:
        """
        Get Stripe publishable key
        
        Returns:
            Stripe publishable key or None
        """
        return await self._get_token_with_fallback(
            'stripe_publishable_key',
            'STRIPE_PUBLISHABLE_KEY'
        )
    
    async def get_stripe_webhook_secret(self) -> Optional[str]:
        """
        Get Stripe webhook secret
        
        Returns:
            Stripe webhook secret or None
        """
        return await self._get_token_with_fallback(
            'stripe_webhook_secret',
            'STRIPE_WEBHOOK_SECRET'
        )
    
    async def get_token(self, purpose: str) -> Optional[str]:
        """
        Get any token by purpose
        
        Args:
            purpose: Token purpose
            
        Returns:
            Token value or None
        """
        # Check cache
        if purpose in self._cache:
            return self._cache[purpose]
        
        try:
            token_data = await self._token_manager.get_token(
                token_key=purpose,
                decrypt=True
            )
            
            if token_data and token_data.get('value'):
                self._cache[purpose] = token_data['value']
                return token_data['value']
                
        except Exception as e:
            logger.error(f"Failed to get token for purpose {purpose}: {str(e)}")
        
        return None
    
    async def _get_token_with_fallback(
        self,
        purpose: str,
        env_key: str
    ) -> Optional[str]:
        """
        Get token with environment variable fallback
        
        Args:
            purpose: Token purpose
            env_key: Environment variable key for fallback
            
        Returns:
            Token value or None
        """
        # Check cache
        if purpose in self._cache:
            return self._cache[purpose]
        
        try:
            # Try database first
            token_data = await self._token_manager.get_token(
                token_key=purpose,
                decrypt=True
            )
            
            if token_data and token_data.get('value'):
                self._cache[purpose] = token_data['value']
                return token_data['value']
                
        except Exception as e:
            logger.error(f"Failed to get token {purpose}: {str(e)}")
        
        # Fallback to environment variable
        if self._use_env_fallback:
            env_value = os.getenv(env_key)
            if env_value:
                logger.info(f"Using environment variable fallback for {env_key}")
                return env_value
        
        return None
    
    def clear_cache(self) -> None:
        """Clear the token cache"""
        self._cache.clear()
    
    def get_all_hostaway_tokens(self) -> Dict[str, str]:
        """
        Get all Hostaway tokens (synchronous wrapper)
        Compatible with existing code
        
        Returns:
            Dictionary of city -> token mappings
        """
        loop = None
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            # No event loop, create one
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            tokens = loop.run_until_complete(self._get_all_hostaway_tokens_async())
            loop.close()
            return tokens
        else:
            # Already in async context
            return asyncio.create_task(self._get_all_hostaway_tokens_async()).result()
    
    async def _get_all_hostaway_tokens_async(self) -> Dict[str, str]:
        """
        Get all Hostaway tokens asynchronously
        
        Returns:
            Dictionary of city -> token mappings
        """
        cities = ['london', 'paris', 'algiers', 'lisbon']
        tokens = {}
        
        for city in cities:
            token = await self.get_hostaway_token(city)
            if token:
                tokens[f"HOSTAWAY_API_{city.upper()}"] = token
        
        return tokens


# Singleton instance
_token_access: Optional[TokenAccess] = None


def get_token_access() -> TokenAccess:
    """Get or create the singleton token access instance"""
    global _token_access
    if _token_access is None:
        _token_access = TokenAccess()
    return _token_access


# Compatibility layer for existing code
class CompatibleSettings:
    """
    Compatibility layer to replace existing settings usage
    Provides the same interface as the old settings class
    """
    
    def __init__(self):
        self._token_access = get_token_access()
        # Keep original settings for non-token configs
        from app.config import settings as original_settings
        self._original_settings = original_settings
    
    def __getattr__(self, name):
        """Proxy non-token attributes to original settings"""
        return getattr(self._original_settings, name)
    
    def get_hostaway_tokens(self) -> Dict[str, str]:
        """Get all Hostaway tokens (compatible with existing code)"""
        return self._token_access.get_all_hostaway_tokens()
    
    def get_hostaway_token_for_city(self, city: str) -> Optional[str]:
        """Get Hostaway token for specific city (compatible with existing code)"""
        loop = None
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            # No event loop, create one
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            token = loop.run_until_complete(self._token_access.get_hostaway_token(city))
            loop.close()
            return token
        else:
            # Already in async context
            future = asyncio.create_task(self._token_access.get_hostaway_token(city))
            return asyncio.get_event_loop().run_until_complete(future)
    
    @property
    def stripe_secret_key(self) -> Optional[str]:
        """Get Stripe secret key (compatible property)"""
        loop = None
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            token = loop.run_until_complete(self._token_access.get_stripe_secret_key())
            loop.close()
            return token
        else:
            future = asyncio.create_task(self._token_access.get_stripe_secret_key())
            return asyncio.get_event_loop().run_until_complete(future)
    
    @property
    def stripe_publishable_key(self) -> Optional[str]:
        """Get Stripe publishable key (compatible property)"""
        loop = None
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            token = loop.run_until_complete(self._token_access.get_stripe_publishable_key())
            loop.close()
            return token
        else:
            future = asyncio.create_task(self._token_access.get_stripe_publishable_key())
            return asyncio.get_event_loop().run_until_complete(future)
    
    @property
    def stripe_webhook_secret(self) -> Optional[str]:
        """Get Stripe webhook secret (compatible property)"""
        loop = None
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            token = loop.run_until_complete(self._token_access.get_stripe_webhook_secret())
            loop.close()
            return token
        else:
            future = asyncio.create_task(self._token_access.get_stripe_webhook_secret())
            return asyncio.get_event_loop().run_until_complete(future)