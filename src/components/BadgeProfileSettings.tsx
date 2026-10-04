"use client";
import { reportAppError } from "@/lib/report-error";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
const COMMON_TIMEZONES = [
  { value: "America/New_York", label: "Eastern Time  -  New York" },
  { value: "America/Chicago", label: "Central Time  -  Chicago" },
  { value: "America/Denver", label: "Mountain Time  -  Denver" },
  { value: "America/Phoenix", label: "Arizona  -  Phoenix (no daylight saving)" },
  { value: "America/Los_Angeles", label: "Pacific Time  -  Los Angeles" },
  { value: "America/Anchorage", label: "Alaska  -  Anchorage" },
  {
    value: "Pacific/Honolulu",
    label: "Hawaii  -  Honolulu (no daylight saving)",
  },
  { value: "UTC", label: "UTC" },
];
export function BadgeProfileSettings({
  displayName,
  settings,
}: {
  displayName: string;
  settings: {
    timezone: string;
    workout_days: number[];
    schedule_configured: boolean;
  } | null;
}) {
  const [otherZones, setOtherZones] = useState<string[]>([]);
  useEffect(() => {
    const supported = (
      Intl as typeof Intl & { supportedValuesOf?: (key: string) => string[] }
    ).supportedValuesOf;
    if (supported)
      setOtherZones(
        supported("timeZone").filter(
          (z) => !COMMON_TIMEZONES.some((c) => c.value === z),
        ),
      );
  }, []);
  const [name, setName] = useState(displayName);
  const [timezone, setTimezone] = useState(
    settings?.timezone || "America/New_York",
  );
  useEffect(() => {
    if (!settings)
      setTimezone(
        Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York",
      );
  }, [settings]);
  const [days, setDays] = useState<number[]>(
    settings?.workout_days || [1, 2, 3, 4, 5],
  );
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const router = useRouter(),
    field = "mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 p-3";
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setMessage("");
        try {
          const { error } = await createClient().rpc("save_badge_profile", {
            p_display_name: name,
            p_timezone: timezone,
            p_workout_days: days,
          });
          if (error) throw error;
          setMessage("Profile saved. Your rest-day schedule starts tomorrow.");
          router.refresh();
        } catch (e) {
          void reportAppError(e);
          setMessage(
            e && typeof e === "object" && "message" in e
              ? String(e.message)
              : "Could not save profile.",
          );
        } finally {
          setBusy(false);
        }
      }}
      className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/50 p-5"
    >
      <h2 className="text-lg font-semibold">Profile & training schedule</h2>
      <label className="block text-sm">
        Display name
        <input
          required
          maxLength={100}
          className={field}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label className="block text-sm">
        Timezone
        <select
          required
          className={field}
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
        >
          <optgroup label="Common timezones">
            {COMMON_TIMEZONES.map((z) => (
              <option key={z.value} value={z.value}>
                {z.label}
              </option>
            ))}
          </optgroup>
          {!COMMON_TIMEZONES.some((z) => z.value === timezone) &&
            !otherZones.includes(timezone) && (
              <option value={timezone}>{timezone.replaceAll("_", " ")}</option>
            )}
          {otherZones.length > 0 && (
            <optgroup label="Other regions">
              {otherZones.map((z) => (
                <option key={z} value={z}>
                  {z.replaceAll("_", " ")}
                </option>
              ))}
            </optgroup>
          )}
        </select>
        <p className="mt-2 text-xs text-zinc-400">
          Used for your local day boundary and time-based badges. Initially
          detected from your device; saved region settings handle daylight
          saving automatically.
        </p>
      </label>
      <fieldset>
        <legend className="mb-2 text-sm">Your usual training days</legend>
        <div className="flex flex-wrap gap-2">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day, n) => (
            <label
              className={`flex items-center gap-2 rounded-lg border p-2 text-sm ${days.includes(n) ? "border-orange-500" : "border-zinc-700"}`}
              key={day}
            >
              <input
                type="checkbox"
                checked={days.includes(n)}
                onChange={(e) =>
                  setDays(
                    e.target.checked
                      ? [...days, n].sort()
                      : days.filter((d) => d !== n),
                  )
                }
              />
              {day}
            </label>
          ))}
        </div>
      </fieldset>
      <p className="text-xs text-zinc-400">
        Unchecked days are scheduled rests: no login required to protect your
        streak. Choose at least one training day. Schedule changes start
        tomorrow and do not erase earlier missed days.
      </p>
      <button
        disabled={busy || !days.length}
        className="rounded-lg bg-orange-600 px-4 py-2 disabled:opacity-40"
      >
        {busy ? "Saving…" : "Save profile & schedule"}
      </button>
      {message && (
        <p role="status" className="text-sm text-orange-300">
          {message}
        </p>
      )}
    </form>
  );
}
