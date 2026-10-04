import Link from "next/link";
import { notFound } from "next/navigation";
import { HERO_WORKOUTS, type HeroResult } from "@/lib/heroes";
import { createClient } from "@/lib/supabase/server";
import { HeroResultLog } from "@/components/HeroResultLog";

export default async function HeroPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { slug } = await params,
    workout = HERO_WORKOUTS.find((w) => w.slug === slug);
  if (!workout) notFound();
  const supabase = await createClient(),
    {
      data: { user },
    } = await supabase.auth.getUser();
  const requested = Number((await searchParams).page || "1");
  const page =
    Number.isInteger(requested) && requested > 0 && requested <= 100000
      ? requested
      : 1;
  let hasNext = false,
    bestRx: HeroResult | null = null;
  let results: HeroResult[] = [],
    historyError = false;
  if (user) {
    const { data, error } = await supabase
      .from("hero_results")
      .select(
        "id,workout_slug,performed_on,is_rx,completion_time_seconds,rounds,extra_reps,notes,created_at",
      )
      .eq("user_id", user.id)
      .eq("workout_slug", slug)
      .order("performed_on", { ascending: false })
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range((page - 1) * 30, page * 30);
    hasNext = (data?.length ?? 0) > 30;
    results = (data ?? []).slice(0, 30);
    let bestQuery = supabase
      .from("hero_results")
      .select(
        "id,workout_slug,performed_on,is_rx,completion_time_seconds,rounds,extra_reps,notes,created_at",
      )
      .eq("user_id", user.id)
      .eq("workout_slug", slug)
      .eq("is_rx", true);
    bestQuery =
      workout.score_type === "for_time"
        ? bestQuery.order("completion_time_seconds", { ascending: true })
        : bestQuery
            .order("rounds", { ascending: false })
            .order("extra_reps", { ascending: false });
    const best = await bestQuery.limit(1).maybeSingle();
    bestRx = best.data;
    historyError = Boolean(error || best.error);
  }
  let timezone = "America/New_York";
  if (user) {
    const { data } = await supabase
      .from("badge_settings")
      .select("timezone")
      .eq("user_id", user.id)
      .maybeSingle();
    timezone = data?.timezone ?? timezone;
  }
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  const today = `${part("year")}-${part("month")}-${part("day")}`;
  return (
    <div className="space-y-6">
      <Link href="/heroes" className="text-orange-400">
        ← Hero WOD library
      </Link>
      <div>
        <h1 className="text-3xl font-bold">{workout.name}</h1>
        <p className="mt-2 text-zinc-400">In honor of {workout.honoree}</p>
      </div>
      <section className="space-y-4 rounded-xl border border-zinc-800 p-5">
        <h2 className="text-xl font-semibold">
          {workout.score_type === "amrap"
            ? `${workout.minutes}-minute AMRAP`
            : "For time"}
        </h2>
        {workout.instructions.map((line) => (
          <p key={line}>{line}</p>
        ))}
        <p>
          <strong>Prescribed loading (Rx): </strong>
          {workout.rx}
        </p>
        <p className="text-sm text-zinc-400">
          Equipment: {workout.equipment.join(" · ")}
        </p>
        <p className="text-sm text-zinc-400">
          Barbell loads include the bar and all plates. Use a scaled load or
          movement variation suited to your current ability and record those
          changes with your score.
        </p>
        <a
          href={workout.source}
          target="_blank"
          rel="noreferrer"
          className="inline-block text-orange-400 underline"
        >
          Workout source and honoree details
        </a>
      </section>
      {user ? (
        <>
          {historyError && (
            <p role="alert" className="text-red-400">
              Your Hero history could not be loaded. Refresh before logging
              again. Check that the Hero WOD database migration has been
              applied.
            </p>
          )}
          <HeroResultLog
            workout={workout}
            results={results}
            disabled={historyError}
            today={today}
            bestRx={bestRx}
          />
          {!historyError && (
            <nav
              aria-label="Hero score history pages"
              className="flex justify-between gap-4 text-orange-400"
            >
              {page > 1 ? (
                <Link href={`/heroes/${slug}?page=${page - 1}`}>
                  ← Newer attempts
                </Link>
              ) : (
                <span />
              )}
              {hasNext && (
                <Link href={`/heroes/${slug}?page=${page + 1}`}>
                  Older attempts →
                </Link>
              )}
            </nav>
          )}
        </>
      ) : (
        <p>
          <Link
            href={`/auth/login?next=${encodeURIComponent(`/heroes/${slug}`)}`}
            className="text-orange-400 underline"
          >
            Log in
          </Link>{" "}
          to save private scores and compare your repeat attempts.
        </p>
      )}
    </div>
  );
}
