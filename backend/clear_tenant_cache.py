#!/usr/bin/env python3
"""
Clear cache for specific tenant
Usage: python clear_tenant_cache.py [tenant_id]
"""

import sys
import os
sys.path.append('./test')
from clear_cache import clear_specific_tenant_cache

TENANT_ID = "5a382f72-aec3-40f1-9063-89476ae00669"

def main():
    tenant_id = sys.argv[1] if len(sys.argv) > 1 else TENANT_ID
    
    print(f"🗑️  Clearing cache for tenant: {tenant_id}")
    print("=" * 60)
    
    success = clear_specific_tenant_cache(tenant_id)
    
    if success:
        print(f"✅ Successfully cleared cache for tenant {tenant_id}")
        print("\n💡 Next steps:")
        print("1. Test the city access API again")
        print("2. Check if admin users now see 'berlin' in their cities")
        print("3. Monitor cache regeneration")
    else:
        print(f"❌ Failed to clear cache for tenant {tenant_id}")
        print("   You may need to clear cache manually via Redis CLI")

if __name__ == "__main__":
    main()