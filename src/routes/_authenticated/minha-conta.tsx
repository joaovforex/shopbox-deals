import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Package, Wallet, User, ArrowRight, AlertTriangle, RefreshCw, ShoppingBag, HelpCircle, LayoutDashboard,
} from "lucide-react";
import { Header, Footer } from "@/components/Header";
import { supabase } from "@/integrations/supabase/client";
import { getMyCashback } from "@/lib/cashback.functions";
import { RepurchaseButton } from "@/components/RepurchaseButton";
import { currentUserId } from "@/lib/account-queries";
import { getRoleSummary } from "@/lib/products";

import { brl } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/minha-conta")({
  head: () => ({
    meta: [
      { title: "Minha conta · shopbox" },
      { name: "description", content: "Seus pedidos, cashback e dados de entrega em um só lugar." },
      { property: "og:title", content: "Minha conta · shopbox" },
      { property: "og:description", content: "Seus pedidos, cashback e dados de entrega em um só lugar." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AccountHome,
});

type LastOrder = {
  id: string;
  created_at: string;
  status: string;
  fulfillment_status: string;
  delivery_method: string | null;
  total: number;
  maisentregas_status: string | null;
};

function orderStateLabel(o: LastOrder): string {
  if (o.status === "cancelled") return "Cancelado";
  if (o.status === "pending") return "Aguardando pagamento";
  if (o.delivery_method === "delivery") {
    const s = (o.maisentregas_status ?? "").toLowerCase().trim();
    if (s === "servico_finalizado" || o.fulfillment_status === "completed") return "Entregue";
    if (s === "parceiro_a_caminho") return "Em rota de entrega";
    return "Preparando envio";
  }
  if (o.fulfillment_status === "completed") return "Entregue";
  if (o.fulfillment_status === "ready" || o.fulfillment_status === "shipped") return "Pronto para retirada";
  if (o.fulfillment_status === "preparing") return "Em separação";
  return "Pagamento confirmado";
}

function AccountHome() {
  const fetchCashback = useServerFn(getMyCashback);

  // Sessão primeiro: todas as chaves de cache carregam o id do usuário, para
  // que trocar de conta (ou sair) nunca reaproveite dados de outra pessoa.
  const userQ = useQuery({ queryKey: ["session-user-id"], queryFn: currentUserId, staleTime: 0 });
  const uid = userQ.data ?? null;

  const profileQ = useQuery({
    queryKey: ["account-profile", uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const user = auth.user;
      if (!user) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("full_name, address_city, address_street")
        .eq("id", user.id)
        .maybeSingle();
      if (error) throw error;
      return { email: user.email ?? "", ...(data ?? {}) } as {
        email: string;
        full_name?: string | null;
        address_city?: string | null;
        address_street?: string | null;
      };
    },
  });

  const cashbackQ = useQuery({
    queryKey: ["cashback-balance", uid],
    queryFn: () => fetchCashback(),
    enabled: !!uid,
  });

  const ordersQ = useQuery({
    queryKey: ["account-last-orders", uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, created_at, status, fulfillment_status, delivery_method, total, maisentregas_status")
        .eq("user_id", uid!)
        .order("created_at", { ascending: false })
        .limit(2);
      if (error) throw error;
      return (data ?? []) as LastOrder[];
    },
  });

  const rolesQ = useQuery({
    queryKey: ["account-team-role", uid],
    enabled: !!uid,
    queryFn: getRoleSummary,
  });
  const hasTeamRole = !!rolesQ.data?.hasAnyTeamRole;

  const firstName = (profileQ.data?.full_name ?? "").trim().split(" ")[0];
  const balanceFailed = cashbackQ.isError;
  const balance = Number(cashbackQ.data?.balance ?? 0);
  const nextExpiry = cashbackQ.data?.nextExpiry ?? null;
  const orders = ordersQ.data ?? [];
  const loadingOrders = ordersQ.isLoading || userQ.isLoading;


  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <section className="bg-card border-b-4 border-primary">
        <div className="container mx-auto px-4 py-6">
          <div className="text-xs uppercase tracking-widest text-accent font-bold">Sua conta</div>
          <h1 className="display text-3xl md:text-4xl">
            {firstName ? `Olá, ${firstName}!` : "Olá!"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {profileQ.data?.email || "Acompanhe pedidos, cashback e seus dados de entrega."}
          </p>
        </div>
      </section>

      <section className="container mx-auto px-4 py-6 flex-1 max-w-3xl space-y-5 pb-28 md:pb-8">
        {/* CASHBACK */}
        <Link
          to="/cashback"
          className="block rounded-xl border-2 border-[#25D366]/40 bg-gradient-to-br from-[#25D366]/15 to-[#25D366]/5 p-5 hover:border-[#25D366]/70 transition-colors"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-12 w-12 shrink-0 rounded-full bg-[#25D366]/20 flex items-center justify-center">
                <Wallet className="h-6 w-6 text-[#25D366]" />
              </div>
              <div className="min-w-0">
                <div className="text-xs uppercase tracking-widest font-bold text-[#25D366]">Meu cashback</div>
                {cashbackQ.isLoading || userQ.isLoading ? (
                  <div className="mt-1 h-7 w-28 rounded bg-muted animate-pulse" />
                ) : balanceFailed ? (
                  <div className="text-sm font-bold text-destructive">Saldo indisponível agora</div>
                ) : (
                  <div className="display text-2xl text-[#25D366]">{brl(balance)}</div>
                )}

                {nextExpiry && nextExpiry.amount > 0 && (
                  <div className="text-xs text-muted-foreground">
                    {brl(nextExpiry.amount)} vence em{" "}
                    {Math.max(0, Math.ceil((new Date(nextExpiry.expiresAt).getTime() - Date.now()) / 86400000))} dia(s)
                  </div>
                )}
              </div>
            </div>
            <ArrowRight className="h-5 w-5 text-[#25D366] shrink-0" />
          </div>
        </Link>

        {/* ÚLTIMOS PEDIDOS */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="display text-xl">Últimos pedidos</h2>
            <Link to="/meus-pedidos" className="text-xs font-bold uppercase tracking-wider text-primary hover:underline">
              Ver todos
            </Link>
          </div>

          {loadingOrders ? (
            <div className="space-y-2">
              <div className="h-28 rounded-xl border border-border bg-card animate-pulse" />
              <div className="h-28 rounded-xl border border-border bg-card animate-pulse" />
            </div>
          ) : ordersQ.isError ? (
            <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-5 text-sm">
              <div className="flex items-center gap-2 font-bold text-destructive">
                <AlertTriangle className="h-4 w-4" /> Não conseguimos carregar seus pedidos
              </div>
              <button
                type="button"
                onClick={() => void ordersQ.refetch()}
                className="mt-3 inline-flex items-center gap-2 rounded-md bg-secondary px-4 py-2 text-xs font-black uppercase tracking-wider hover:bg-muted"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Tentar de novo
              </button>
            </div>
          ) : orders.length === 0 ? (
            <div className="rounded-xl border border-border bg-card p-8 text-center">
              <ShoppingBag className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              <p className="font-bold mb-1">Você ainda não fez pedidos</p>
              <p className="text-sm text-muted-foreground mb-4">Comece pelas ofertas do dia.</p>
              <Link
                to="/loja"
                className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-3 text-xs font-black uppercase tracking-wider text-primary-foreground"
              >
                Ver ofertas <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          ) : (
            <ul className="space-y-2">
              {orders.map((o) => (
                <li key={o.id} className="rounded-xl border border-border bg-card p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="font-mono text-xs text-muted-foreground">#{o.id.slice(0, 8).toUpperCase()}</div>
                      <div className="font-bold text-sm">{orderStateLabel(o)}</div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(o.created_at).toLocaleDateString("pt-BR")} · {brl(Number(o.total))}
                      </div>
                    </div>
                    <Link
                      to="/pedido/$id"
                      params={{ id: o.id }}
                      className="text-xs font-black uppercase tracking-wider text-primary hover:underline"
                    >
                      Acompanhar
                    </Link>
                  </div>
                  {o.status === "paid" && (
                    <div className="mt-3">
                      <RepurchaseButton orderId={o.id} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* EQUIPE: acesso ao painel administrativo (visível só para quem tem cargo) */}
        {hasTeamRole && (
          <Link
            to="/admin"
            className="flex items-center gap-3 rounded-xl border-2 border-accent bg-accent/10 p-4 hover:border-accent transition-colors"
          >
            <span className="h-10 w-10 shrink-0 rounded-md bg-accent text-accent-foreground flex items-center justify-center">
              <LayoutDashboard className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="block font-bold text-sm">Área administrativa</span>
              <span className="block text-xs text-muted-foreground">Produtos, pedidos, expedição e configurações</span>
            </span>
            <ArrowRight className="h-4 w-4 ml-auto text-muted-foreground shrink-0" />
          </Link>
        )}

        {/* ATALHOS */}
        <div className="grid gap-3 sm:grid-cols-2">
          <Shortcut to="/meus-pedidos" icon={<Package className="h-5 w-5" />} title="Meus pedidos" desc="Status, retirada e entrega" />
          <Shortcut to="/perfil" icon={<User className="h-5 w-5" />} title="Meus dados" desc="Contato e endereço salvo" />
          <Shortcut to="/trocas-e-garantia" icon={<RefreshCw className="h-5 w-5" />} title="Trocas e garantia" desc="Como trocar um produto" />
          <Shortcut to="/faq" icon={<HelpCircle className="h-5 w-5" />} title="Ajuda" desc="Dúvidas frequentes" />
        </div>
      </section>

      <Footer />
    </div>
  );
}

function Shortcut({
  to, icon, title, desc,
}: { to: string; icon: React.ReactNode; title: string; desc: string }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 hover:border-primary transition-colors"
    >
      <span className="h-10 w-10 rounded-md bg-secondary flex items-center justify-center text-primary">{icon}</span>
      <span className="min-w-0">
        <span className="block font-bold text-sm">{title}</span>
        <span className="block text-xs text-muted-foreground">{desc}</span>
      </span>
      <ArrowRight className="h-4 w-4 ml-auto text-muted-foreground shrink-0" />
    </Link>
  );
}
