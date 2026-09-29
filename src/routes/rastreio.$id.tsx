import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Truck, Package, CheckCircle2, MapPin, Clock, Store, ArrowLeft, XCircle, RefreshCw } from "lucide-react";
import { Header, Footer } from "@/components/Header";
import { getDeliveryTracking, type TrackingInfo } from "@/lib/maisentregas.functions";
import { useStoreAddress } from "@/lib/store-address";

/**
 * Acompanhamento da entrega (TBT Express / Mais Entregas).
 * Pública pelo UUID do pedido, como /pedido/:id — mostra só o que o cliente
 * precisa: etapa atual, primeiro nome/foto do entregador, posição no mapa e
 * previsão de chegada. Atualiza sozinha a cada 20s enquanto a corrida está ativa.
 */
export const Route = createFileRoute("/rastreio/$id")({
  head: () => ({ meta: [{ title: "Acompanhar entrega · shopbox" }] }),
  component: TrackingPage,
});

const STEPS: Array<{ key: string; label: string; match: string[] }> = [
  { key: "preparo", label: "Pedido em preparo", match: ["", "criado", "pendente", "aguardando_preparo"] },
  { key: "buscando", label: "Procurando entregador", match: ["contatando_parceiro"] },
  { key: "confirmado", label: "Entregador confirmado", match: ["parceiro_confirmado"] },
  { key: "rota", label: "A caminho de você", match: ["parceiro_a_caminho", "em_rota"] },
  { key: "entregue", label: "Entregue", match: ["entregue"] },
];

function stepIndex(t: TrackingInfo): number {
  if (t.isDelivered) return STEPS.length - 1;
  const s = t.status ?? "";
  const i = STEPS.findIndex((st) => st.match.includes(s));
  return i < 0 ? 0 : i;
}

function fmtTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function etaLabel(t: TrackingInfo): string | null {
  if (t.etaTime) {
    // A API pode devolver "HH:MM" ou uma data completa.
    if (/^\d{1,2}:\d{2}/.test(t.etaTime)) return `Previsão de chegada: ${t.etaTime.slice(0, 5)}`;
    const f = fmtTime(t.etaTime);
    if (f) return `Previsão de chegada: ${f}`;
  }
  if (t.etaMinutes && t.etaMinutes > 0) return `Tempo estimado de rota: ~${Math.round(t.etaMinutes)} min`;
  return null;
}

