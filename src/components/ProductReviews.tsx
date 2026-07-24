import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Star } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { StarRating } from "@/components/StarRating";
import { productReviewsQuery, reviewsSummaryQuery, submitReview, userPurchasedProductQuery } from "@/lib/reviews";
import { useAuthUser, loginRedirectHref } from "@/lib/useAuthUser";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const d = Math.floor(diff / 86_400_000);
  if (d <= 0) return "hoje";
  if (d === 1) return "ontem";
  if (d < 30) return `${d} dias atrás`;
  const m = Math.floor(d / 30);
  if (m < 12) return `${m} ${m === 1 ? "mês" : "meses"} atrás`;
  const y = Math.floor(m / 12);
  return `${y} ${y === 1 ? "ano" : "anos"} atrás`;
}

export function ProductReviews({ productId }: { productId: string }) {
  const qc = useQueryClient();
  const user = useAuthUser();
  const { data: reviews = [] } = useQuery(productReviewsQuery(productId));
  const { data: summary } = useQuery(reviewsSummaryQuery(productId));
  const { data: purchased, isLoading: loadingPurchased } = useQuery(
    userPurchasedProductQuery(user?.id, productId),
  );


  const own = user ? reviews.find((r) => r.user_id === user.id) : null;
  const [rating, setRating] = useState<number>(own?.rating ?? 0);
  const [hover, setHover] = useState<number>(0);
  const [comment, setComment] = useState<string>(own?.comment ?? "");
  const [saving, setSaving] = useState(false);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["reviews", productId] });
    qc.invalidateQueries({ queryKey: ["reviews-summary", productId] });
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      window.location.href = loginRedirectHref();
      return;
    }
    if (rating < 1) {
      toast.error("Escolha uma nota de 1 a 5 estrelas.");
      return;
    }
    setSaving(true);
    const res = await submitReview({ productId, rating, comment });
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(own ? "Avaliação atualizada!" : "Avaliação enviada, obrigado!");
    invalidate();
  };

  const onDelete = async () => {
    if (!own) return;
    if (!confirm("Remover sua avaliação?")) return;
    const { error } = await supabase.from("product_reviews").delete().eq("id", own.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setRating(0);
    setComment("");
    invalidate();
    toast.success("Avaliação removida.");
  };

  return (
    <section className="mt-10 border-t border-border pt-8">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
        <div>
          <h2 className="display text-2xl">Avaliações</h2>
          {summary && summary.count > 0 ? (
            <div className="mt-1 flex items-center gap-2">
              <StarRating value={summary.average} size={18} />
              <span className="text-sm text-muted-foreground">
                <span className="text-foreground font-semibold">{summary.average.toFixed(1)}</span> · {summary.count}{" "}
                {summary.count === 1 ? "avaliação" : "avaliações"}
              </span>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground mt-1">Seja o primeiro a avaliar este produto.</p>
          )}
        </div>
      </div>

      {/* Formulário */}
      <form
        onSubmit={onSubmit}
        className="bg-card border border-border rounded-xl p-4 sm:p-5 space-y-3 mb-6"
      >
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
            {own ? "Sua avaliação" : "Deixe sua avaliação"}
          </label>
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((n) => {
              const active = (hover || rating) >= n;
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRating(n)}
                  onMouseEnter={() => setHover(n)}
                  onMouseLeave={() => setHover(0)}
                  aria-label={`${n} estrela${n > 1 ? "s" : ""}`}
                  className="p-1 hover:scale-110 transition-transform"
                >
                  <Star
                    className={cn(
                      "h-7 w-7",
                      active ? "fill-yellow-500 text-yellow-500" : "text-muted-foreground",
                    )}
                  />
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
            Comentário (opcional)
          </label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
            maxLength={800}
            placeholder="Conte o que achou do produto..."
            className="w-full bg-input text-foreground rounded-md p-3 border border-border focus:outline-none focus:border-primary text-sm"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!user && (
            <Link
              to="/auth"
              className="inline-flex items-center justify-center px-4 py-2.5 rounded-md bg-primary text-primary-foreground text-sm font-bold uppercase tracking-wider hover:opacity-90"
            >
              Entrar para avaliar
            </Link>
          )}
          {user && (
            <>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center justify-center px-4 py-2.5 rounded-md bg-primary text-primary-foreground text-sm font-bold uppercase tracking-wider hover:opacity-90 disabled:opacity-50"
              >
                {saving ? "Enviando..." : own ? "Atualizar avaliação" : "Enviar avaliação"}
              </button>
              {own && (
                <button
                  type="button"
                  onClick={onDelete}
                  className="inline-flex items-center justify-center px-4 py-2.5 rounded-md bg-secondary text-foreground text-sm font-semibold hover:bg-muted"
                >
                  Remover
                </button>
              )}
            </>
          )}
        </div>
      </form>

      {/* Lista */}
      {reviews.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma avaliação ainda.</p>
      ) : (
        <ul className="space-y-4">
          {reviews.map((r) => (
            <li key={r.id} className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center justify-between mb-1.5">
                <StarRating value={r.rating} size={16} />
                <span className="text-xs text-muted-foreground">{timeAgo(r.created_at)}</span>
              </div>
              {r.comment && <p className="text-sm text-foreground/90 whitespace-pre-line">{r.comment}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
