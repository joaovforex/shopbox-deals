import type { Product } from "@/lib/products";

/**
 * Import/export CSV do catálogo.
 * Somente campos de catálogo — nada de pedidos, pagamento ou fiscal.
 */

export const CSV_COLUMNS = [
  "id",
  "sku",
  "name",
  "description",
  "category",
  "brand",
  "size",
  "price",
  "original_price",
  "stock",
  "active",
] as const;

export type CsvColumn = (typeof CSV_COLUMNS)[number];

function escapeCell(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  if (/[";\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Usa `;` como separador (padrão do Excel pt-BR). */
export function productsToCsv(products: Product[]): string {
  const head = CSV_COLUMNS.join(";");
  const rows = products.map((p) =>
    CSV_COLUMNS.map((c) => {
      const v = (p as unknown as Record<string, unknown>)[c];
      if (c === "active") return v ? "sim" : "nao";
      return escapeCell(v);
    }).join(";"),
  );
  return [head, ...rows].join("\r\n");
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function splitLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else quoted = false;
      } else cur += ch;
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === sep) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

export type CsvRow = Partial<Record<CsvColumn, string>>;

export type ParsedCsv = {
  rows: CsvRow[];
  /** linhas ignoradas por não terem `id` nem `sku` */
  skipped: number;
  headers: string[];
};

export function parseProductsCsv(text: string): ParsedCsv {
  const clean = text.replace(/^\uFEFF/, "").trim();
  const lines = clean.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length === 0) return { rows: [], skipped: 0, headers: [] };

  const sep = (lines[0].match(/;/g)?.length ?? 0) >= (lines[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  const headers = splitLine(lines[0], sep).map((h) => h.toLowerCase());

  const rows: CsvRow[] = [];
  let skipped = 0;
  for (const line of lines.slice(1)) {
    const cells = splitLine(line, sep);
    const row: CsvRow = {};
    headers.forEach((h, i) => {
      if ((CSV_COLUMNS as readonly string[]).includes(h)) {
        row[h as CsvColumn] = cells[i] ?? "";
      }
    });
    if (!row.id && !row.sku) { skipped++; continue; }
    rows.push(row);
  }
  return { rows, skipped, headers };
}

/** Converte um número em formato pt-BR ("29,90") ou en ("29.90"). */
export function parseNumber(raw: string | undefined): number | null {
  if (!raw) return null;
  const s = raw.trim().replace(/\s/g, "").replace(/R\$/i, "");
  if (!s) return null;
  const normalized = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

export type DiffField = { field: CsvColumn; from: unknown; to: unknown };
export type CsvDiff = { id: string; name: string; changes: DiffField[] };

/** Compara as linhas do CSV com o catálogo atual e devolve só o que muda. */
export function buildCsvDiff(rows: CsvRow[], products: Product[]): { diffs: CsvDiff[]; unmatched: number } {
  const byId = new Map(products.map((p) => [p.id, p]));
  const bySku = new Map(products.map((p) => [p.sku?.toLowerCase(), p]));
  const diffs: CsvDiff[] = [];
  let unmatched = 0;

  for (const row of rows) {
    const p = (row.id && byId.get(row.id.trim())) || (row.sku && bySku.get(row.sku.trim().toLowerCase()));
    if (!p) { unmatched++; continue; }

    const changes: DiffField[] = [];
    const cmpText = (field: CsvColumn, current: unknown) => {
      const raw = row[field];
      if (raw === undefined) return;
      const next = raw.trim();
      if (next === "") return;
      if (next !== (current ?? "")) changes.push({ field, from: current ?? "", to: next });
    };
    const cmpNum = (field: CsvColumn, current: number | null) => {
      const next = parseNumber(row[field]);
      if (next === null) return;
      if (Math.abs(next - (current ?? 0)) > 0.001) changes.push({ field, from: current, to: next });
    };

    cmpText("name", p.name);
    cmpText("description", p.description);
    cmpText("category", p.category);
    cmpText("brand", (p as unknown as Record<string, unknown>).brand ?? null);
    cmpText("size", (p as unknown as Record<string, unknown>).size ?? null);
    cmpNum("price", p.price);
    cmpNum("original_price", p.original_price);
    const stock = parseNumber(row.stock);
    if (stock !== null && Math.round(stock) !== p.stock) {
      changes.push({ field: "stock", from: p.stock, to: Math.round(stock) });
    }

    if (changes.length > 0) diffs.push({ id: p.id, name: p.name, changes });
  }

  return { diffs, unmatched };
}
