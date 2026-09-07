import { useEffect, useState } from "react";
import { Truck, Store, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { quoteDelivery } from "@/lib/maisentregas.functions";
import { supabase } from "@/integrations/supabase/client";
import { useAuthUser, loginRedirectHref } from "@/lib/useAuthUser";
import { useStoreAddress } from "@/lib/store-address";
import { brl } from "@/lib/format";
import { maskCep } from "@/lib/mask";

type Quote = { fee: number; distanceKm?: number; etaMinutes?: number };

type SavedAddress = {
  zip: string;
  street: string;
  number: string;
  district?: string | null;
  city?: string | null;
};

/**
 * "Calcular entrega" na página de produto.
 *
 * Reutiliza a MESMA server fn `quoteDelivery` (Mais Entregas/TBT) usada pelo
 * checkout: nenhum preço é calculado no cliente. O valor exibido aqui é
 * informativo — o checkout continua recotando e validando no servidor.
 */
export function DeliveryEstimate() {
  const user = useAuthUser();
  const storeAddress = useStoreAddress();
  const [saved, setSaved] = useState<SavedAddress | null>(null);
  const [editing, setEditing] = useState(false);
  const [zip, setZip] = useState("");
  const [street, setStreet] = useState("");
  const [number, setNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setSaved(null);
      return;
    }
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("address_zip, address_street, address_number, address_district, address_city")
        .eq("id", user.id)
        .maybeSingle();
      if (!alive || !data) return;
      if (data.address_zip && data.address_street && data.address_number) {
        setSaved({
          zip: data.address_zip,
          street: data.address_street,
          number: data.address_number,
          district: data.address_district,
          city: data.address_city,
        });
        setZip(maskCep(data.address_zip));
        setStreet(data.address_street);
        setNumber(data.address_number);
      } else {
        setEditing(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [user]);

  const runQuote = async (addr: SavedAddress) => {
    setLoading(true);
    setError(null);
    setQuote(null);
    try {
      const res = await quoteDelivery({
        data: {
          zip: addr.zip.replace(/\D/g, ""),
          street: addr.street,
          number: addr.number,
          district: addr.district ?? "",
          city: addr.city ?? "Curitiba",
        },
      });
      setQuote({ fee: res.fee, distanceKm: res.distanceKm, etaMinutes: res.etaMinutes });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Não conseguimos calcular a entrega para este endereço.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const onCalculate = () => {
    const z = zip.replace(/\D/g, "");
    if (z.length !== 8) return toast.error("Informe um CEP válido");
    if (street.trim().length < 2) return toast.error("Informe a rua");
    if (!number.trim()) return toast.error("Informe o número");
    void runQuote({ zip: z, street: street.trim(), number: number.trim(), district: saved?.district, city: saved?.city });
  };

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-wider">
        <Truck className="h-4 w-4 text-primary" /> Calcular entrega
      </h2>

      {!user ? (
        <div className="mt-3 space-y-2">
          <p className="text-sm text-muted-foreground">
            Entre na sua conta para calcular o valor real da entrega para o seu endereço.
          </p>
          <a
            href={loginRedirectHref("/carrinho")}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-xs font-black uppercase tracking-wider text-primary-foreground hover:opacity-90"
          >
            Entre para calcular a entrega
          </a>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          {saved && !editing ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-secondary/60 px-3 py-2 text-sm">
              <span className="text-foreground/90">
                {saved.street}, {saved.number} · CEP {maskCep(saved.zip)}
              </span>
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="text-xs font-bold uppercase tracking-wider text-primary hover:underline"
              >
                Editar endereço
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <input
                value={zip}
                onChange={(e) => setZip(maskCep(e.target.value))}
                inputMode="numeric"
                placeholder="CEP"
                aria-label="CEP"
                className="col-span-2 rounded-md border border-border bg-input px-3 py-2 text-sm focus:border-primary focus:outline-none sm:col-span-1"
              />
              <input
                value={street}
                onChange={(e) => setStreet(e.target.value)}
                placeholder="Rua"
                aria-label="Rua"
                className="col-span-2 rounded-md border border-border bg-input px-3 py-2 text-sm focus:border-primary focus:outline-none sm:col-span-1"
              />
              <input
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                placeholder="Número"
                aria-label="Número"
                className="col-span-2 rounded-md border border-border bg-input px-3 py-2 text-sm focus:border-primary focus:outline-none sm:col-span-1"
              />
            </div>
          )}

          <button
            type="button"
            onClick={onCalculate}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-secondary px-4 py-2 text-xs font-black uppercase tracking-wider hover:bg-muted disabled:opacity-60"
          >
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {loading ? "Calculando..." : "Calcular entrega"}
          </button>

          {quote && (
            <div className="rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm">
              <div className="font-bold">Entrega: {brl(quote.fee)}</div>
              {(quote.distanceKm || quote.etaMinutes) && (
                <div className="text-xs text-muted-foreground">
                  {quote.distanceKm ? `${quote.distanceKm.toFixed(1).replace(".", ",")} km` : null}
                  {quote.distanceKm && quote.etaMinutes ? " · " : null}
                  {quote.etaMinutes ? `~${Math.round(quote.etaMinutes)} min` : null}
                </div>
              )}
              <div className="mt-1 text-xs text-muted-foreground">
                Valor informativo. O frete final é confirmado no checkout.
              </div>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      )}

      <div className="mt-3 flex items-start gap-2 border-t border-border pt-3 text-sm text-muted-foreground">
        <Store className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <span>
          Ou retire sem custo de entrega em {storeAddress}.
        </span>
      </div>
    </section>
  );
}
