import { describe, expect, it } from "bun:test";
import { installmentLabel, installmentPlans, maxInstallmentsFor } from "../installments";

describe("parcelamento de produtos", () => {
  it("mostra até 5x sem juros com o valor de cada parcela", () => {
    expect(installmentLabel(190)).toBe("em até 5x de R$ 38,00 sem juros");
    expect(maxInstallmentsFor(190)).toBe(5);
  });

  it("respeita a parcela mínima de R$ 5", () => {
    expect(installmentLabel(20)).toBe("em até 4x de R$ 5,00 sem juros");
    expect(installmentPlans(20)).toHaveLength(4);
  });

  it("não exibe parcelamento quando só cabe pagamento à vista", () => {
    expect(installmentLabel(4.99)).toBeNull();
  });
});