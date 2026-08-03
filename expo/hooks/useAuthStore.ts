import createContextHook from "@nkzw/create-context-hook";
import { useState, useCallback, useMemo, useEffect } from "react";
import { User, UserRole } from "@/types";
import { supabase } from "@/lib/supabase";
import { uploadAvatar } from "@/lib/uploadAvatar";
import { signInWithSocialProvider, SocialProvider } from "@/lib/socialAuth";
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
  const [needsProfileCustomization, setNeedsProfileCustomization] = useState<boolean>(false);
  const [session, setSession] = useState<Session | null>(null);

  // ================================================================
  // AUTH STATE LISTENER — runs once on mount, handles session restore
  // ================================================================
  useEffect(() => {
    // Restore the persisted session.
    //
    // LAUNCH SAFETY — `loading` starts true and `app/index.tsx` shows the
    // loading screen for as long as it stays true, so every path out of this
    // promise has to clear it. It previously had no `.catch()`: a rejection
    // left `loading` true forever and the app sat on the logo, which reads as
    // "it doesn't open" and is what a store reviewer reports as a launch
    // crash.
    //
    // This is also the one launch path that behaves differently on an *update*
    // than on a fresh install. `getSession()` reads a token that a previous
    // version of the app wrote into AsyncStorage; a fresh install has nothing
    // to read and cannot fail here. If an update is dying on open and a clean
    // install is not, this is the first place to look — and now it degrades to
    // a signed-out app rather than a dead one.
    supabase.auth
      .getSession()
      .then(({ data: { session: s } }) => {
        setSession(s);
        if (s?.user) {
          setLoading(true);
          loadUserProfile(s.user.id).finally(() => setLoading(false));
        } else {
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error("[Auth] getSession failed; starting signed out:", err);
        setSession(null);
        setUser(GUEST_USER);
        setLoading(false);
      });

    // Listen for auth changes (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event: AuthChangeEvent, s: Session | null) => {
        setSession(s);
        if (event === "SIGNED_IN" && s?.user) {
          setLoading(true);
          // A throw here would escape into Supabase's listener, which nothing
          // catches — and would strand `loading` true on the way past.
          try {
            await loadUserProfile(s.user.id);
          } catch (err) {
            console.error("[Auth] loadUserProfile failed:", err);
          } finally {
            setLoading(false);
          }
        } else if (event === "SIGNED_OUT") {
          setUser(GUEST_USER);
          setNeedsRoleSelection(false);
          setNeedsProfileCustomization(false);
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
          country: meta?.country?.trim() || null,
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
          country: defaultProfile.country ?? undefined,
        });
        // A brand-new profile row (created here, not by the signup flow) has
        // never been through nation/car customization — this is the path
        // every social sign-in was silently taking, straight into the app.
        setNeedsProfileCustomization(true);
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
        country: profile.country ?? undefined,
      };

      setUser(loadedUser);
      setNeedsProfileCustomization(!profile.registration_completed_at);
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
  const signup = useCallback(async (email: string, password: string, name: string, phone?: string, country?: string) => {
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
            country: country ?? "",
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
          country: country?.trim() || null,
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
  // SOCIAL SIGN-IN (Google / Apple)
  // ================================================================
  const signInWithSocial = useCallback(async (provider: SocialProvider) => {
    try {
      setLoading(true);
      setError(null);

      const newSession = await signInWithSocialProvider(provider);

      if (newSession?.user) {
        setSession(newSession);
        await loadUserProfile(newSession.user.id);
        return true;
      }

      return false;
    } catch (err) {
      console.error(`${provider} sign-in error:`, err);
      setError(err instanceof Error ? err.message : "Sign-in failed. Please try again.");
      return false;
    } finally {
      setLoading(false);
    }
  }, [loadUserProfile]);

  const signInWithGoogle = useCallback(() => signInWithSocial("google"), [signInWithSocial]);
  const signInWithApple = useCallback(() => signInWithSocial("apple"), [signInWithSocial]);

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

      // Upload to Supabase Storage so the avatar persists across devices.
      // Fall back to the raw local URI if the upload can't complete.
      let finalUrl = imageUri;
      try {
        finalUrl = await uploadAvatar(session.user.id, imageUri);
      } catch (uploadErr) {
        console.warn("Avatar upload failed, storing local URI instead:", uploadErr);
      }

      const { error: updErr } = await supabase
        .from("profiles")
        .update({ avatar: finalUrl })
        .eq("id", session.user.id);

      if (updErr) {
        setError(updErr.message);
        return false;
      }

      const updatedUser = { ...user, profilePicture: finalUrl };
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

  const updateCountry = useCallback(async (country: string) => {
    if (!user || !session?.user) return false;
    try {
      const next = country.trim();
      const { error: updErr } = await supabase
        .from("profiles")
        .update({ country: next })
        .eq("id", session.user.id);
      if (updErr) {
        setError(updErr.message);
        return false;
      }
      setUser({ ...user, country: next });
      return true;
    } catch (err) {
      console.error("Country update error:", err);
      setError("Failed to update country.");
      return false;
    }
  }, [user, session]);

  // ================================================================
  // COMPLETE PROFILE CUSTOMIZATION — the step every signup path (email,
  // Google, Apple) is routed through once, before it ever reaches the app.
  // ================================================================
  const completeProfileCustomization = useCallback(async (country?: string) => {
    if (!user || !session?.user) return false;
    try {
      const updates: { registration_completed_at: string; country?: string } = {
        registration_completed_at: new Date().toISOString(),
      };
      const trimmedCountry = country?.trim();
      if (trimmedCountry) updates.country = trimmedCountry;

      const { error: updErr } = await supabase
        .from("profiles")
        .update(updates)
        .eq("id", session.user.id);

      if (updErr) {
        setError(updErr.message);
        return false;
      }

      setUser({
        ...user,
        registrationCompletedAt: updates.registration_completed_at as unknown as number,
        country: trimmedCountry || user.country,
      });
      setNeedsProfileCustomization(false);
      return true;
    } catch (err) {
      console.error("Profile customization error:", err);
      setError("Failed to save your profile. Please try again.");
      return false;
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
    needsProfileCustomization,
    login,
    signup,
    signUp,
    signInWithGoogle,
    signInWithApple,
    logout,
    setRole,
    setCustomerRole,
    switchAccountType,
    updateProfilePicture,
    updateCountry,
    completeProfileCustomization,
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
  }), [user, session, loading, error, needsRoleSelection, needsProfileCustomization, login, signup, signUp, signInWithGoogle, signInWithApple, logout, setRole, setCustomerRole, switchAccountType, updateProfilePicture, updateCountry, completeProfileCustomization, loadUserProfile]);
});
