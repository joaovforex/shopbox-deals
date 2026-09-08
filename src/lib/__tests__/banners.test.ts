import { describe, expect, it } from "bun:test";
import {
  isBannerVisible,
  isSafeBannerLink,
  isExternalBannerLink,
  sortBanners,
  validateBanner,
  type SiteBanner,
} from "@/lib/banners";

const base: SiteBanner = {
  id: "a",
  desktop_url: "d.jpg",
  mobile_url: "m.jpg",
  alt_text: "Oferta",
  link_url: "/loja",
  sort_order: 0,
  is_active: true,
  starts_at: null,
  ends_at: null,
};

const NOW = new Date("2026-01-10T12:00:00Z");

describe("visibilidade do banner", () => {
  it("mostra banner ativo sem janela", () => {
    expect(isBannerVisible(base, NOW)).toBe(true);
  });

  it("esconde banner desativado", () => {
    expect(isBannerVisible({ ...base, is_active: false }, NOW)).toBe(false);
  });

  it("esconde antes de começar e depois de terminar", () => {
    expect(isBannerVisible({ ...base, starts_at: "2026-02-01T00:00:00Z" }, NOW)).toBe(false);
    expect(isBannerVisible({ ...base, ends_at: "2026-01-01T00:00:00Z" }, NOW)).toBe(false);
  });

  it("mostra dentro da janela", () => {
    expect(
      isBannerVisible(
        { ...base, starts_at: "2026-01-01T00:00:00Z", ends_at: "2026-02-01T00:00:00Z" },
        NOW,
      ),
    ).toBe(true);
  });
});

describe("ordenação", () => {
  it("ordena por sort_order e desempata por id", () => {
    const list = sortBanners([
      { ...base, id: "c", sort_order: 2 },
      { ...base, id: "b", sort_order: 1 },
      { ...base, id: "a", sort_order: 1 },
    ]);
    expect(list.map((b) => b.id)).toEqual(["a", "b", "c"]);
  });
});

describe("links", () => {
  it("aceita caminho interno e https", () => {
    expect(isSafeBannerLink("/loja")).toBe(true);
    expect(isSafeBannerLink("https://exemplo.com")).toBe(true);
  });

  it("bloqueia javascript:, http e protocolo relativo", () => {
    expect(isSafeBannerLink("javascript:alert(1)")).toBe(false);
    expect(isSafeBannerLink("http://exemplo.com")).toBe(false);
    expect(isSafeBannerLink("//exemplo.com")).toBe(false);
  });

  it("identifica link externo", () => {
    expect(isExternalBannerLink("https://exemplo.com")).toBe(true);
    expect(isExternalBannerLink("/loja")).toBe(false);
  });
});

describe("validação do formulário", () => {
  const input = {
    desktop_url: "d.jpg",
    mobile_url: "m.jpg",
    alt_text: "Oferta",
    link_url: "/loja",
    sort_order: 0,
    is_active: true,
    starts_at: null,
    ends_at: null,
  };

  it("aceita entrada válida", () => {
    expect(validateBanner(input)).toBeNull();
  });

  it("exige as duas imagens e a descrição", () => {
    expect(validateBanner({ ...input, mobile_url: "" })).toContain("imagens");
    expect(validateBanner({ ...input, alt_text: "  " })).toContain("Descreva");
  });

  it("rejeita link inseguro e janela invertida", () => {
    expect(validateBanner({ ...input, link_url: "javascript:x" })).toContain("link");
    expect(
      validateBanner({
        ...input,
        starts_at: "2026-02-01T00:00:00Z",
        ends_at: "2026-01-01T00:00:00Z",
      }),
    ).toContain("depois");
  });
});
