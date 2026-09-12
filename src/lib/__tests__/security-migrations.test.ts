import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

const migrationUrl = new URL(
  "../../../supabase/migrations/20260911170000_lock_delivery_upgrade_and_fulfillment_scope.sql",
  import.meta.url,
);

describe("migrations de segurança", () => {
  test("restringe confirmação de frete ao service_role", async () => {
    const sql = await readFile(migrationUrl, "utf8");
    expect(sql).toContain(
      "REVOKE ALL ON FUNCTION public.apply_delivery_upgrade(uuid, text) FROM authenticated",
    );
    expect(sql).toContain(
      "GRANT EXECUTE ON FUNCTION public.apply_delivery_upgrade(uuid, text) TO service_role",
    );
  });

  test("nega escopo nulo para fulfillment", async () => {
    const sql = await readFile(migrationUrl, "utf8");
    expect(sql).toContain("_unidade IS NOT NULL AND EXISTS");
    expect(sql).toContain("fulfillment_scope_unidade(auth.uid()) IS NOT NULL");
  });
});
