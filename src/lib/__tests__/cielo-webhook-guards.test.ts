import { describe, expect, test } from "bun:test";
import {
  cieloAmountMatches,
  normalizeCieloKey,
  resolveCieloOrderKey,
} from "../cielo-webhook-guards";

describe("guardas do webhook Cielo", () => {
  test("normaliza a chave no mesmo formato enviado à Cielo", () => {
    expect(normalizeCieloKey("ABC-123_xyz")).toBe("abc123xyz");
    expect(normalizeCieloKey("12345678901234567890extra")).toBe("12345678901234567890");
  });

  test("rejeita divergência entre payload e transação remota", () => {
    expect(
      resolveCieloOrderKey({
        bodyOrderNumber: "pedido-falso",
        cieloOrderNumber: "pedido-real",
      }),
    ).toEqual({ ok: false, reason: "order_number_divergente" });
  });

  test("usa exclusivamente a chave confirmada pela Cielo", () => {
    expect(
      resolveCieloOrderKey({
        bodyOrderNumber: "pedido-real",
        cieloOrderNumber: "pedido-real",
      }),
    ).toEqual({ ok: true, key: "pedidoreal" });
  });

  test("compara centavos com total sem frete", () => {
    expect(cieloAmountMatches(9_000, 100, 10)).toBe(true);
    expect(cieloAmountMatches(8_000, 100, 10)).toBe(false);
  });
});
