import type { ReactNode } from "react";
import { requireAdmin } from "@/lib/admin-access";
import { AdminFeedbackAlerts } from "@/components/AdminFeedbackAlerts";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireAdmin();
  return <div className="space-y-6"><AdminFeedbackAlerts />{children}</div>;
}
