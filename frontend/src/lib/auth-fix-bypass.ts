/**
 * This intercepts and prevents calls to admin.getUserById
 */

// Store the original supabase auth admin if it exists
let originalGetUserById: any = null;

export function installAuthBypass() {
  try {
    // Get supabase instance
    const supabase = (window as any).supabase || {};
    
    if (supabase?.auth?.admin?.getUserById) {
      console.log("🔧 Installing auth bypass to prevent admin API calls");
      
      // Store original function
      originalGetUserById = supabase.auth.admin.getUserById;
      
      // Replace with safe version
      supabase.auth.admin.getUserById = async (userId: string) => {
        console.warn(`⚠️ Blocked attempt to call admin.getUserById(${userId})`);
        
        // Return a mock user object to prevent errors
        return {
          data: {
            user: {
              id: userId,
              email: `user-${userId.substring(0, 8)}@example.com`,
              created_at: new Date().toISOString(),
              user_metadata: {},
              app_metadata: {}
            }
          },
          error: null
        };
      };
      
      console.log("✅ Auth bypass installed successfully");
    }
  } catch (error) {
    console.error("Failed to install auth bypass:", error);
  }
}

export function removeAuthBypass() {
  try {
    const supabase = (window as any).supabase || {};
    
    if (supabase?.auth?.admin?.getUserById && originalGetUserById) {
      supabase.auth.admin.getUserById = originalGetUserById;
      console.log("🔧 Auth bypass removed");
    }
  } catch (error) {
    console.error("Failed to remove auth bypass:", error);
  }
}