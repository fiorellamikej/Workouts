export type FeedbackReport = {
  id: string;
  user_id: string;
  kind: string;
  title: string;
  description: string;
  page_path: string;
  status: string;
  created_at: string;
  updated_at: string;
};
export type ErrorEvent = {
  id: string;
  user_id: string;
  source: string;
  page_path: string;
  error_code: string;
  digest: string | null;
  created_at: string;
  resolved_at: string | null;
};
export type Registration = {
  user_id: string;
  email: string | null;
  registered_at: string;
  email_confirmed_at: string | null;
  mailing_opt_in: boolean;
  consent_updated_at: string | null;
};
export function csvCell(value: unknown): string {
  let text = value == null ? "" : String(value);
  if (/^[\s\u0000-\u001f]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text))
    text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}
export const registrationColumns = [
  "user_id",
  "email",
  "registered_at",
  "email_confirmed_at",
  "mailing_opt_in",
  "consent_updated_at",
] as const;
export function registrationCsv(rows: Registration[]) {
  return (
    "\ufeff" +
    [
      registrationColumns.join(","),
      ...rows.map((row) =>
        registrationColumns.map((key) => csvCell(row[key])).join(","),
      ),
    ].join("\r\n") +
    "\r\n"
  );
}
export function safeErrorCode(error: unknown): string {
  const value =
    error && typeof error === "object"
      ? (error as { code?: unknown; name?: unknown })
      : {};
  // Only known technical codes/names, never exception messages or entered data.
  if (
    typeof value.code === "string" &&
    /^(?:[0-9]{5}|PGRST[0-9]{3}|[A-Z_]{2,35})$/.test(value.code)
  )
    return value.code;
  return typeof value.name === "string" &&
    [
      "Error",
      "TypeError",
      "RangeError",
      "ReferenceError",
      "SyntaxError",
      "AbortError",
      "NetworkError",
    ].includes(value.name)
    ? value.name
    : "UnexpectedError";
}
export function safePagePath(path: string): string {
  const clean = path.split(/[?#]/)[0];
  return clean.startsWith("/") && !clean.startsWith("//")
    ? clean.slice(0, 200)
    : "/";
}
