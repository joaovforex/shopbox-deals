import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";

/**
 * Cliente-side auth hook.
 * Retorna `undefined` enquanto carrega, `null` quando deslogado, `User` quando logado.
 */
export function useAuthUser() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setUser(s?.user ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);
  return user;
}

/** Redireciona para /auth?redirect=<path> quando o usuário não está logado. */
export function loginRedirectHref(path?: string) {
  const p = path ?? (typeof window !== "undefined" ? window.location.pathname + window.location.search : "/");
  return `/auth?redirect=${encodeURIComponent(p)}`;
}
