import type { ReactNode } from "react";
import { requireStaff } from "@/lib/staff-access";
export default async function Layout({children}:{children:ReactNode}){await requireStaff();return children;}
