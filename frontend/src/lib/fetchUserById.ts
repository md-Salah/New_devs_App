// This file provides a safe alternative to auth.admin.getUserById
// which requires service role keys that should never be exposed in the frontend

import { supabase } from './supabase';

export async function fetchUserById(userId: string): Promise<any> {
  try {
    console.log("fetchUserById called for:", userId);
    
    // Get current session to check if user is authenticated
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      throw new Error("Not authenticated");
    }
    
    // If viewing self, return session user data
    if (session.user.id === userId) {
      return {
        id: session.user.id,
        email: session.user.email,
        created_at: session.user.created_at,
        last_sign_in_at: session.user.last_sign_in_at,
        user_metadata: session.user.user_metadata || {},
        app_metadata: session.user.app_metadata || {},
      };
    }
    
    // For other users, we need to call the backend API
    // which has proper service role access
    const backendUrl = import.meta.env.VITE_BACKEND_URL || '';
    const response = await fetch(`${backendUrl}/api/v1/users/brief?ids=${userId}`, {
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch user: ${response.statusText}`);
    }
    
    const data = await response.json();
    const users = data.users || [];
    
    if (users.length === 0) {
      throw new Error("User not found");
    }
    
    // Return the first user (should be only one)
    return users[0];
    
  } catch (error: any) {
    console.error("Error fetching user by ID:", error);
    throw error;
  }
}

// Helper function to safely get user info without admin privileges
export async function getUserInfoSafely(userId: string): Promise<{
  email: string;
  name: string;
  isAdmin: boolean;
  createdAt: string;
  status: string;
}> {
  try {
    // Get current session
    const { data: { session } } = await supabase.auth.getSession();
    
    // If viewing self, we have more data
    if (session?.user?.id === userId) {
      return {
        email: session.user.email || "",
        name: session.user.user_metadata?.name || session.user.email?.split("@")[0] || "",
        isAdmin: session.user.app_metadata?.role === "admin" || false,
        createdAt: session.user.created_at || "",
        status: session.user.user_metadata?.status || "active"
      };
    }
    
    // For other users, return limited info
    // Check permissions to see if user is admin
    const { data: permissions } = await supabase
      .from("user_permissions")
      .select("section, action")
      .eq("user_id", userId)
      .limit(1);
    
    const isAdmin = permissions?.some(p => p.section === "*" && p.action === "*") || false;
    
    return {
      email: `User ${userId.slice(0, 8)}`,
      name: `User ${userId.slice(0, 8)}`,
      isAdmin,
      createdAt: new Date().toISOString(),
      status: "active"
    };
    
  } catch (error) {
    console.error("Error getting user info:", error);
    // Return safe defaults
    return {
      email: "",
      name: "",
      isAdmin: false,
      createdAt: "",
      status: "unknown"
    };
  }
}