export type BetaAthlete = {
  user_id: string;
  display_name: string;
  registered_at: string;
  last_sign_in_at: string | null;
  last_active: string | null;
  visits: number;
  active_days: number;
  page_views: number;
  completed_workouts: number;
  hero_attempts: number;
  prs_logged: number;
  feedback_count: number;
  error_count: number;
  plans: string[];
};
export type BetaEvent = {
  category: string;
  label: string;
  page_path: string | null;
  occurred_at: string;
};
export type FeedbackNotice = { id: string; kind: string; title: string; created_at: string };
export type FeedbackSummary = { bugs: number; suggestions: number; total: number; reports: FeedbackNotice[] };

// Never send query strings, recovery tokens, or user-entered content to analytics.
export function betaPagePath(pathname: string): string | null {
  const path = pathname.split(/[?#]/)[0];
  if (/^\/auth(?:\/|$)/.test(path) || /^\/api(?:\/|$)/.test(path)) return null;
  if (["/", "/dashboard", "/plans", "/profile", "/heroes", "/feedback", "/badges", "/workouts", "/leaderboard", "/exercises", "/help", "/faq"].includes(path)) return path;
  if (/^\/plans\/[0-9a-f-]{36}(?:\/overview)?$/i.test(path)) return path;
  if (/^\/workouts\/[0-9a-f-]{36}$/i.test(path)) return path;
  if (/^\/heroes\/[a-z0-9-]{1,100}$/.test(path)) return path;
  if (/^\/admin(?:\/[a-z-]{1,50})?$/.test(path)) return path;
  return null;
}

export function activityDays(value?: string): number {
  return value === "7" ? 7 : value === "90" ? 90 : 30;
}
