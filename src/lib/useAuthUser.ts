import { useEffect, useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";

/**
 * Auth store compartilhado (módulo-singleton) para evitar N chamadas de rede
 * quando muitos componentes usam useAuthUser simultaneamente (ex.: listagem
 * com dezenas de ProductCards). Uma única assinatura de onAuthStateChange e
 * uma única leitura inicial de sessão (localStorage-cached) atendem todos.
 */
type AuthState = User | null | undefined; // undefined = ainda carregando
let current: AuthState = undefined;
const listeners = new Set<() => void>();
let initialized = false;

function emit() {
  for (const l of listeners) l();
}

function ensureInitialized() {
  if (initialized) return;
  initialized = true;
  // getSession lê do localStorage/cookies; não faz round-trip de rede.
  supabase.auth.getSession().then(({ data }) => {
    current = data.session?.user ?? null;
    emit();
  });
  supabase.auth.onAuthStateChange((_e, session) => {
    current = session?.user ?? null;
    emit();
  });
}

function subscribe(cb: () => void) {
  ensureInitialized();
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function getSnapshot(): AuthState {
  return current;
}

function getServerSnapshot(): AuthState {
  return undefined;
}

/**
 * Retorna `undefined` enquanto carrega, `null` quando deslogado, `User` quando logado.
 */
export function useAuthUser() {
  // Garante init mesmo em SSR/hydrate cedo.
  useEffect(() => {
    ensureInitialized();
  }, []);
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Redireciona para /auth?redirect=<path> quando o usuário não está logado. */
export function loginRedirectHref(path?: string) {
  const p =
    path ?? (typeof window !== "undefined" ? window.location.pathname + window.location.search : "/");
  return `/auth?redirect=${encodeURIComponent(p)}`;
}
