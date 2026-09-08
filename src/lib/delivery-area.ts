/**
 * Área de cobertura de entrega (Curitiba + Região Metropolitana) e consulta de
 * CEP. Módulo compartilhado entre o checkout e o bloco "Calcular entrega" da
 * página de produto para evitar listas divergentes.
 *
 * IMPORTANTE: esta validação é apenas de UX. A cotação e a validação reais
 * continuam no servidor (`quoteDelivery` / criação do pagamento).
 */

export const RMC_CITIES = [
  "Curitiba",
  "Almirante Tamandaré",
  "Araucária",
  "Campina Grande do Sul",
  "Campo Largo",
  "Campo Magro",
  "Colombo",
  "Fazenda Rio Grande",
  "Pinhais",
  "Piraquara",
  "Quatro Barras",
  "São José dos Pinhais",
] as const;

export function normalizeCity(name: string | null | undefined): string {
  return (name ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function isRmcCity(name: string | null | undefined): boolean {
  if (!name) return false;
  const norm = normalizeCity(name);
  return RMC_CITIES.some((c) => normalizeCity(c) === norm);
}

export function maskCep(v: string | null | undefined): string {
  const d = (v ?? "").replace(/\D/g, "").slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

export type CepLookup = {
  street: string;
  district: string;
  city: string;
  uf: string;
};

/** Consulta o ViaCEP. Lança Error com mensagem pronta para exibir. */
export async function lookupCep(cepDigits: string): Promise<CepLookup> {
  const d = cepDigits.replace(/\D/g, "");
  if (d.length !== 8) throw new Error("Informe um CEP válido");
  let json: {
    logradouro?: string;
    bairro?: string;
    localidade?: string;
    uf?: string;
    erro?: boolean | string;
  };
  try {
    const res = await fetch(`https://viacep.com.br/ws/${d}/json/`);
    json = await res.json();
  } catch {
    throw new Error("Não conseguimos buscar este CEP, tente novamente");
  }
  if (json.erro) throw new Error("CEP não encontrado");
  return {
    street: json.logradouro ?? "",
    district: json.bairro ?? "",
    city: json.localidade ?? "",
    uf: json.uf ?? "",
  };
}

export function outOfCoverageMessage(city: string, uf?: string): string {
  return `Entregamos apenas em Curitiba e região metropolitana. Este CEP é de ${city}${uf ? `/${uf}` : ""}.`;
}
