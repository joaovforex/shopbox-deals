import { useRef, useState } from "react";
import { toast } from "sonner";
import { Percent, Boxes, Tag, Replace, Eye, EyeOff, Download, Upload, X, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/lib/audit";
import { cn } from "@/lib/utils";
import type { Product } from "@/lib/products";
import {
  productsToCsv,
  downloadCsv,
  parseProductsCsv,
  buildCsvDiff,
  type CsvDiff,
} from "@/lib/product-csv";

type Panel = "discount" | "stock" | "category" | "replace" | "import" | null;

const btn =
  "inline-flex items-center gap-1.5 min-h-11 px-3 rounded-md border border-border bg-card text-xs font-bold uppercase tracking-wider hover:bg-secondary disabled:opacity-50";

export function BulkProductActions({
  selectedIds,
  products,
  categories,
  onDone,
}: {
  selectedIds: string[];
  products: Product[];
  categories: string[];
  onDone: () => void;
}) {
  const [panel, setPanel] = useState<Panel>(null);
  const [busy, setBusy] = useState(false);

  const [pct, setPct] = useState("10");
  const [stockValue, setStockValue] = useState("0");
  const [stockMode, setStockMode] = useState<"set" | "add">("set");
  const [category, setCategory] = useState("");
  const [findText, setFindText] = useState("");
  const [replaceText, setReplaceText] = useState("");

  const [diffs, setDiffs] = useState<CsvDiff[] | null>(null);
  const [csvInfo, setCsvInfo] = useState<{ unmatched: number; skipped: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const n = selectedIds.length;
  const hasSel = n > 0;

  const run = async (
    label: string,
    fn: () => PromiseLike<{ data: unknown; error: { message: string } | null }>,

    audit: { action: string; details: Record<string, unknown> },
  ) => {
    setBusy(true);
    const { data, error } = await fn();
    setBusy(false);
    if (error) return toast.error(error.message);
    const changed = Number(data ?? 0);
    if (changed === 0) return toast.warning("Nenhum produto foi alterado.");
    toast.success(`${label}: ${changed} produto(s)`);
    void logAudit({
      action: audit.action,
      entity: "products",
      details: { ...audit.details, count: changed, ids: selectedIds.slice(0, 50) },
    });
    setPanel(null);
    onDone();
  };

  const applyDiscount = () => {
    const value = Number(pct.replace(",", "."));
    if (!Number.isFinite(value) || value <= 0 || value >= 90) return toast.error("Percentual entre 1 e 89.");
    if (!confirm(`Aplicar ${value}% de desconto em ${n} produto(s)?`)) return;
    void run(
      "Desconto aplicado",
      () => supabase.rpc("admin_apply_discount_to_products" as never, { p_ids: selectedIds, p_pct: value } as never),
      { action: "produtos.desconto_massa", details: { pct: value } },
    );
  };

  const applyStock = () => {
    const value = Number.parseInt(stockValue, 10);
    if (!Number.isFinite(value)) return toast.error("Informe um número.");
    if (!confirm(`${stockMode === "set" ? "Definir" : "Somar"} estoque ${value} em ${n} produto(s)?`)) return;
    void run(
      "Estoque atualizado",
      () => supabase.rpc("admin_set_products_stock" as never, { p_ids: selectedIds, p_value: value, p_mode: stockMode } as never),
      { action: "produtos.estoque_massa", details: { value, mode: stockMode } },
    );
  };

  const applyCategory = () => {
    if (!category.trim()) return toast.error("Escolha ou digite uma categoria.");
    if (!confirm(`Mover ${n} produto(s) para "${category.trim()}"?`)) return;
    void run(
      "Categoria alterada",
      () => supabase.rpc("admin_set_products_category" as never, { p_ids: selectedIds, p_category: category.trim() } as never),
      { action: "produtos.categoria_massa", details: { category: category.trim() } },
    );
  };

  const applyReplace = () => {
    if (!findText.trim()) return toast.error("Informe o texto a localizar.");
    const preview = products
      .filter((p) => selectedIds.includes(p.id) && p.name.toLowerCase().includes(findText.trim().toLowerCase()))
      .slice(0, 3)
      .map((p) => p.name);
    if (!confirm(`Substituir "${findText}" por "${replaceText}" nos nomes selecionados?\n\n${preview.join("\n") || "(sem prévia)"}`)) return;
    void run(
      "Nomes atualizados",
      () =>
        supabase.rpc("admin_replace_in_product_names" as never, {
          p_ids: selectedIds,
          p_find: findText.trim(),
          p_replace: replaceText,
        } as never),
      { action: "produtos.localizar_substituir", details: { find: findText.trim(), replace: replaceText } },
    );
  };

  const toggleVisibility = (active: boolean) => {
    if (!confirm(`${active ? "Mostrar" : "Ocultar"} ${n} produto(s)?`)) return;
    void run(
      active ? "Produtos exibidos" : "Produtos ocultados",
      () => supabase.rpc("admin_set_products_active" as never, { p_ids: selectedIds, p_active: active } as never),
      { action: active ? "produtos.mostrar_massa" : "produtos.ocultar_massa", details: {} },
    );
  };

  const exportCsv = () => {
    const list = hasSel ? products.filter((p) => selectedIds.includes(p.id)) : products;
    if (list.length === 0) return toast.error("Nada para exportar.");
    downloadCsv(`catalogo-shopbox-${new Date().toISOString().slice(0, 10)}.csv`, productsToCsv(list));
    toast.success(`${list.length} produto(s) exportado(s)`);
    void logAudit({ action: "produtos.exportar_csv", entity: "products", details: { count: list.length } });
  };

  const onPickFile = async (file: File) => {
    const text = await file.text();
    const parsed = parseProductsCsv(text);
    if (parsed.rows.length === 0) {
      return toast.error("CSV sem linhas válidas (é preciso a coluna id ou sku).");
    }
    const { diffs, unmatched } = buildCsvDiff(parsed.rows, products);
    setDiffs(diffs);
    setCsvInfo({ unmatched, skipped: parsed.skipped });
    setPanel("import");
  };

  const applyImport = async () => {
    if (!diffs || diffs.length === 0) return;
    setBusy(true);
    let ok = 0;
    let fail = 0;
    for (const d of diffs) {
      const fields: Record<string, unknown> = {};
      d.changes.forEach((c) => { fields[c.field] = c.to; });
      const { error } = await supabase.rpc("admin_update_product_fields" as never, {
        p_id: d.id,
        p_fields: fields,
      } as never);
      if (error) fail++;
      else ok++;
    }
    setBusy(false);
    toast[fail ? "warning" : "success"](`Importação: ${ok} atualizado(s)${fail ? `, ${fail} com erro` : ""}`);
    void logAudit({ action: "produtos.importar_csv", entity: "products", details: { updated: ok, failed: fail } });
    setDiffs(null);
    setCsvInfo(null);
    setPanel(null);
    onDone();
  };

  return (
    <div className="mb-4 rounded-lg border border-border bg-card p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mr-1">
          {hasSel ? `${n} selecionado(s)` : "Ações em lote"}
        </span>
        <button type="button" className={btn} disabled={!hasSel || busy} onClick={() => setPanel(panel === "discount" ? null : "discount")}>
          <Percent className="h-4 w-4" /> Desconto
        </button>
        <button type="button" className={btn} disabled={!hasSel || busy} onClick={() => setPanel(panel === "stock" ? null : "stock")}>
          <Boxes className="h-4 w-4" /> Estoque
        </button>
        <button type="button" className={btn} disabled={!hasSel || busy} onClick={() => setPanel(panel === "category" ? null : "category")}>
          <Tag className="h-4 w-4" /> Categoria
        </button>
        <button type="button" className={btn} disabled={!hasSel || busy} onClick={() => setPanel(panel === "replace" ? null : "replace")}>
          <Replace className="h-4 w-4" /> Localizar e substituir
        </button>
        <button type="button" className={btn} disabled={!hasSel || busy} onClick={() => toggleVisibility(false)}>
          <EyeOff className="h-4 w-4" /> Ocultar
        </button>
        <button type="button" className={btn} disabled={!hasSel || busy} onClick={() => toggleVisibility(true)}>
          <Eye className="h-4 w-4" /> Mostrar
        </button>
        <span className="mx-1 hidden sm:block h-6 w-px bg-border" />
        <button type="button" className={btn} disabled={busy} onClick={exportCsv}>
          <Download className="h-4 w-4" /> Exportar CSV
        </button>
        <button type="button" className={btn} disabled={busy} onClick={() => fileRef.current?.click()}>
          <Upload className="h-4 w-4" /> Importar CSV
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void onPickFile(f);
          }}
        />
      </div>

      {panel && panel !== "import" && (
        <div className="mt-3 border-t border-border pt-3 flex flex-wrap items-end gap-3">
          {panel === "discount" && (
            <>
              <label className="text-xs">
                <span className="block mb-1 uppercase tracking-wider text-muted-foreground">% de desconto</span>
                <input value={pct} onChange={(e) => setPct(e.target.value)} inputMode="decimal"
                  className="h-11 w-28 px-3 rounded-md border border-border bg-background text-sm" />
              </label>
              <p className="text-xs text-muted-foreground max-w-xs">
                Calculado sobre o preço "de". Nunca aumenta o preço atual.
              </p>
              <button type="button" onClick={applyDiscount} disabled={busy} className={cn(btn, "bg-primary text-primary-foreground border-primary")}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Percent className="h-4 w-4" />} Aplicar
              </button>
            </>
          )}

          {panel === "stock" && (
            <>
              <label className="text-xs">
                <span className="block mb-1 uppercase tracking-wider text-muted-foreground">Modo</span>
                <select value={stockMode} onChange={(e) => setStockMode(e.target.value as "set" | "add")}
                  className="h-11 px-3 rounded-md border border-border bg-background text-sm">
                  <option value="set">Definir</option>
                  <option value="add">Somar/subtrair</option>
                </select>
              </label>
              <label className="text-xs">
                <span className="block mb-1 uppercase tracking-wider text-muted-foreground">Quantidade</span>
                <input value={stockValue} onChange={(e) => setStockValue(e.target.value)} inputMode="numeric"
                  className="h-11 w-28 px-3 rounded-md border border-border bg-background text-sm" />
              </label>
              <button type="button" onClick={applyStock} disabled={busy} className={cn(btn, "bg-primary text-primary-foreground border-primary")}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Boxes className="h-4 w-4" />} Aplicar
              </button>
            </>
          )}

          {panel === "category" && (
            <>
              <label className="text-xs">
                <span className="block mb-1 uppercase tracking-wider text-muted-foreground">Nova categoria</span>
                <input list="bulk-categories" value={category} onChange={(e) => setCategory(e.target.value)}
                  placeholder="Ex.: Calçados"
                  className="h-11 w-56 px-3 rounded-md border border-border bg-background text-sm" />
                <datalist id="bulk-categories">
                  {categories.map((c) => <option key={c} value={c} />)}
                </datalist>
              </label>
              <button type="button" onClick={applyCategory} disabled={busy} className={cn(btn, "bg-primary text-primary-foreground border-primary")}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Tag className="h-4 w-4" />} Aplicar
              </button>
            </>
          )}

          {panel === "replace" && (
            <>
              <label className="text-xs">
                <span className="block mb-1 uppercase tracking-wider text-muted-foreground">Localizar</span>
                <input value={findText} onChange={(e) => setFindText(e.target.value)} placeholder="Soarpin"
                  className="h-11 w-44 px-3 rounded-md border border-border bg-background text-sm" />
              </label>
              <label className="text-xs">
                <span className="block mb-1 uppercase tracking-wider text-muted-foreground">Substituir por</span>
                <input value={replaceText} onChange={(e) => setReplaceText(e.target.value)} placeholder="Scarpin"
                  className="h-11 w-44 px-3 rounded-md border border-border bg-background text-sm" />
              </label>
              <button type="button" onClick={applyReplace} disabled={busy} className={cn(btn, "bg-primary text-primary-foreground border-primary")}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Replace className="h-4 w-4" />} Aplicar
              </button>
            </>
          )}
        </div>
      )}

      {panel === "import" && diffs && (
        <div className="mt-3 border-t border-border pt-3">
          <div className="flex items-center justify-between gap-2 mb-2">
            <h3 className="text-sm font-semibold uppercase tracking-wide">Prévia da importação</h3>
            <button type="button" onClick={() => { setPanel(null); setDiffs(null); }} className="p-2 hover:bg-secondary rounded">
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="text-xs text-muted-foreground mb-2">
            {diffs.length} produto(s) serão alterados
            {csvInfo?.unmatched ? ` · ${csvInfo.unmatched} sem correspondência` : ""}
            {csvInfo?.skipped ? ` · ${csvInfo.skipped} linha(s) ignorada(s)` : ""}.
          </p>
          {diffs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma diferença encontrada — nada a aplicar.</p>
          ) : (
            <>
              <div className="max-h-72 overflow-auto rounded border border-border">
                <table className="w-full text-xs">
                  <thead className="bg-secondary text-left uppercase tracking-wider sticky top-0">
                    <tr><th className="p-2">Produto</th><th className="p-2">Alterações</th></tr>
                  </thead>
                  <tbody>
                    {diffs.slice(0, 200).map((d) => (
                      <tr key={d.id} className="border-t border-border align-top">
                        <td className="p-2 font-semibold">{d.name}</td>
                        <td className="p-2">
                          {d.changes.map((c) => (
                            <div key={c.field}>
                              <span className="uppercase text-muted-foreground">{c.field}</span>{" "}
                              <span className="line-through text-muted-foreground">{String(c.from ?? "—")}</span>{" → "}
                              <span className="font-bold">{String(c.to)}</span>
                            </div>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button type="button" onClick={applyImport} disabled={busy}
                className={cn(btn, "mt-3 bg-primary text-primary-foreground border-primary")}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                Aplicar {diffs.length} alteração(ões)
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
