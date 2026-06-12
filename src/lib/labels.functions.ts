import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type LabelEvent = "generated" | "printed";

async function assertLabelAccess(context: { supabase: any; userId: string }) {
  const { data: roles, error } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId);
  if (error) throw new Error(error.message);

  const allowed = (roles ?? []).some((r: { role: string }) =>
    ["admin", "fulfillment", "catalog"].includes(r.role),
  );
  if (!allowed) throw new Error("Sem permissão");
}

export const markLabelEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { order_id: string; event: LabelEvent }) => {
    if (!input?.order_id || !/^[0-9a-f-]{36}$/i.test(input.order_id)) throw new Error("Pedido inválido");
    if (!["generated", "printed"].includes(input.event)) throw new Error("Evento inválido");
    return { order_id: input.order_id, event: input.event };
  })
  .handler(async ({ data, context }) => {
    await assertLabelAccess(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("full_name")
      .eq("id", context.userId)
      .maybeSingle();
    const { data: userData } = await supabaseAdmin.auth.admin.getUserById(context.userId);
    const name = profile?.full_name || userData?.user?.email || context.userId;

    const patch =
      data.event === "printed"
        ? {
            label_printed_at: new Date().toISOString(),
            label_printed_by: context.userId,
            label_printed_by_name: name,
            label_status: "printed",
            label_generated_at: new Date().toISOString(),
            label_generated_by: context.userId,
            label_generated_by_name: name,
          }
        : {
            label_generated_at: new Date().toISOString(),
            label_generated_by: context.userId,
            label_generated_by_name: name,
            label_status: "generated",
          };

    const { error } = await supabaseAdmin.from("orders").update(patch).eq("id", data.order_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });