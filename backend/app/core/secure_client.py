"""
Secure Client for tenant-isolated database operations
This module provides secure database access with automatic tenant filtering
"""

import logging
from typing import Any, Dict, List, Optional
from ..database import supabase
from .tenant_context import get_tenant_id

logger = logging.getLogger(__name__)


class SecureClient:
    """
    Secure database client that automatically applies tenant filtering
    Uses the tenant context from the current request
    """
    
    @staticmethod
    def _apply_tenant_filter(query, tenant_id: str, table_name: str):
        """Apply tenant filter to a query based on table structure"""
        
        # Tables that have direct tenant_id column
        TENANT_TABLES = [
            'properties', 'reservations', 'reservation_notes', 'smart_views',
            'api_tokens', 'hostaway_tokens', 'secure_tokens', 'token_management',
            'users_city', 'user_permissions', 'custom_fields', 'custom_field_values',
            'house_manuals', 'local_guides', 'organizations', 'user_tenants',
            'reservation_subsections', 'discounts', 'coupons', 'company_settings'
        ]
        
        # Tables that need special handling
        SPECIAL_TABLES = {
            'all_properties': 'tenant_id',  # Uses tenant_id column
            'consolidated_reservations': None,  # View, RLS handles it
            'users': None,  # No tenant column, use user_tenants join
        }
        
        if table_name in TENANT_TABLES:
            # Apply tenant filter
            return query.eq('tenant_id', tenant_id)
        elif table_name in SPECIAL_TABLES:
            if SPECIAL_TABLES[table_name]:
                # Apply special column filter
                return query.eq(SPECIAL_TABLES[table_name], tenant_id)
            else:
                # RLS handles it or no filtering needed
                return query
        else:
            logger.warning(f"Unknown table '{table_name}' - no tenant filter applied")
            return query
    
    @staticmethod
    async def get_properties(filters: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        """Get properties with tenant isolation"""
        tenant_id = get_tenant_id()
        
        if not tenant_id:
            logger.warning("No tenant_id in context - returning empty list")
            return []
        
        logger.info(f"SecureClient.get_properties for tenant: {tenant_id}")
        
        try:
            query = supabase.table('properties').select('*')
            query = SecureClient._apply_tenant_filter(query, tenant_id, 'properties')
            
            # Apply additional filters
            if filters:
                for key, value in filters.items():
                    if value is not None:
                        if key == 'city' and isinstance(value, list):
                            query = query.in_('city', value)
                        elif key == 'is_active':
                            query = query.eq('is_active', value)
                        elif key == 'is_grouped':
                            query = query.eq('is_grouped', value)
                        else:
                            query = query.eq(key, value)
            
            result = query.execute()
            logger.info(f"Found {len(result.data)} properties for tenant {tenant_id}")
            return result.data
            
        except Exception as e:
            logger.error(f"Error fetching properties: {str(e)}")
            return []
    
    @staticmethod
    async def get_reservations(filters: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        """Get reservations with tenant isolation"""
        tenant_id = get_tenant_id()
        
        if not tenant_id:
            logger.warning("No tenant_id in context - returning empty list")
            return []
        
        logger.info(f"SecureClient.get_reservations for tenant: {tenant_id}")
        
        try:
            query = supabase.table('reservations').select('*')
            query = SecureClient._apply_tenant_filter(query, tenant_id, 'reservations')
            
            # Apply additional filters
            if filters:
                for key, value in filters.items():
                    if value is not None:
                        if key == 'property_id':
                            query = query.eq('property_id', value)
                        elif key == 'status':
                            query = query.eq('status', value)
                        elif key == 'check_in_date':
                            query = query.gte('check_in', value)
                        elif key == 'check_out_date':
                            query = query.lte('check_out', value)
                        else:
                            query = query.eq(key, value)
            
            result = query.execute()
            logger.info(f"Found {len(result.data)} reservations for tenant {tenant_id}")
            return result.data
            
        except Exception as e:
            logger.error(f"Error fetching reservations: {str(e)}")
            return []
    
    @staticmethod
    async def get_tokens(token_type: Optional[str] = None) -> List[Dict[str, Any]]:
        """Get tokens with tenant isolation"""
        tenant_id = get_tenant_id()
        
        if not tenant_id:
            logger.warning("No tenant_id in context - returning empty list")
            return []
        
        logger.info(f"SecureClient.get_tokens for tenant: {tenant_id}")
        
        try:
            # Try multiple token tables
            all_tokens = []
            
            # 1. Check api_tokens table
            try:
                query = supabase.table('api_tokens').select('*')
                query = SecureClient._apply_tenant_filter(query, tenant_id, 'api_tokens')
                if token_type:
                    query = query.eq('token_type', token_type)
                query = query.eq('is_active', True)
                result = query.execute()
                if result.data:
                    all_tokens.extend(result.data)
                    logger.info(f"Found {len(result.data)} tokens in api_tokens")
            except Exception as e:
                logger.debug(f"api_tokens table not accessible: {str(e)}")
            
            # 2. Check secure_tokens table
            try:
                query = supabase.table('secure_tokens').select('*')
                # This table might use metadata.tenant_id
                query = query.contains('metadata', {'tenant_id': tenant_id})
                if token_type:
                    query = query.eq('token_type', token_type)
                query = query.eq('is_active', True)
                result = query.execute()
                if result.data:
                    all_tokens.extend(result.data)
                    logger.info(f"Found {len(result.data)} tokens in secure_tokens")
            except Exception as e:
                logger.debug(f"secure_tokens table not accessible: {str(e)}")
            
            # 3. Check hostaway_tokens table (specific for Hostaway)
            if not token_type or token_type == 'hostaway':
                try:
                    query = supabase.table('hostaway_tokens').select('*')
                    query = SecureClient._apply_tenant_filter(query, tenant_id, 'hostaway_tokens')
                    query = query.eq('is_active', True)
                    result = query.execute()
                    if result.data:
                        # Convert to standard format
                        for token in result.data:
                            token['token_type'] = 'hostaway'
                            token['token_key'] = 'hostaway_api'
                        all_tokens.extend(result.data)
                        logger.info(f"Found {len(result.data)} tokens in hostaway_tokens")
                except Exception as e:
                    logger.debug(f"hostaway_tokens table not accessible: {str(e)}")
            
            logger.info(f"Total tokens found for tenant {tenant_id}: {len(all_tokens)}")
            return all_tokens
            
        except Exception as e:
            logger.error(f"Error fetching tokens: {str(e)}")
            return []
    
    @staticmethod
    async def sync_properties_from_hostaway(properties: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Sync properties from Hostaway with tenant isolation"""
        tenant_id = get_tenant_id()
        
        if not tenant_id:
            logger.error("No tenant_id in context - cannot sync properties")
            return {"success": False, "error": "No tenant context"}
        
        logger.info(f"SecureClient.sync_properties for tenant: {tenant_id}")
        
        result = {
            "created": 0,
            "updated": 0,
            "failed": 0,
            "errors": []
        }
        
        try:
            for property_data in properties:
                try:
                    # Ensure tenant_id is set
                    property_data['tenant_id'] = tenant_id
                    
                    # Check if property exists
                    existing = (
                        supabase.table('properties')
                        .select('id')
                        .eq('hostaway_id', property_data['hostaway_id'])
                        .eq('tenant_id', tenant_id)
                        .execute()
                    )
                    
                    if existing.data:
                        # Update existing
                        supabase.table('properties').update(property_data).eq(
                            'hostaway_id', property_data['hostaway_id']
                        ).eq('tenant_id', tenant_id).execute()
                        result['updated'] += 1
                    else:
                        # Create new
                        supabase.table('properties').insert(property_data).execute()
                        result['created'] += 1
                        
                except Exception as e:
                    result['failed'] += 1
                    result['errors'].append(f"Property {property_data.get('name', 'Unknown')}: {str(e)}")
                    logger.error(f"Error syncing property: {str(e)}")
            
            result['success'] = True
            logger.info(f"Sync complete: created={result['created']}, updated={result['updated']}, failed={result['failed']}")
            
        except Exception as e:
            result['success'] = False
            result['error'] = str(e)
            logger.error(f"Error in property sync: {str(e)}")
        
        return result
    
    @staticmethod
    async def get_company_settings() -> Optional[Dict[str, Any]]:
        """Get company settings for the current tenant"""
        tenant_id = get_tenant_id()
        
        if not tenant_id:
            logger.warning("No tenant_id in context - returning None")
            return None
        
        logger.info(f"SecureClient.get_company_settings for tenant: {tenant_id}")
        
        try:
            result = (
                supabase.table('company_settings')
                .select('*')
                .eq('tenant_id', tenant_id)
                .limit(1)
                .execute()
            )
            
            if result.data and len(result.data) > 0:
                return result.data[0]
            else:
                logger.info(f"No company settings found for tenant {tenant_id}")
                return None
                
        except Exception as e:
            logger.error(f"Error fetching company settings: {str(e)}")
            return None