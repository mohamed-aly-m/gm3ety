import React, { createContext, useContext, useState, useEffect } from "react";
import { supabase, isSupabaseConfigured } from "../lib/supabase";
import { associationCache } from "../services/associationCache";

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    try {
      const savedUser = localStorage.getItem("gam3ety_user");
      return savedUser ? JSON.parse(savedUser) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [authError, setAuthError] = useState(null);

  // Fetch user profile from Supabase profiles table, or initialize idempotently if missing
  const ensureSupabaseProfile = async (authUser) => {
    if (!isSupabaseConfigured() || !authUser?.id) return null;
    try {
      // 1. Fetch existing profile
      const { data, error: profErr } = await supabase
        .from("profiles")
        .select("id, name, mobile, email, created_at")
        .eq("id", authUser.id)
        .maybeSingle();

      if (data) {
        return {
          id: data.id,
          name: data.name || "منظم الجمعية",
          mobile: data.mobile || "",
          email: data.email || authUser.email || "",
          createdAt: data.created_at || new Date().toISOString(),
        };
      }

      // 2. Profile missing -> Idempotently initialize for this authenticated user
      let rawName =
        authUser.user_metadata?.name ||
        authUser.user_metadata?.full_name ||
        authUser.email?.split("@")[0] ||
        "منظم الجمعية";
      rawName = String(rawName).trim();
      if (rawName.length < 2) rawName = "منظم الجمعية";

      const newProf = {
        id: authUser.id,
        name: rawName,
        mobile: authUser.user_metadata?.mobile || authUser.user_metadata?.phone_number || null,
        email: authUser.email ? String(authUser.email).trim().toLowerCase() : null,
      };

      const { data: inserted, error: insertErr } = await supabase
        .from("profiles")
        .upsert(newProf, { onConflict: "id", ignoreDuplicates: true })
        .select("id, name, mobile, email, created_at")
        .maybeSingle();

      if (insertErr) {
        console.warn("[GAM3ETY AUTH] Profile upsert warning:", insertErr.message);
      }

      const finalData = inserted || newProf;
      return {
        id: finalData.id,
        name: finalData.name,
        mobile: finalData.mobile || "",
        email: finalData.email || authUser.email || "",
        createdAt: finalData.created_at || new Date().toISOString(),
      };
    } catch (err) {
      console.error("[GAM3ETY AUTH] Profile lookup/init exception:", err);
      return null;
    }
  };

  // Sync session on mount
  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setLoading(false);
      return;
    }

    const initAuth = async () => {
      try {
        const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
        if (sessionErr) throw sessionErr;

        if (sessionData?.session?.user) {
          const authUser = sessionData.session.user;
          const fullUser = await ensureSupabaseProfile(authUser);
          if (fullUser) {
            setUser(fullUser);
            localStorage.setItem("gam3ety_user", JSON.stringify(fullUser));
          }
        } else {
          setUser(null);
          localStorage.removeItem("gam3ety_user");
        }
      } catch (err) {
        console.error("[GAM3ETY AUTH] Session init error:", err);
      } finally {
        setLoading(false);
      }
    };

    initAuth();

    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log("[GAM3ETY AUTH EVENT]", event);
      if (event === "PASSWORD_RECOVERY") {
        setRecoveryMode(true);
      }

      if (session?.user) {
        const authUser = session.user;
        const fullUser = await ensureSupabaseProfile(authUser);
        if (fullUser) {
          setUser(fullUser);
          localStorage.setItem("gam3ety_user", JSON.stringify(fullUser));
        }
      } else if (event === "SIGNED_OUT") {
        setUser(null);
        localStorage.removeItem("gam3ety_user");
        associationCache.clear();
      }
    });

    return () => {
      authListener?.subscription?.unsubscribe();
    };
  }, []);

  // Login with Email or Mobile + Password
  const login = async (identifier, password) => {
    setLoading(true);
    setError(null);
    try {
      if (!isSupabaseConfigured()) {
        throw new Error("إعدادات Supabase غير متصلة.");
      }

      const cleanIdentifier = String(identifier || "").trim().toLowerCase();
      let loginEmail = cleanIdentifier;

      // If mobile number entered instead of email, find corresponding email in profiles
      if (!cleanIdentifier.includes("@")) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("email, mobile, name")
          .or(`mobile.eq.${cleanIdentifier},name.ilike.${cleanIdentifier}`)
          .maybeSingle();

        if (profile?.email) {
          loginEmail = profile.email;
        } else {
          throw new Error("لم يتم العثور على حساب مسجل برقم الموبايل هذا. يرجى إدخال البريد الإلكتروني.");
        }
      }

      const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password: password,
      });

      if (authErr) {
        if (authErr.message.includes("Invalid login credentials")) {
          throw new Error("البريد الإلكتروني أو كلمة المرور غير صحيحة");
        }
        throw new Error(authErr.message);
      }

      if (authData?.user) {
        const prof = await ensureSupabaseProfile(authData.user);
        if (prof) {
          setUser(prof);
          localStorage.setItem("gam3ety_user", JSON.stringify(prof));
          return { success: true, user: prof };
        }
      }
    } catch (err) {
      setError(err.message);
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  };

  // Register New User
  const register = async (name, mobile, email, password) => {
    setLoading(true);
    setError(null);
    try {
      if (!isSupabaseConfigured()) {
        throw new Error("إعدادات Supabase غير متصلة.");
      }

      const cleanEmail = String(email || "").trim().toLowerCase();
      const cleanMobile = String(mobile || "").trim();
      const cleanName = String(name || "").trim();

      const { data: authData, error: authErr } = await supabase.auth.signUp({
        email: cleanEmail,
        password: password,
        options: {
          data: {
            name: cleanName,
            full_name: cleanName,
            mobile: cleanMobile,
            phone_number: cleanMobile,
          },
        },
      });

      if (authErr) {
        if (authErr.message.includes("User already registered")) {
          throw new Error("البريد الإلكتروني مسجل بالفعل");
        }
        throw new Error(authErr.message);
      }

      if (authData?.user) {
        const createdUser = await ensureSupabaseProfile({
          ...authData.user,
          user_metadata: {
            ...authData.user.user_metadata,
            name: cleanName,
            full_name: cleanName,
            mobile: cleanMobile,
          },
        });

        if (createdUser) {
          setUser(createdUser);
          localStorage.setItem("gam3ety_user", JSON.stringify(createdUser));
          return { success: true, user: createdUser };
        }
      }
    } catch (err) {
      setError(err.message);
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  };

  // Logout
  const logout = async () => {
    try {
      if (isSupabaseConfigured()) {
        await supabase.auth.signOut();
      }
    } catch (err) {
      console.error("Logout error:", err);
    } finally {
      setUser(null);
      localStorage.removeItem("gam3ety_user");
      associationCache.clear();
    }
  };

  // Request password reset email
  const resetPasswordForEmail = async (email) => {
    if (!isSupabaseConfigured()) throw new Error("إعدادات Supabase غير متصلة.");
    const cleanEmail = String(email || "").trim().toLowerCase();
    const { error: resetErr } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
      redirectTo: `${window.location.origin}/auth?mode=reset_confirm`,
    });
    if (resetErr) throw new Error(resetErr.message);
    return { success: true };
  };

  // Update password (used during password recovery)
  const updatePassword = async (newPassword) => {
    if (!isSupabaseConfigured()) throw new Error("إعدادات Supabase غير متصلة.");
    const { data: updateData, error: updateErr } = await supabase.auth.updateUser({
      password: newPassword,
    });
    if (updateErr) throw new Error(updateErr.message);
    setRecoveryMode(false);
    return { success: true, user: updateData.user };
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        error,
        recoveryMode,
        setRecoveryMode,
        authError,
        setAuthError,
        login,
        register,
        logout,
        resetPasswordForEmail,
        updatePassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
