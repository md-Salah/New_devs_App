from functools import wraps
from fastapi import HTTPException, Depends, status
from typing import List
from .auth import authenticate_request, AuthenticatedUser
from ..database import supabase
import logging

logger = logging.getLogger(__name__)

async def get_organization_modules(tenant_id: str) -> List[str]:
    """Get enabled modules for organization"""
    try:
        response = supabase.rpc('get_org_modules', {
            'tenant_id': tenant_id
        }).execute()
        
        return response.data or []
    except Exception as e:
        logger.error(f"Error fetching organization modules: {e}")
        return []

async def check_module_access(tenant_id: str, module_name: str) -> bool:
    """Check if organization has access to specific module"""
    try:
        response = supabase.rpc('tenant_has_module', {
            'tenant_id': tenant_id,
            'module_name': module_name
        }).execute()
        
        return response.data or False
    except Exception as e:
        logger.error(f"Error checking module access: {e}")
        return False

def require_module(module_name: str):
    """Dependency to check if organization has access to module"""
    async def module_checker(user: AuthenticatedUser = Depends(authenticate_request)):
        # Admin users always have access
        if user.is_admin and user.email in [
            "sid@theflexliving.com",
            "raouf@theflexliving.com", 
            "michael@theflexliving.com",
            "yazid@theflexliving.com",
            "yazid@theflex.global",
            "younes@gmail.com"
        ]:
            return user
        
        # Check if user has tenant_id
        if not user.tenant_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No organization context found"
            )
        
        # Check if organization has this module enabled
        has_access = await check_module_access(user.tenant_id, module_name)
        
        if not has_access:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Module '{module_name}' not enabled for your organization"
            )
        
        return user
    
    return module_checker

def require_any_module(module_names: List[str]):
    """Dependency to check if organization has access to any of the specified modules"""
    async def module_checker(user: AuthenticatedUser = Depends(authenticate_request)):
        # Admin users always have access
        if user.is_admin and user.email in [
            "sid@theflexliving.com",
            "raouf@theflexliving.com",
            "michael@theflexliving.com", 
            "yazid@theflexliving.com",
            "yazid@theflex.global",
            "younes@gmail.com"
        ]:
            return user
        
        # Check if user has tenant_id
        if not user.tenant_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No organization context found"
            )
        
        # Check if organization has any of these modules enabled
        for module_name in module_names:
            has_access = await check_module_access(user.tenant_id, module_name)
            if has_access:
                return user
        
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"None of the required modules {module_names} are enabled for your organization"
        )
    
    return module_checker
