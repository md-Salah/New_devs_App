import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { SecureAPI } from '../lib/secureApi';
import { useAuth } from '../contexts/AuthContext.new';

interface UserProfile {
  id?: string;
  user_id: string;
  display_name?: string;
  avatar_url?: string;
  first_name?: string;
  last_name?: string;
  phone?: string | null;
  department?: string | null;
  bio?: string | null;
  timezone?: string | null;
}

export function useUserProfile() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadProfile = useCallback(async () => {
    if (!user?.id) {
      setProfile(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const res = await SecureAPI.getMyProfile();
      const p = res?.profile || null;
      if (p) {
        setProfile({
          id: p.id,
          user_id: p.user_id || user.id,
          display_name: p.display_name || user.user_metadata?.name || user.email?.split('@')[0] || 'User',
          avatar_url: p.avatar_url || null,
          first_name: p.first_name || null,
          last_name: p.last_name || null,
          phone: p.phone ?? null,
          department: p.department ?? null,
          bio: p.bio ?? null,
          timezone: p.timezone ?? null,
        });
      } else {
        // Fallback safe default
        setProfile({
          user_id: user.id,
          display_name: user.user_metadata?.name || user.email?.split('@')[0] || 'User',
          avatar_url: null,
          first_name: user.user_metadata?.first_name,
          last_name: user.user_metadata?.last_name,
        });
      }
    } catch (error) {
      console.error('Error loading user profile:', error);
      setError('Failed to load profile');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  // Subscribe to profile changes
  useEffect(() => {
    if (!user?.id) return;

    const subscription = supabase
      .channel('user_profile_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_profiles',
          filter: `user_id=eq.${user.id}`
        },
        (payload) => {
          if (payload.eventType === 'UPDATE' || payload.eventType === 'INSERT') {
            setProfile(payload.new as UserProfile);
          }
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [user?.id]);

  const refreshProfile = useCallback(() => {
    loadProfile();
  }, [loadProfile]);

  return {
    profile,
    loading,
    error,
    refreshProfile
  };
}
