import createContextHook from "@nkzw/create-context-hook";
import { useState, useCallback, useMemo, useEffect } from "react";
import { User, UserRole } from "@/types";
import { supabase } from "@/lib/supabase";
import type { Session, AuthChangeEvent } from "@supabase/supabase-js";

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

// Level-based titles
const LEVEL_TITLES: Record<number, string> = {
  1: "Rookie Driver",
  5: "Street Racer",
  10: "Pro Drifter",
  15: "Elite Driver",
  20: "Speed Demon",
  25: "Track Master",
  30: "Racing Legend",
  40: "Hall of Fame",
  50: "G.O.A.T.",
};

function getTitleForLevel(level: number): string {
  const thresholds = Object.keys(LEVEL_TITLES).map(Number).sort((a, b) => b - a);
  for (const t of thresholds) {
    if (level >= t) return LEVEL_TITLES[t];
  }
  return LEVEL_TITLES[1];
}

export const [AuthContext, useAuth] = createContextHook(() => {
  const [user, setUser] = useState<User | null>(GUEST_USER);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [needsRoleSelection, setNeedsRoleSelection] = useState<boolean>(false);
  const [session, setSession] = useState<Session | null>(null);

  // ================================================================
  // AUTH STATE LISTENER — runs once on mount, handles session restore
  // ================================================================
  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      if (s?.user) {
        setLoading(true);
        loadUserProfile(s.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    // Listen for auth changes (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event: AuthChangeEvent, s: Session | null) => {
        setSession(s);
        if (event === "SIGNED_IN" && s?.user) {
          setLoading(true);
          await loadUserProfile(s.user.id);
          setLoading(false);
        } else if (event === "SIGNED_OUT") {
          setUser(GUEST_USER);
          setNeedsRoleSelection(false);
          setError(null);
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // ================================================================
  // LOAD USER PROFILE from Supabase
  // ================================================================
  const loadUserProfile = useCallback(async (userId: string) => {
    try {
      const { data: profile, error: profileErr } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();

      if (profileErr || !profile) {
        // Try to create a default profile
        const { data: sessionData } = await supabase.auth.getSession();
        const meta = sessionData?.session?.user?.user_metadata;
        const defaultProfile = {
          id: userId,
          email: sessionData?.session?.user?.email ?? "",
          name: meta?.name ?? "Driver",
          phone: meta?.phone ?? null,
          role: "customer" as UserRole,
          account_status: "active",
          verification_status: "verified",
        };

        await supabase.from("profiles").upsert(defaultProfile);

        setUser({
          id: userId,
          name: defaultProfile.name,
          email: defaultProfile.email,
          phone: defaultProfile.phone ?? "",
          role: "customer",
          profilePicture: undefined,
          accountStatus: "active",
          verificationStatus: "verified",
          canSwitchRoles: false,
        });
        return;
      }

      const loadedUser: User = {
        id: profile.id,
        name: profile.name,
        email: profile.email,
        phone: profile.phone ?? "",
        role: profile.role as UserRole,
        profilePicture: profile.avatar,
        accountStatus: profile.account_status ?? "active",
        verificationStatus: profile.verification_status ?? "verified",
        canSwitchRoles: false,
        registrationCompletedAt: profile.registration_completed_at,
        verifiedAt: profile.verified_at,
      };

      setUser(loadedUser);
      setError(null);
    } catch (err) {
      console.error("Profile load error:", err);
    }
  }, []);

  // ================================================================
  // LOGIN
  // ================================================================
  const login = useCallback(async (email: string, password: string) => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: signInErr } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInErr) {
        setError(signInErr.message);
        return false;
      }

      if (data.user) {
        setSession(data.session);
        await loadUserProfile(data.user.id);
        return true;
      }

      return false;
    } catch (err) {
      console.error("Login error:", err);
      setError("Login failed. Please try again.");
      return false;
    } finally {
      setLoading(false);
    }
  }, [loadUserProfile]);

  // ================================================================
  // SIGNUP
  // ================================================================
  const signup = useCallback(async (email: string, password: string, name: string, phone?: string) => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: signUpErr } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            name,
            phone: phone ?? "",
          },
        },
      });

      if (signUpErr) {
        setError(signUpErr.message);
        return false;
      }

      if (data.user) {
        // The database triggers will auto-create:
        // - profile (via handle_new_user_xp and manual insert below)
        // - starter car (via handle_new_user_starter_car)
        // - xp row (via handle_new_user_xp)
        // - wallet (via handle_new_user)

        // Create the profile explicitly
        const newProfile = {
          id: data.user.id,
          email: data.user.email || email,
          name: name || email.split("@")[0],
          phone: phone || null,
          role: "customer" as UserRole,
          account_status: "active",
          verification_status: "verified",
        };

        await supabase.from("profiles").upsert(newProfile);

        // Auto sign in after signup
        const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (signInErr) {
          console.error("Auto sign-in error:", signInErr);
        } else if (signInData.user) {
          setSession(signInData.session);
          await loadUserProfile(signInData.user.id);
        }

        return true;
      }

      return false;
    } catch (err) {
      console.error("Signup error:", err);
      setError("Registration failed. Please try again.");
      return false;
    } finally {
      setLoading(false);
    }
  }, [loadUserProfile]);

  // ================================================================
  // LOGOUT
  // ================================================================
  const logout = useCallback(async () => {
    try {
      setError(null);
      await supabase.auth.signOut();
      setUser(GUEST_USER);
      setSession(null);
      setNeedsRoleSelection(false);
      return true;
    } catch (err) {
      console.error("Logout error:", err);
      return false;
    }
  }, []);

  // ================================================================
  // SET ROLE
  // ================================================================
  const setRole = useCallback(async (role: UserRole) => {
    if (!session?.user) return false;

    try {
      setLoading(true);

      const { data: existingProfile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", session.user.id)
        .single();

      if (existingProfile) {
        const { error: updErr } = await supabase
          .from("profiles")
          .update({ role })
          .eq("id", session.user.id);

        if (updErr) {
          setError(updErr.message);
          return false;
        }

        const updatedUser: User = {
          id: existingProfile.id,
          email: existingProfile.email,
          name: existingProfile.name,
          phone: existingProfile.phone,
          role,
          profilePicture: existingProfile.avatar,
          accountStatus: existingProfile.account_status || "active",
          verificationStatus: "verified",
          canSwitchRoles: false,
          registrationCompletedAt: existingProfile.registration_completed_at,
          verifiedAt: existingProfile.verified_at,
        };
        setUser(updatedUser);
      } else {
        const newProfile = {
          id: session.user.id,
          email: session.user.email || "",
          name: session.user.user_metadata?.name || "User",
          phone: session.user.user_metadata?.phone || null,
          role,
        };

        const { error: insErr } = await supabase
          .from("profiles")
          .insert(newProfile);

        if (insErr) {
          setError(insErr.message);
          return false;
        }

        setUser({
          ...newProfile,
          profilePicture: undefined,
          accountStatus: "active",
          verificationStatus: "verified",
          canSwitchRoles: false,
        });
      }

      setNeedsRoleSelection(false);
      return true;
    } catch (err) {
      console.error("Role set error:", err);
      setError("Failed to set role. Please try again.");
      return false;
    } finally {
      setLoading(false);
    }
  }, [session]);

  const setCustomerRole = useCallback(async () => {
    return setRole("customer");
  }, [setRole]);

  const switchAccountType = useCallback(async () => {
    console.warn("Account switching is not allowed.");
    return false;
  }, []);

  const updateProfilePicture = useCallback(async (imageUri: string) => {
    if (!user || !session?.user) return false;

    try {
      setLoading(true);
      setError(null);

      const { error: updErr } = await supabase
        .from("profiles")
        .update({ avatar: imageUri })
        .eq("id", session.user.id);

      if (updErr) {
        setError(updErr.message);
        return false;
      }

      const updatedUser = { ...user, profilePicture: imageUri };
      setUser(updatedUser);
      return true;
    } catch (err) {
      console.error("Profile picture update error:", err);
      setError("Failed to update profile picture.");
      return false;
    } finally {
      setLoading(false);
    }
  }, [user, session]);

  // alias for simplified signup
  const signUp = useCallback(async (email: string, password: string) => {
    return signup(email, password, email.split("@")[0]);
  }, [signup]);

  return useMemo(() => ({
    user,
    session,
    loading,
    error,
    needsRoleSelection,
    login,
    signup,
    signUp,
    logout,
    setRole,
    setCustomerRole,
    switchAccountType,
    updateProfilePicture,
    loadUserProfile,
    getTitleForLevel,
    isAuthenticated: !!user && user.id !== GUEST_USER.id,
    isGuest: user?.id === GUEST_USER.id,
    isCustomer: user?.role === "customer",
    isDriver: user?.role === "driver",
    isVerified: user?.verificationStatus === "verified",
    isPendingVerification: user?.verificationStatus === "pending" || user?.verificationStatus === "under_review",
    isAccountActive: user?.accountStatus === "active",
    requiresDocuments: user?.verificationStatus === "requires_documents",
    isVerifiedCustomer: user?.role === "customer",
  }), [user, session, loading, error, needsRoleSelection, login, signup, signUp, logout, setRole, setCustomerRole, switchAccountType, updateProfilePicture, loadUserProfile]);
});
