import createContextHook from "@nkzw/create-context-hook";
import { useState, useCallback, useMemo } from "react";
import { User, UserRole } from "@/types";
import { supabase } from "@/lib/supabase";
import type { Session } from '@supabase/supabase-js';

const GUEST_USER: User = {
  id: "guest-user",
  name: "Guest User",
  email: "",
  phone: "",
  role: "customer",
  accountStatus: "active",
  verificationStatus: "verified",
  canSwitchRoles: false,
};

export const [AuthContext, useAuth] = createContextHook(() => {
  const [user, setUser] = useState<User | null>(GUEST_USER);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [needsRoleSelection, setNeedsRoleSelection] = useState<boolean>(false);
  const [session, setSession] = useState<Session | null>(null);

  const login = useCallback(async (email: string, password: string) => {
    try {
      setLoading(true);
      setError(null);
      
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setError(error.message);
        return false;
      }

      if (data.user) {
        // User profile will be loaded by the auth state change listener
        return true;
      }
      
      return false;
    } catch (err) {
      console.error('Login error:', err);
      setError('Login failed. Please try again.');
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const signup = useCallback(async (email: string, password: string, name: string, phone?: string) => {
    try {
      setLoading(true);
      setError(null);
      
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            name,
            phone,
          }
        }
      });

      if (error) {
        setError(error.message);
        return false;
      }

      if (data.user) {
        // Profile will be created after role selection
        return true;
      }
      
      return false;
    } catch (err) {
      console.error('Signup error:', err);
      setError('Signup failed. Please try again.');
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  // Simplified signUp for direct customer registration
  const signUp = useCallback(async (email: string, password: string) => {
    try {
      setLoading(true);
      setError(null);
      
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) {
        setError(error.message);
        return false;
      }

      if (data.user) {
        // Automatically create customer profile
        const newProfile = {
          id: data.user.id,
          email: data.user.email || email,
          name: email.split('@')[0], // Use email prefix as default name
          role: 'customer' as UserRole,
          account_status: 'active',
          verification_status: 'verified',
        };
        
        const { error: profileError } = await supabase
          .from('profiles')
          .insert(newProfile);

        if (profileError) {
          console.error('Profile creation error:', profileError);
          // Don't fail the signup if profile creation fails
          // It will be created on first login
        }

        // Auto sign in after signup
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (signInError) {
          console.error('Auto sign-in error:', signInError);
        }

        return true;
      }
      
      return false;
    } catch (err) {
      console.error('SignUp error:', err);
      setError('Registration failed. Please try again.');
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    setError(null);
    setUser(GUEST_USER);
    setSession(null);
    setNeedsRoleSelection(false);
    return true;
  }, []);

  const setRole = useCallback(async (role: UserRole) => {
    if (!session?.user) return false;
    
    try {
      setLoading(true);
      
      // Check if profile exists
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();
      
      if (existingProfile) {
        // Update existing profile
        const { error } = await supabase
          .from('profiles')
          .update({ role })
          .eq('id', session.user.id);

        if (error) {
          setError(error.message);
          return false;
        }

        const updatedUser: User = { 
          id: existingProfile.id,
          email: existingProfile.email,
          name: existingProfile.name,
          phone: existingProfile.phone,
          role, 
          profilePicture: existingProfile.avatar,
          accountStatus: existingProfile.account_status || 'active',
          verificationStatus: 'verified',
          canSwitchRoles: false,
          registrationCompletedAt: existingProfile.registration_completed_at,
          verifiedAt: existingProfile.verified_at,
        };
        setUser(updatedUser);
      } else {
        // Create new profile
        const newProfile = {
          id: session.user.id,
          email: session.user.email || '',
          name: session.user.user_metadata?.name || 'User',
          phone: session.user.user_metadata?.phone || null,
          role,
        };
        
        const { error } = await supabase
          .from('profiles')
          .insert(newProfile);

        if (error) {
          setError(error.message);
          return false;
        }

        setUser({ 
          ...newProfile, 
          profilePicture: undefined, 
          accountStatus: 'active',
          verificationStatus: 'verified',
          canSwitchRoles: false,
        });
      }
      
      setNeedsRoleSelection(false);
      return true;
    } catch (err) {
      console.error('Role set error:', err);
      setError('Failed to set role. Please try again.');
      return false;
    } finally {
      setLoading(false);
    }
  }, [session]);

  // REMOVED: Account switching is not allowed
  // Users must register separately for each account type
  const switchAccountType = useCallback(async () => {
    console.warn('Account switching is not allowed. Users must register separately for each account type.');
    return false;
  }, []);

  const setCustomerRole = useCallback(async () => {
    console.log('setCustomerRole called');
    const result = await setRole('customer');
    console.log('setCustomerRole result:', result);
    return result;
  }, [setRole]);


  const updateProfilePicture = useCallback(async (imageUri: string) => {
    if (!user || !session?.user) return false;
    
    try {
      setLoading(true);
      setError(null);
      
      // For now, we'll just store the local URI
      // In a real app, you'd upload to a storage service first
      const { error } = await supabase
        .from('profiles')
        .update({ avatar: imageUri })
        .eq('id', session.user.id);

      if (error) {
        setError(error.message);
        return false;
      }

      const updatedUser = { ...user, profilePicture: imageUri };
      setUser(updatedUser);
      return true;
    } catch (err) {
      console.error('Profile picture update error:', err);
      setError('Failed to update profile picture. Please try again.');
      return false;
    } finally {
      setLoading(false);
    }
  }, [user, session]);

  return useMemo(() => ({
    user,
    session,
    loading,
    error,
    needsRoleSelection,
    login,
    signup,
    signUp, // Simplified signup for customers
    logout,
    setRole,
    setCustomerRole,
    switchAccountType,
    updateProfilePicture,
    isAuthenticated: !!user && user.id !== GUEST_USER.id,
    isGuest: user?.id === GUEST_USER.id,
    isCustomer: user?.role === 'customer',
    isDriver: user?.role === 'driver',
    // Account verification helpers
    isVerified: user?.verificationStatus === 'verified',
    isPendingVerification: user?.verificationStatus === 'pending' || user?.verificationStatus === 'under_review',
    isAccountActive: user?.accountStatus === 'active',
    requiresDocuments: user?.verificationStatus === 'requires_documents',
    // All customers are verified by default
    isVerifiedCustomer: user?.role === 'customer'
  }), [user, session, loading, error, needsRoleSelection, login, signup, signUp, logout, setRole, setCustomerRole, switchAccountType, updateProfilePicture]);
});