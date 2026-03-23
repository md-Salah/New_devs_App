"""
Token Access Service with Automatic City Detection
Simple interface for application code to access tokens with automatic validation
"""

import os
from typing import Optional, Dict, Any
from functools import lru_cache
import asyncio
from app.services.token_manager_simple import get_token_manager
from app.services.token_validator import TokenValidator
import logging

logger = logging.getLogger(__name__)


class TokenAccess:
    """
    Service for accessing tokens with automatic city validation
    """
    
    def __init__(self):
        """Initialize token access service"""
        self._token_manager = get_token_manager()
        self._cache: Dict[str, str] = {}
        self._use_env_fallback = os.getenv('USE_ENV_TOKEN_FALLBACK', 'true').lower() == 'true'
    
    async def get_hostaway_token(self, city: str) -> Optional[str]:
        """
        Get Hostaway API token for a specific city
        Will automatically validate if not already validated
        
        Args:
            city: City name (london, paris, algiers, lisbon)
            
        Returns:
            Token value or None if not found/valid
        """
        cache_key = f"hostaway_api:{city}"
        
        # Check cache first
        if cache_key in self._cache:
            return self._cache[cache_key]
        
        try:
            # Try to get token from database
            token_data = await self._token_manager.get_token_for_city(
                token_key='hostaway_api',
                city=city,
                decrypt=True
            )
            
            if token_data and token_data.get('value'):
                token_value = token_data['value']
                
                # Check if token needs validation for this city
                valid_cities = token_data.get('valid_cities', [])
                invalid_cities = token_data.get('invalid_cities', [])
                
                if city not in valid_cities and city not in invalid_cities:
                    # Token hasn't been validated for this city yet
                    logger.info(f"Validating Hostaway token for {city}")
                    
                    async with TokenValidator() as validator:
                        is_valid, status_code, error_msg = await validator.validate_hostaway_token(
                            token_value, city
                        )
                        
                        # Update validation in database
                        await validator._update_validation(
                            token_data['id'], city, is_valid, status_code, error_msg
                        )
                        
                        if not is_valid:
                            logger.warning(f"Token invalid for {city}: {error_msg}")
                            # Try fallback
                            if self._use_env_fallback:
                                return self._get_env_fallback(f"HOSTAWAY_API_{city.upper()}")
                            return None
                
                elif city in invalid_cities:
                    logger.warning(f"Token known to be invalid for {city}")
                    # Try fallback
                    if self._use_env_fallback:
                        return self._get_env_fallback(f"HOSTAWAY_API_{city.upper()}")
                    return None
                
                # Token is valid for this city
                self._cache[cache_key] = token_value
                return token_value
            
        except Exception as e:
            logger.error(f"Failed to get Hostaway token for {city}: {str(e)}")
        
        # Fallback to environment variable if enabled
        if self._use_env_fallback:
            return self._get_env_fallback(f"HOSTAWAY_API_{city.upper()}")
        
        return None
    
    async def get_stripe_secret_key(self) -> Optional[str]:
        """
        Get Stripe secret key (global token)
        
        Returns:
            Stripe secret key or None
        """
        return await self._get_global_token('stripe_secret', 'STRIPE_SECRET_KEY')
    
    async def get_stripe_publishable_key(self) -> Optional[str]:
        """
        Get Stripe publishable key (global token)
        
        Returns:
            Stripe publishable key or None
        """
        return await self._get_global_token('stripe_publishable', 'STRIPE_PUBLISHABLE_KEY')
    
    async def get_stripe_webhook_secret(self) -> Optional[str]:
        """
        Get Stripe webhook secret (global token)
        
        Returns:
            Stripe webhook secret or None
        """
        return await self._get_global_token('stripe_webhook', 'STRIPE_WEBHOOK_SECRET')
    
    async def _get_global_token(self, token_key: str, env_key: str) -> Optional[str]:
        """
        Get a global token (not city-specific)
        
        Args:
            token_key: Token key in database
            env_key: Environment variable key for fallback
            
        Returns:
            Token value or None
        """
        # Check cache
        if token_key in self._cache:
            return self._cache[token_key]
        
        try:
            # Get from database (global tokens don't need city)
            token_data = await self._token_manager.get_token_for_city(
                token_key=token_key,
                city='global',
                decrypt=True
            )
            
            if token_data and token_data.get('value'):
                self._cache[token_key] = token_data['value']
                return token_data['value']
                
        except Exception as e:
            logger.error(f"Failed to get token {token_key}: {str(e)}")
        
        # Fallback to environment variable
        if self._use_env_fallback:
            return self._get_env_fallback(env_key)
        
        return None
    
    def _get_env_fallback(self, env_key: str) -> Optional[str]:
        """Get token from environment variable as fallback"""
        env_value = os.getenv(env_key)
        if env_value:
            logger.info(f"Using environment variable fallback for {env_key}")
        return env_value
    
    def clear_cache(self) -> None:
        """Clear the token cache"""
        self._cache.clear()
    
    async def refresh_token_validations(self, token_key: str):
        """
        Force re-validation of a token against all cities
        
        Args:
            token_key: Token key to refresh
        """
        try:
            # Get the token
            token_data = await self._token_manager.get_token(
                token_key=token_key,
                decrypt=True
            )
            
            if token_data and token_data.get('value'):
                async with TokenValidator() as validator:
                    await validator.auto_validate_token(
                        token_data['id'],
                        token_data['token_type'],
                        token_data['value']
                    )
                
                # Clear cache to force reload
                self.clear_cache()
                
                logger.info(f"Refreshed validations for token {token_key}")
        
        except Exception as e:
            logger.error(f"Failed to refresh token validations: {str(e)}")


# Singleton instance
_token_access: Optional[TokenAccess] = None


def get_token_access() -> TokenAccess:
    """Get or create the singleton token access instance"""
    global _token_access
    if _token_access is None:
        _token_access = TokenAccess()
    return _token_access


# Background task to periodically validate tokens
async def background_token_validator():
    """
    Background task to periodically validate all tokens
    Run this as a scheduled task (e.g., every hour)
    """
    from app.services.token_validator import periodic_token_validation
    
    while True:
        try:
            logger.info("Running periodic token validation")
            await periodic_token_validation()
        except Exception as e:
            logger.error(f"Error in periodic token validation: {str(e)}")
        
        # Wait 1 hour before next validation
        await asyncio.sleep(3600)