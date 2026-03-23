import { supabase } from '../lib/supabase';

// Quick session check utility
export const quickSessionCheck = async (): Promise<boolean> => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return !!session;
  } catch (error) {
    console.error('[quickSessionCheck] Error checking session:', error);
    return false;
  }
};