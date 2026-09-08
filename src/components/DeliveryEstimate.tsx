import { useEffect, useState } from "react";
import { Truck, Store, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { quoteDelivery } from "@/lib/maisentregas.functions";
import { supabase } from "@/integrations/supabase/client";
import { useAuthUser, loginRedirectHref } from "@/lib/useAuthUser";
import { useStoreAddress } from "@/lib/store-address";
import { brl } from "@/lib/format";
import {
  RMC_CITIES,
  isRmcCity,
  lookupCep,
  maskCep,
  outOfCoverageMessage,
} from "@/lib/delivery-area";

type Quote = { fee: number; distanceKm?: number; etaMinutes?: number };

/**
 * "Calcular entrega" na página de produto.
 *
 * Reutiliza a MESMA server fn `quoteDelivery` (Mais Entregas/TBT) usada pelo
 * checkout: nenhum preço é calculado no cliente. Também reutiliza a mesma
 * lista de cobertura (Curitiba/RMC) e a mesma busca de CEP (ViaCEP) do
 * checkout, via `@/lib/delivery-area`. O valor exibido é informativo — o
 * checkout continua recotando e validando no servidor.
 */
export function DeliveryEstimate({ productPath }: { productPath?: string }) {
  const user = useAuthUser();
  const storeAddress = useStoreAddress();

  const [hasSaved, setHasSaved] = useState(false);
  const [editing, setEditing] = useState(true);
  const [zip, setZip] = useState("");
  const [street, setStreet] = useState("");
  const [number, setNumber] = useState("");
  const [district, setDistrict] = useState("");
  const [complement, setComplement] = useState("");
  const [city, setCity] = useState("");
  const [cepBusy, setCepBusy] = useState(false);
  const [cepError, setCepError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Endereço salvo do perfil
  useEffect(() => {
    if (!user) {
      setHasSaved(false);
      setEditing(true);
      return;
    }
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select(
          "address_zip, address_street, address_number, address_district, address_complement, address_city",
        )
        .eq("id", user.id)
        .maybeSingle();
      if (!alive || !data) return;
      const p = data as Record<string, string | null>;
      if (p.address_zip) setZip(maskCep(p.address_zip));
      if (p.address_street) setStreet(p.address_street);
      if (p.address_number) setNumber(p.address_number);
      if (p.address_district) setDistrict(p.address_district);
      if (p.address_complement) setComplement(p.address_complement);
      if (p.address_city) setCity(p.address_city);
      const complete = !!(p.address_zip && p.address_street && p.address_number);
      const cityOk = isRmcCity(p.address_city);
      if (complete && cityOk) {
        setHasSaved(true);
        setEditing(false);
      } else {
        // Cidade salva ausente ou fora da cobertura: pedimos confirmação.
        setEditing(true);
        if (complete && !cityOk) {
          setCepError("Confirme a cidade do seu endereço antes de calcular.");
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [user]);

  // ViaCEP ao completar o CEP (mesma lógica do checkout)
  useEffect(() => {
    const d = zip.replace(/\D/g, "");
    if (d.length !== 8) {
      setCepError(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setCepBusy(true);
      setCepError(null);
      try {
        const found = await lookupCep(d);
        if (cancelled) return;
        if (found.city && !isRmcCity(found.city)) {
          setCity(found.city);
          setCepError(outOfCoverageMessage(found.city, found.uf));
          setQuote(null);
          return;
        }
        if (found.street) setStreet(found.street);
        if (found.district) setDistrict(found.district);
        if (found.city) setCity(found.city);
      } catch (e) {
        if (!cancelled) setCepError(e instanceof Error ? e.message : "Não conseguimos buscar este CEP");
      } finally {
        if (!cancelled) setCepBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [zip]);

  const runQuote = async () => {
    const z = zip.replace(/\D/g, "");
    if (z.length !== 8) return toast.error("Informe um CEP válido");
    if (cepError) return toast.error(cepError);
    if (street.trim().length < 2) return toast.error("Informe a rua");
    if (!number.trim()) return toast.error("Informe o número");
    if (!isRmcCity(city)) {
      setCepError("Selecione uma cidade atendida (Curitiba e região metropolitana).");
      return;
    }
    setLoading(true);
    setError(null);
    setQuote(null);
    try {
      const res = await quoteDelivery({
        data: {
          zip: z,
          street: street.trim(),
          number: number.trim(),
          district: district.trim(),
          complement: complement.trim(),
          city: city.trim(),
        },
      });
      setQuote({ fee: res.fee, distanceKm: res.distanceKm, etaMinutes: res.etaMinutes });
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Não conseguimos calcular a entrega para este endereço.",
      );
    } finally {
      setLoading(false);
    }
  };

  const inputCls =
    "rounded-md border border-border bg-input px-3 py-2 text-sm focus:border-primary focus:outline-none";

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
            href={loginRedirectHref(productPath)}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-xs font-black uppercase tracking-wider text-primary-foreground hover:opacity-90"
          >
            Entrar e calcular a entrega
          </a>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          {hasSaved && !editing ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-secondary/60 px-3 py-2 text-sm">
              <span className="text-foreground/90">
                {street}, {number} · {district ? `${district} · ` : ""}
                {city} · CEP {maskCep(zip)}
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
                autoComplete="postal-code"
                className={`col-span-2 sm:col-span-1 ${inputCls}`}
              />
              <select
                value={isRmcCity(city) ? city : ""}
                onChange={(e) => {
                  setCity(e.target.value);
                  setCepError(null);
                }}
                aria-label="Cidade"
                className={`col-span-2 sm:col-span-1 ${inputCls}`}
              >
                <option value="">Cidade</option>
                {RMC_CITIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <input
                value={street}
                onChange={(e) => setStreet(e.target.value)}
                placeholder="Rua"
                aria-label="Rua"
                className={`col-span-2 ${inputCls}`}
              />
              <input
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                placeholder="Número"
                aria-label="Número"
                inputMode="numeric"
                className={inputCls}
              />
              <input
                value={district}
                onChange={(e) => setDistrict(e.target.value)}
                placeholder="Bairro"
                aria-label="Bairro"
                className={inputCls}
              />
              <input
                value={complement}
                onChange={(e) => setComplement(e.target.value)}
                placeholder="Complemento (opcional)"
                aria-label="Complemento"
                className={`col-span-2 ${inputCls}`}
              />
              <p className="col-span-2 text-xs text-muted-foreground">
                {cepBusy ? (
                  "Buscando endereço..."
                ) : cepError ? (
                  <span className="text-destructive">{cepError}</span>
                ) : (
                  "Atendemos Curitiba e região metropolitana"
                )}
              </p>
            </div>
          )}

          <button
            type="button"
            onClick={() => void runQuote()}
            disabled={loading || cepBusy || !!cepError}
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
                  {quote.etaMinutes ? `~${Math.round(quote.etaMinutes)} min de rota` : null}
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
        <span>Ou retire sem custo de entrega em {storeAddress}.</span>
      </div>
    </section>
  );
}
