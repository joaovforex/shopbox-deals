import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, ExternalLink, Loader2, TestTube } from "lucide-react";
import { Header, Footer } from "@/components/Header";
import { isSuperAdmin } from "@/lib/products";
import { createMpTestPreference } from "@/lib/mp-test.functions";

export const Route = createFileRoute("/_authenticated/admin/mp-teste")({
  head: () => ({ meta: [{ title: "Teste Mercado Pago · shopbox" }] }),
  component: MpTestePage,
});

function MpTestePage() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ initPoint: string; ref: string } | null>(null);
  const create = useServerFn(createMpTestPreference);

  useEffect(() => { isSuperAdmin().then(setAllowed); }, []);

  const handleCreate = async () => {
    setLoading(true);
    setResult(null);
    try {
      const r = await create();
      setResult({ initPoint: r.initPoint, ref: r.externalReference });
      toast.success("Preferência criada — abra o link e pague R$ 0,50");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao criar preferência");
    } finally {
      setLoading(false);
    }
  };

  if (allowed === null) {
    return <Shell><div className="flex-1 flex items-center justify-center p-6 text-muted-foreground">Carregando…</div></Shell>;
  }
  if (!allowed) {
    return <Shell><div className="flex-1 flex items-center justify-center p-6 text-center text-muted-foreground">Acesso restrito ao Super Admin.</div></Shell>;
  }

  return (
    <Shell>
      <main className="flex-1 max-w-2xl w-full mx-auto p-4 sm:p-6">
        <Link to="/admin" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary mb-4">
          <ArrowLeft className="h-4 w-4" /> Voltar ao admin
        </Link>

        <h1 className="text-2xl font-black uppercase tracking-tight mb-2 flex items-center gap-2">
          <TestTube className="h-6 w-6 text-primary" /> Teste Mercado Pago
        </h1>
        <p className="text-sm text-muted-foreground mb-6">
          Gera uma cobrança de <strong>R$ 0,50</strong> via Mercado Pago. Serve para validar
          as credenciais e o webhook após troca de conta. Não cria pedido no sistema.
        </p>

        <div className="bg-card border-2 border-border rounded-lg p-6 space-y-4">
          <button
            onClick={handleCreate}
            disabled={loading}
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground font-black uppercase tracking-wider px-5 py-3 rounded-md hover:scale-[1.02] disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <TestTube className="h-4 w-4" />}
            Gerar link de pagamento (R$ 0,50)
          </button>

          {result && (
            <div className="border-t border-border pt-4 space-y-3">
              <div className="text-xs text-muted-foreground">
                Referência: <code className="font-mono">{result.ref}</code>
              </div>
              <a
                href={result.initPoint}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-accent text-accent-foreground font-bold px-4 py-2 rounded-md hover:opacity-90 text-sm"
              >
                Abrir checkout <ExternalLink className="h-4 w-4" />
              </a>
              <p className="text-xs text-muted-foreground">
                Após pagar, verifique nos logs do servidor a mensagem
                <code className="font-mono ml-1">[mp:webhook] TEST payment received</code>.
                Isso confirma que a assinatura secreta e o access token estão corretos.
              </p>
            </div>
          )}
        </div>
      </main>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      {children}
      <Footer />
    </div>
  );
}
