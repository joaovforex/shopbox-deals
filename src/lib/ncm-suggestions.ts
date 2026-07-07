// Sugestões de CEST/unidade a partir do NCM.
// Mapa por prefixo (mais específico primeiro). Baseado em segmentos comuns do
// varejo de acessórios de celular / eletrônicos (foco Shopbox), com fallback
// por capítulo (2 primeiros dígitos).

export type NcmSuggestion = {
  cest?: string;
  unidade?: string; // padrão UN
  descricao?: string;
};

// Prefixos NCM → sugestão. Chaves com mais dígitos têm prioridade.
const PREFIX_MAP: Record<string, NcmSuggestion> = {
  // Aparelhos telefônicos / celulares
  "85171211": { cest: "2103200", unidade: "UN", descricao: "Telefone celular" },
  "85171231": { cest: "2103200", unidade: "UN", descricao: "Smartphone" },
  "8517": { unidade: "UN", descricao: "Aparelhos de telefonia" },

  // Acessórios / partes de celular (capinhas, películas, cabos, carregadores)
  "39269090": { cest: "2810400", unidade: "UN", descricao: "Capa/case de plástico" },
  "42021": { cest: "2810400", unidade: "UN", descricao: "Estojo/case" },
  "70071900": { cest: "1004000", unidade: "UN", descricao: "Vidro temperado / película" },
  "70200010": { unidade: "UN", descricao: "Película de vidro" },

  // Fones de ouvido
  "85183000": { cest: "2106400", unidade: "UN", descricao: "Fone de ouvido" },

  // Carregadores / fontes
  "85044090": { cest: "2106300", unidade: "UN", descricao: "Carregador / fonte" },
  "85044010": { cest: "2106300", unidade: "UN", descricao: "Carregador" },

  // Cabos USB / conectores
  "85444200": { cest: "2106200", unidade: "UN", descricao: "Cabo com conectores" },
  "85444900": { cest: "2106200", unidade: "UN", descricao: "Cabo elétrico" },

  // Baterias / power bank
  "85076000": { cest: "2106100", unidade: "UN", descricao: "Bateria de íon-lítio" },
  "85044040": { cest: "2106100", unidade: "UN", descricao: "Power bank" },

  // Suportes / tripés
  "90065900": { unidade: "UN", descricao: "Tripé / suporte" },
  "39269020": { unidade: "UN", descricao: "Suporte plástico" },

  // Cartões de memória / pendrives
  "85235100": { cest: "2101000", unidade: "UN", descricao: "Cartão de memória / pendrive" },

  // Relógios inteligentes
  "91029900": { cest: "2106500", unidade: "UN", descricao: "Smartwatch" },

  // Eletrodomésticos pequenos
  "85167100": { unidade: "UN", descricao: "Aparelho eletrotérmico (cozedor de ovos, cafeteira etc.)" },
  "85098000": { unidade: "UN", descricao: "Eletrodoméstico" },
};

// Fallback por capítulo (2 dígitos) — só unidade
const CHAPTER_UNIT: Record<string, string> = {
  "39": "UN", // plásticos
  "42": "UN", // couro / estojos
  "48": "UN", // papel
  "49": "UN", // livros/impressos
  "61": "UN", // vestuário
  "62": "UN", // vestuário
  "63": "UN", // têxteis
  "64": "PAR", // calçados
  "70": "UN", // vidro
  "71": "UN", // joias
  "82": "UN", // ferramentas
  "84": "UN", // máquinas
  "85": "UN", // elétrico/eletrônico
  "90": "UN", // ótica/instrumentos
  "91": "UN", // relógios
  "94": "UN", // móveis
  "95": "UN", // brinquedos
  "96": "UN", // diversos
};

export function suggestFromNcm(ncmRaw: string): NcmSuggestion | null {
  const ncm = ncmRaw.replace(/\D/g, "");
  if (ncm.length !== 8) return null;

  // Match do prefixo mais específico
  const keys = Object.keys(PREFIX_MAP).sort((a, b) => b.length - a.length);
  for (const k of keys) {
    if (ncm.startsWith(k)) return PREFIX_MAP[k];
  }

  const chap = ncm.slice(0, 2);
  const unidade = CHAPTER_UNIT[chap];
  return unidade ? { unidade } : null;
}
