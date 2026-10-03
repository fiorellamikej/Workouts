export const BADGES = [
  {
    key: "first_login",
    title: "First Login",
    description: "Open Sword and Shield while signed in.",
  },
  {
    key: "profile_complete",
    title: "Profile Complete",
    description: "Save your display name, timezone, and training days.",
  },
  {
    key: "anniversary",
    title: "Annual Anniversary",
    description:
      "Celebrate a full year since account signup. Your year count increases annually.",
  },
  {
    key: "bench",
    title: "Bench PR Logged",
    description: "Log a bench press record in your profile.",
  },
  {
    key: "squat",
    title: "Squat PR Logged",
    description: "Log a back squat record in your profile.",
  },
  {
    key: "deadlift",
    title: "Deadlift PR Logged",
    description: "Log a deadlift record in your profile.",
  },
  {
    key: "big_three",
    title: "Big Three Club",
    description: "Have bench, squat, and deadlift records logged.",
  },
  {
    key: "comeback",
    title: "Comeback",
    description:
      "Beat your previous best in the same exercise after at least six months since its last recorded achievement.",
  },
  {
    key: "early_bird",
    title: "Early Bird",
    description:
      "Open the app while signed in before 6 a.m. in your saved timezone.",
  },
  {
    key: "founding_member",
    title: "Founding Member",
    description:
      "Be one of the first 100 accounts by signup order. Deleted places are never reassigned.",
  },
  {
    key: "night_owl",
    title: "Night Owl",
    description:
      "Open the app while signed in after 9 p.m. in your saved timezone.",
  },
  {
    key: "weekend_warrior",
    title: "Weekend Warrior",
    description: "Open the app while signed in on Saturday or Sunday.",
  },
  {
    key: "weekly_streak",
    title: "Weekly Streak",
    description:
      "Check in on every training day across seven consecutive calendar days. Scheduled rests are protected without opening the app.",
  },
] as const;
export type BadgeAward = {
  badge_key: string;
  earned_at: string;
  level: number;
};
export type BadgeSummary = {
  checkin_streak: number;
  calendar_span: number;
  completed_workouts: number;
  timezone: string;
  badges: BadgeAward[];
};
