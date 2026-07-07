import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Upload, Plus, Trash2, ScanBarcode } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { isVideoUrl, uploadProductImage, type ColorVariant, type Product } from "@/lib/products";
import { PRODUCT_CATEGORIES } from "@/lib/categories";
import { suggestFromNcm } from "@/lib/ncm-suggestions";

const DRAFT_KEY = "shopbox:product-form-draft";

type Draft = {
  productId: string | null;
  name: string;
  description: string;
  price: string;
  originalPrice: string;
  category: string;
  stock: string;
  images: string[];
  active: boolean;
  colorVariants: ColorVariant[];
  ncm?: string;
  cest?: string;
  unidadeComercial?: string;
  origem?: string;
};

function loadDraft(productId: string | null): Draft | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as Draft;
    if ((d.productId ?? null) !== productId) return null;
    return d;
  } catch {
    return null;
  }
}

export function ProductForm({
  product,
  onClose,
  onSaved,
}: {
  product: Product | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const draft = loadDraft(product?.id ?? null);
  const [name, setName] = useState(draft?.name ?? product?.name ?? "");
  const [description, setDescription] = useState(draft?.description ?? product?.description ?? "");
  const [price, setPrice] = useState(draft?.price ?? (product ? String(product.price) : ""));
  const [originalPrice, setOriginalPrice] = useState(
    draft?.originalPrice ?? (product?.original_price ? String(product.original_price) : ""),
  );
  const [category, setCategory] = useState(draft?.category ?? product?.category ?? "");
  const [stock, setStock] = useState(draft?.stock ?? (product ? String(product.stock) : "0"));
  const [images, setImages] = useState<string[]>(
    draft?.images ??
      (product ? (product.images?.length ? product.images : product.image_url ? [product.image_url] : []) : []),
  );
  const [active, setActive] = useState(draft?.active ?? product?.active ?? true);
  const [colorVariants, setColorVariants] = useState<ColorVariant[]>(
    draft?.colorVariants ?? (product?.color_variants ?? []),
  );
  const p = product as (Product & { ncm?: string | null; cest?: string | null; unidade_comercial?: string | null; origem?: number | null }) | null;
  const [ncm, setNcm] = useState<string>(draft?.ncm ?? (p?.ncm ?? ""));
  const [cest, setCest] = useState<string>(draft?.cest ?? (p?.cest ?? ""));
  const [unidadeComercial, setUnidadeComercial] = useState<string>(draft?.unidadeComercial ?? (p?.unidade_comercial ?? "UN"));
  const [origem, setOrigem] = useState<string>(draft?.origem ?? (p?.origem != null ? String(p.origem) : "0"));
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fallbackCameraInputRef = useRef<HTMLInputElement | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const scanVideoRef = useRef<HTMLVideoElement | null>(null);

  // Auto-preencher CEST/unidade a partir do NCM (só quando os campos estão vazios/padrão)
  useEffect(() => {
    const s = suggestFromNcm(ncm);
    if (!s) return;
    if (s.cest && !cest) setCest(s.cest);
    if (s.unidade && (!unidadeComercial || unidadeComercial === "UN")) {
      setUnidadeComercial(s.unidade);
    }
    // origem permanece 0 (nacional) por padrão — usuário ajusta se importado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ncm]);

  // Scanner de código de barras (usa ZXing). Reconhece EAN/UPC/Code128/QR — se
  // o código tiver os 8 dígitos do NCM, preenche direto; senão sugere copiar.
  useEffect(() => {
    if (!scanOpen) return;
    let stopped = false;
    let controls: { stop: () => void } | null = null;
    (async () => {
      setScanError(null);
      try {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const reader = new BrowserMultiFormatReader();
        const video = scanVideoRef.current;
        if (!video) return;
        controls = await reader.decodeFromVideoDevice(undefined, video, (result, _err, ctrl) => {
          if (stopped || !result) return;
          const text = result.getText().replace(/\D/g, "");
          if (text.length >= 8) {
            const ncmGuess = text.slice(0, 8);
            setNcm(ncmGuess);
            toast.success(`NCM detectado: ${ncmGuess}`);
            ctrl.stop();
            setScanOpen(false);
          }
        });
      } catch (err: any) {
        setScanError(err?.message ?? "Não foi possível abrir a câmera para escanear.");
      }
    })();
    return () => {
      stopped = true;
      controls?.stop();
    };
  }, [scanOpen]);


  const hasVariants = colorVariants.length > 0;
  const variantStockTotal = colorVariants.reduce((s, v) => s + (Number.isFinite(v.stock) ? Math.max(0, v.stock) : 0), 0);

  useEffect(() => {
    const d: Draft = {
      productId: product?.id ?? null,
      name, description, price, originalPrice, category, stock, images, active, colorVariants,
      ncm, cest, unidadeComercial, origem,
    };
    try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch {}
  }, [product?.id, name, description, price, originalPrice, category, stock, images, active, colorVariants, ncm, cest, unidadeComercial, origem]);

  const clearDraft = () => { try { sessionStorage.removeItem(DRAFT_KEY); } catch {} };

  const handleFiles = async (files: FileList | File[]) => {
    const selected = Array.from(files);
    if (!selected.length) return;
    setUploading(true);
    try {
      const urls: string[] = [];
      for (const file of selected) {
        const url = await uploadProductImage(file);
        urls.push(url);
      }
      setImages((p) => [...p, ...urls]);
      toast.success(`${urls.length} imagem(ns) enviada(s)`);
    } catch (e: any) {
      toast.error(e.message ?? "Erro no upload");
    } finally {
      setUploading(false);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.currentTarget.files ?? []);
    e.currentTarget.value = "";
    if (selected.length) void handleFiles(selected);
  };

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  useEffect(() => {
    if (!cameraOpen) return;
    let cancelled = false;

    const startCamera = async () => {
      setCameraError(null);
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraOpen(false);
        fallbackCameraInputRef.current?.click();
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch {
        setCameraError("Não foi possível abrir a câmera. Use adicionar fotos.");
      }
    };

    void startCamera();
    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [cameraOpen]);

  const capturePhoto = async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
    if (!blob) return toast.error("Não foi possível capturar a foto");
    const file = new File([blob], `produto-${Date.now()}.jpg`, { type: "image/jpeg" });
    setCameraOpen(false);
    await handleFiles([file]);
  };

  const removeImage = (idx: number) => setImages((p) => p.filter((_, i) => i !== idx));
  const moveImage = (idx: number, dir: -1 | 1) => {
    setImages((p) => {
      const next = [...p];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return p;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const ncmDigits = ncm.replace(/\D/g, "");
    if (ncmDigits && ncmDigits.length !== 8) {
      toast.error("NCM deve ter 8 dígitos (ex.: 85167100) ou ficar em branco.");
      return;
    }
    const cestDigits = cest.replace(/\D/g, "");
    if (cestDigits && cestDigits.length !== 7) {
      toast.error("CEST deve ter 7 dígitos (ou deixe em branco)");
      return;
    }
    setBusy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      let creatorName: string | null = null;
      if (user) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", user.id)
          .maybeSingle();
        creatorName = (prof?.full_name?.trim() || user.email || null) ?? null;
      }
      const cleanVariants: ColorVariant[] = [];
      const seen = new Set<string>();
      for (const v of colorVariants) {
        const color = (v.color ?? "").trim();
        if (!color) continue;
        const key = color.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        cleanVariants.push({
          color,
          hex: v.hex && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v.hex) ? v.hex : null,
          stock: Math.max(0, Math.floor(Number(v.stock) || 0)),
        });
      }
      const finalStock = cleanVariants.length > 0
        ? cleanVariants.reduce((s, v) => s + v.stock, 0)
        : Number(stock);
      const basePayload = {
        name: name.trim(),
        description: description.trim() || null,
        price: Number(price),
        original_price: originalPrice ? Number(originalPrice) : null,
        category: category.trim() || null,
        stock: finalStock,
        image_url: images[0] ?? null,
        images,
        active,
        color_variants: cleanVariants.length > 0 ? cleanVariants : [],
        ncm: ncmDigits || null,
        cest: cestDigits || null,
        unidade_comercial: (unidadeComercial.trim() || "UN").toUpperCase().slice(0, 6),
        origem: Number.isFinite(Number(origem)) ? Number(origem) : 0,
      };
      if (product) {
        const { data, error } = await supabase
          .from("products")
          .update(basePayload)
          .eq("id", product.id)
          .select("id");
        if (error) throw error;
        if (!data || data.length === 0) {
          throw new Error(
            "Sem permissão para editar este produto. Confirme que sua conta possui o cargo de admin, gerente ou catálogo.",
          );
        }
        toast.success("Produto atualizado");
      } else {
        const { data, error } = await supabase
          .from("products")
          .insert({
            ...basePayload,
            created_by: user?.id ?? null,
            created_by_name: creatorName,
          })
          .select("id");
        if (error) throw error;
        if (!data || data.length === 0) {
          throw new Error(
            "Sem permissão para cadastrar produtos. Confirme que sua conta possui o cargo de admin, gerente ou catálogo.",
          );
        }
        toast.success("Produto cadastrado");
      }
      clearDraft();
      onSaved();
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao salvar");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm overflow-y-auto overscroll-contain">
      <form
        onSubmit={save}
        className="bg-card border-2 border-primary rounded-xl w-full max-w-2xl mx-auto my-4 sm:my-8 p-4 sm:p-6 space-y-4 shadow-deal"
      >
        <div className="flex items-center justify-between">
          <h2 className="display text-2xl">{product ? "Editar produto" : "Novo produto"}</h2>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">✕</button>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Fotos do produto ({images.length})
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCameraOpen(true)}
                disabled={uploading}
                className="inline-flex items-center gap-1.5 text-xs bg-secondary hover:bg-muted px-3 py-1.5 rounded cursor-pointer disabled:opacity-60"
              >
                📷 Tirar foto
              </button>
              <input
                ref={fallbackCameraInputRef}
                type="file"
                accept="image/*,video/*"
                capture="environment"
                className="hidden"
                onChange={handleFileInputChange}
              />
              <label className="inline-flex items-center gap-1.5 text-xs bg-secondary hover:bg-muted px-3 py-1.5 rounded cursor-pointer">
                <Upload className="h-3.5 w-3.5" /> {uploading ? "Enviando..." : "Adicionar fotos/vídeos"}
                <input
                  type="file"
                  accept="image/*,video/*"
                  multiple
                  className="hidden"
                  onChange={handleFileInputChange}
                />
              </label>
            </div>
          </div>


          {images.length === 0 ? (
            <label className="block aspect-[4/1] rounded-lg border-2 border-dashed border-border bg-muted flex items-center justify-center cursor-pointer hover:border-primary">
              <input
                type="file"
                accept="image/*,video/*"
                multiple
                className="hidden"
                onChange={handleFileInputChange}
              />
              <div className="text-center text-xs text-muted-foreground">
                <Upload className="h-6 w-6 mx-auto mb-1" />
                Clique para enviar imagens ou vídeos
              </div>
            </label>
          ) : (
            <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
              {images.map((src, idx) => (
                <div key={src} className="relative aspect-square rounded-md overflow-hidden border border-border group bg-black">
                  {isVideoUrl(src) ? (
                    <video src={src} className="w-full h-full object-cover" muted playsInline preload="metadata" />
                  ) : (
                    <img src={src} alt="" className="w-full h-full object-cover" />
                  )}
                  {idx === 0 && (
                    <span className="absolute top-1 left-1 bg-primary text-primary-foreground text-[9px] font-bold px-1.5 py-0.5 rounded">CAPA</span>
                  )}
                  {isVideoUrl(src) && (
                    <span className="absolute bottom-1 right-1 bg-background/80 text-foreground text-[9px] font-bold px-1.5 py-0.5 rounded">VÍDEO</span>
                  )}
                  <div className="absolute inset-0 bg-background/70 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-1">
                    <button type="button" onClick={() => moveImage(idx, -1)} className="bg-secondary text-xs px-1.5 py-0.5 rounded" disabled={idx === 0}>←</button>
                    <button type="button" onClick={() => moveImage(idx, 1)} className="bg-secondary text-xs px-1.5 py-0.5 rounded" disabled={idx === images.length - 1}>→</button>
                    <button type="button" onClick={() => removeImage(idx)} className="bg-destructive text-destructive-foreground text-xs px-1.5 py-0.5 rounded">✕</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <Input label="Nome" value={name} onChange={setName} required />
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Categoria</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full bg-input rounded-md px-3 py-2 border border-border focus:outline-none focus:border-primary mt-1 h-10"
            >
              <option value="">Selecione...</option>
              {PRODUCT_CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Descrição</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            className="w-full bg-input rounded-md px-3 py-2 border border-border focus:outline-none focus:border-primary mt-1"
          />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Input label="Preço (R$)" type="number" step="0.01" value={price} onChange={setPrice} required />
          <Input label="De (R$)" type="number" step="0.01" value={originalPrice} onChange={setOriginalPrice} placeholder="opcional" />
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Estoque {hasVariants && <span className="text-[10px] text-primary normal-case">(soma das cores)</span>}
            </label>
            <input
              type="number"
              value={hasVariants ? variantStockTotal : stock}
              onChange={(e) => setStock(e.target.value)}
              disabled={hasVariants}
              required={!hasVariants}
              className="w-full bg-input rounded-md px-3 py-2 border border-border focus:outline-none focus:border-primary mt-1 disabled:opacity-60"
            />
          </div>
        </div>

        <div className="rounded-lg border border-border bg-secondary/30 p-3 space-y-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <div className="text-sm font-bold uppercase tracking-wider">Variações de cor</div>
              <div className="text-[11px] text-muted-foreground">
                Cadastre cores diferentes da mesma capinha. O cliente escolhe a cor no anúncio e o estoque é controlado por cor.
              </div>
            </div>
            <button
              type="button"
              onClick={() => setColorVariants((p) => [...p, { color: "", hex: "#000000", stock: 0 }])}
              className="inline-flex items-center gap-1 text-xs bg-primary text-primary-foreground font-bold uppercase tracking-wider px-3 py-1.5 rounded"
            >
              <Plus className="h-3.5 w-3.5" /> Adicionar cor
            </button>
          </div>

          {colorVariants.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhuma cor cadastrada. O produto usará o estoque único acima.</p>
          ) : (
            <div className="space-y-2">
              {colorVariants.map((v, i) => (
                <div key={i} className="flex items-center gap-2 bg-card border border-border rounded-md p-2">
                  <input
                    type="color"
                    value={v.hex || "#000000"}
                    onChange={(e) => setColorVariants((p) => p.map((x, j) => j === i ? { ...x, hex: e.target.value } : x))}
                    className="h-9 w-12 rounded border border-border bg-transparent cursor-pointer flex-shrink-0"
                    title="Cor visual"
                  />
                  <input
                    type="text"
                    placeholder="Nome da cor (ex: Preto)"
                    value={v.color}
                    onChange={(e) => setColorVariants((p) => p.map((x, j) => j === i ? { ...x, color: e.target.value } : x))}
                    className="flex-1 min-w-0 bg-input rounded-md px-3 py-2 border border-border text-sm focus:outline-none focus:border-primary"
                  />
                  <input
                    type="number"
                    min={0}
                    placeholder="Estoque"
                    value={v.stock}
                    onChange={(e) => setColorVariants((p) => p.map((x, j) => j === i ? { ...x, stock: Math.max(0, Math.floor(Number(e.target.value) || 0)) } : x))}
                    className="w-24 bg-input rounded-md px-3 py-2 border border-border text-sm focus:outline-none focus:border-primary"
                  />
                  <button
                    type="button"
                    onClick={() => setColorVariants((p) => p.filter((_, j) => j !== i))}
                    className="p-2 hover:bg-destructive/10 text-destructive rounded"
                    title="Remover cor"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <div className="text-[11px] text-muted-foreground text-right">
                Total: <span className="font-bold text-foreground">{variantStockTotal}</span> unidade(s)
              </div>
            </div>
          )}
        </div>

        <div className="rounded-lg border border-border bg-secondary/30 p-3 space-y-3">
          <div>
            <div className="text-sm font-bold uppercase tracking-wider">Dados fiscais</div>
            <div className="text-[11px] text-muted-foreground">
              Recomendados para emissão de NFC-e/NF-e (a nota falhará sem NCM). Consulte em{" "}
              <a
                href="https://portalunico.siscomex.gov.br/classif/#/sumario?perfil=publico"
                target="_blank"
                rel="noreferrer"
                className="text-primary underline"
              >
                Siscomex
              </a>
              .
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                NCM (8 dígitos)
              </label>
              <input
                value={ncm}
                onChange={(e) => setNcm(e.target.value.replace(/\D/g, "").slice(0, 8))}
                placeholder="Ex: 85167100 (opcional)"
                inputMode="numeric"
                className="w-full mt-1 bg-input rounded-md px-3 py-2 border border-border focus:outline-none focus:border-primary"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Consulte o NCM do produto em{" "}
                <a href="https://portalunico.siscomex.gov.br/classif/#/nesh/consulta" target="_blank" rel="noreferrer" className="underline">
                  Siscomex
                </a>
                . O código de barras (EAN) do produto não corresponde ao NCM.
              </p>
            </div>
            <Input
              label="CEST (opcional)"
              value={cest}
              onChange={(v) => setCest(v.replace(/\D/g, "").slice(0, 7))}
              placeholder="Ex: 2106400"
              inputMode="numeric"
            />
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <Input
              label="Unidade comercial"
              value={unidadeComercial}
              onChange={(v) => setUnidadeComercial(v.toUpperCase().slice(0, 6))}
              placeholder="UN"
            />
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Origem</label>
              <select
                value={origem}
                onChange={(e) => setOrigem(e.target.value)}
                className="w-full bg-input rounded-md px-3 py-2 border border-border focus:outline-none focus:border-primary mt-1 h-10"
              >
                <option value="0">0 — Nacional</option>
                <option value="1">1 — Estrangeira (importação direta)</option>
                <option value="2">2 — Estrangeira (mercado interno)</option>
                <option value="3">3 — Nacional c/ conteúdo importado &gt;40%</option>
                <option value="4">4 — Nacional (processos produtivos básicos)</option>
                <option value="5">5 — Nacional c/ conteúdo importado ≤40%</option>
                <option value="6">6 — Estrangeira (importação, sem similar)</option>
                <option value="7">7 — Estrangeira (mercado interno, sem similar)</option>
                <option value="8">8 — Nacional c/ conteúdo importado &gt;70%</option>
              </select>
            </div>
          </div>
        </div>



        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="accent-primary h-4 w-4" />
          <span className="text-sm">Produto ativo (visível na loja)</span>
        </label>


        <div className="flex gap-2 justify-end pt-2 border-t border-border">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-md hover:bg-secondary text-sm">Cancelar</button>
          <button
            type="submit"
            disabled={busy || uploading}
            className="bg-primary text-primary-foreground font-black uppercase tracking-wider px-6 py-2 rounded-md shadow-deal disabled:opacity-60"
          >
            {busy ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </form>

      {cameraOpen && (
        <div className="fixed inset-0 z-[60] bg-background flex flex-col p-4">
          <div className="flex items-center justify-between pb-3">
            <h3 className="display text-xl">Tirar foto</h3>
            <button type="button" onClick={() => setCameraOpen(false)} className="text-muted-foreground hover:text-foreground">✕</button>
          </div>
          <div className="flex-1 min-h-0 rounded-lg overflow-hidden bg-muted border border-border flex items-center justify-center">
            {cameraError ? (
              <p className="text-sm text-muted-foreground text-center px-6">{cameraError}</p>
            ) : (
              <video ref={videoRef} className="h-full w-full object-contain" playsInline muted autoPlay />
            )}
          </div>
          <div className="pt-4 flex gap-2 justify-center">
            <button type="button" onClick={() => setCameraOpen(false)} className="px-4 py-3 rounded-md bg-secondary text-sm font-bold">
              Cancelar
            </button>
            <button
              type="button"
              onClick={capturePhoto}
              disabled={!!cameraError || uploading}
              className="px-6 py-3 rounded-md bg-primary text-primary-foreground text-sm font-black uppercase tracking-wider disabled:opacity-60"
            >
              Usar foto
            </button>
          </div>
        </div>
      )}

    </div>

  );
}

function Input({
  label, value, onChange, ...rest
}: { label: string; value: string; onChange: (v: string) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value">) {
  return (
    <label className="block">
      <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
      <input
        {...rest}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-input rounded-md px-3 py-2 border border-border focus:outline-none focus:border-primary mt-1"
      />
    </label>
  );
}

export const PRODUCT_FORM_DRAFT_KEY = DRAFT_KEY;