function mapEmbedUrl(lat: number, lng: number): string {
  const d = 0.01;
  const bbox = `${lng - d},${lat - d},${lng + d},${lat + d}`;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${lat},${lng}`;
}

function TrackingPage() {
  const { id } = Route.useParams();
  const fetchTracking = useServerFn(getDeliveryTracking);
  const storeAddress = useStoreAddress();

  const { data, isLoading, isError, refetch, isFetching, dataUpdatedAt } = useQuery({
    queryKey: ["tracking", id],
    queryFn: () => fetchTracking({ data: { id } }),
    refetchInterval: (q) => {
      const t = q.state.data as TrackingInfo | undefined;
      if (!t || !t.found) return false;
      if (t.isFinal || t.isDelivered) return false;
      return 20_000;
    },
    refetchOnWindowFocus: true,
  });

  const t = data;
  const idx = t ? stepIndex(t) : 0;
  const eta = t ? etaLabel(t) : null;
  const courierPos = t?.courier && t.courier.lat != null && t.courier.lng != null ? { lat: t.courier.lat, lng: t.courier.lng } : null;
  const destPos = t?.destination && t.destination.lat != null && t.destination.lng != null ? { lat: t.destination.lat, lng: t.destination.lng } : null;
  const mapPos = courierPos ?? destPos;
  const cancelled = t?.status === "cancelado";

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-8 max-w-2xl">
        <Link to="/pedido/$id" params={{ id }} className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Voltar ao pedido
        </Link>

        <div className="mt-4 mb-6">
          <div className="text-xs uppercase tracking-widest text-accent font-bold">Pedido #{id.slice(0, 8).toUpperCase()}</div>
          <h1 className="display text-3xl md:text-4xl mt-1">
            {isLoading ? "Carregando..."
              : isError ? "Não conseguimos carregar"
              : !t?.found ? "Pedido não encontrado"
              : !t.isDelivery ? "Este pedido é retirada na loja"
              : t.isDelivered ? "Pedido entregue!"
              : cancelled ? "Entrega cancelada"
              : t.label}
          </h1>
          {t?.found && t.isDelivery && !t.isDelivered && !cancelled && (
            <p className="text-muted-foreground mt-1 text-sm">
              {t.hasRun
                ? "Esta página atualiza sozinha. Você também pode puxar para atualizar."
                : "Assim que o pedido estiver separado, chamamos o entregador e mostramos aqui a posição dele."}
            </p>
          )}
          {t?.isDelivered && (
            <p className="text-muted-foreground mt-1 text-sm">
              {t.deliveredAt ? `Entregue em ${fmtDateTime(t.deliveredAt)}.` : "Obrigado pela compra!"} 💚
            </p>
          )}
          {cancelled && (
            <p className="text-muted-foreground mt-1 text-sm">
              A transportadora cancelou esta corrida. Nossa equipe vai reagendar — fale com a gente pelo WhatsApp se precisar.
            </p>
          )}
        </div>

        {isError && (
          <button type="button" onClick={() => void refetch()} className="mb-6 inline-flex min-h-11 items-center gap-2 rounded-md bg-secondary px-4 py-2 text-xs font-black uppercase tracking-wider hover:bg-muted">
            Tentar de novo
          </button>
        )}

        {t?.found && t.isDelivery && !cancelled && (
          <>
            {/* Linha do tempo */}
            <ol className="rounded-xl border-2 border-border bg-card p-5 mb-6 space-y-3">
              {STEPS.map((st, i) => {
                const done = i < idx || (i === idx && t.isDelivered);
                const current = i === idx && !t.isDelivered;
                return (
                  <li key={st.key} className="flex items-center gap-3">
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 ${
                      done ? "bg-[#25D366] border-[#25D366] text-white"
                        : current ? "border-primary text-primary bg-primary/10 animate-pulse"
                        : "border-border text-muted-foreground"
                    }`}>
                      {done ? <CheckCircle2 className="h-4 w-4" /> : i === 0 ? <Package className="h-4 w-4" /> : i === STEPS.length - 1 ? <MapPin className="h-4 w-4" /> : <Truck className="h-4 w-4" />}
                    </span>
                    <span className={`text-sm ${done || current ? "font-bold text-foreground" : "text-muted-foreground"}`}>{st.label}</span>
                    {current && eta && <span className="ml-auto text-xs text-muted-foreground inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{eta}</span>}
                  </li>
                );
              })}
            </ol>

            {/* Entregador */}
            {t.courier && !t.isDelivered && (
              <div className="rounded-xl border-2 border-primary bg-primary/5 p-5 mb-6 flex items-center gap-4">
                {t.courier.photo ? (
                  <img src={t.courier.photo} alt="" className="h-14 w-14 rounded-full object-cover border-2 border-primary" referrerPolicy="no-referrer" />
                ) : (
                  <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground"><Truck className="h-6 w-6" /></span>
                )}
                <div className="text-sm">
                  <p className="font-bold text-foreground">{t.courier.name} está cuidando da sua entrega</p>
                  {t.courier.updatedAt && <p className="text-xs text-muted-foreground">Posição atualizada às {fmtTime(t.courier.updatedAt)}</p>}
                  {t.arrivedAt && <p className="text-xs text-muted-foreground">Chegou ao endereço às {fmtTime(t.arrivedAt)}</p>}
                </div>
              </div>
            )}

            {/* Mapa */}
            {mapPos && !t.isDelivered && (
              <div className="rounded-xl border-2 border-border overflow-hidden mb-6 bg-card">
                <iframe
                  title="Mapa da entrega"
                  src={mapEmbedUrl(mapPos.lat, mapPos.lng)}
                  className="w-full h-64 md:h-80 border-0"
                  loading="lazy"
                />
                <div className="flex items-center justify-between gap-2 px-3 py-2 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5 text-primary" />{courierPos ? "Posição do entregador" : "Endereço de entrega"}</span>
                  <a href={`https://www.google.com/maps/search/?api=1&query=${mapPos.lat},${mapPos.lng}`} target="_blank" rel="noreferrer" className="font-bold text-primary hover:underline">
                    Abrir no Google Maps
                  </a>
                </div>
              </div>
            )}

            {/* Resumo */}
            <div className="rounded-xl border-2 border-border bg-card p-5 text-sm space-y-1 text-muted-foreground">
              {t.vehicle === "carro" && <div><strong className="text-foreground">Veículo:</strong> carro (Fiorino) — produto grande</div>}
              {t.city && <div><strong className="text-foreground">Entrega em:</strong> {t.city}</div>}
              {t.distanceKm != null && t.distanceKm > 0 && <div><strong className="text-foreground">Distância da loja:</strong> {t.distanceKm.toFixed(1).replace(".", ",")} km</div>}
              {t.runCreatedAt && <div><strong className="text-foreground">Entregador chamado:</strong> {fmtDateTime(t.runCreatedAt)}</div>}
              {t.deliveredAt && <div><strong className="text-foreground">Entregue:</strong> {fmtDateTime(t.deliveredAt)}</div>}
              <div className="pt-2 flex items-center justify-between gap-2 text-xs">
                <span className="inline-flex items-center gap-1"><Store className="h-3.5 w-3.5 text-primary" />Saindo de {storeAddress}</span>
                <button type="button" onClick={() => void refetch()} disabled={isFetching} className="inline-flex items-center gap-1 font-bold text-primary hover:underline disabled:opacity-60">
                  <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} /> Atualizar
                </button>
              </div>
              {dataUpdatedAt > 0 && (
                <div className="text-[11px]">Última atualização: {fmtTime(new Date(dataUpdatedAt).toISOString())}{t.live ? " · ao vivo" : ""}</div>
              )}
            </div>
          </>
        )}

        {t?.found && !t.isDelivery && (
          <div className="rounded-xl border-2 border-border bg-card p-5 flex gap-3 text-sm">
            <Store className="h-5 w-5 text-primary shrink-0" />
            <div>
              <p className="font-bold text-foreground">Retirada na loja</p>
              <p className="text-muted-foreground">{storeAddress}</p>
            </div>
          </div>
        )}

        {cancelled && (
          <div className="rounded-xl border-2 border-destructive/40 bg-destructive/5 p-5 flex gap-3 text-sm">
            <XCircle className="h-5 w-5 text-destructive shrink-0" />
            <p className="text-muted-foreground">Nenhuma cobrança extra é feita. Se preferir, o pedido pode ser retirado na loja: {storeAddress}.</p>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
