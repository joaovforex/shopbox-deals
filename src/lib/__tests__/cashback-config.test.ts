import { describe, it, expect } from "bun:test";
import { CASHBACK_RATE, CASHBACK_PERCENT_LABEL, calculateCashback } from "../cashback-config";

describe("cashback-config", () => {
  it("taxa de cashback é exatamente 5% (nunca 10%)", () => {
    expect(CASHBACK_RATE).toBe(0.05);
    expect(CASHBACK_RATE).not.toBe(0.1);
    expect(CASHBACK_PERCENT_LABEL).toBe("5%");
  });

  it("calculateCashback devolve 5% do subtotal", () => {
    expect(calculateCashback(100)).toBe(5);
    expect(calculateCashback(80)).toBe(4);
    expect(calculateCashback(199.9)).toBe(10);
  });

  it("nunca retorna o valor de 10% (regressão histórica)", () => {
    for (const v of [50, 100, 250, 999.99]) {
      expect(calculateCashback(v)).not.toBe(v * 0.1);
    }
  });

  it("ignora valores inválidos", () => {
    expect(calculateCashback(0)).toBe(0);
    expect(calculateCashback(-10)).toBe(0);
    expect(calculateCashback(NaN)).toBe(0);
  });

  it("strings de UI batem com a taxa", () => {
    // Garante que o label textual está sincronizado com a constante numérica.
    const pct = `${Math.round(CASHBACK_RATE * 100)}%`;
    expect(pct).toBe(CASHBACK_PERCENT_LABEL);
  });
});
