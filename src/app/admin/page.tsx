import { redirect } from "next/navigation";
import { AdminWorkspace } from "@/components/admin/admin-workspace";
import { getCurrentUser } from "@/lib/auth/session";

export default async function AdminPage() {

  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") {
    redirect("/login?error=UNAUTHORIZED_ROLE");
  }

  return (
    <div className="flex-1 flex min-h-dvh w-full bg-neutral-50/30">
      <AdminWorkspace />
    </div>
  );
}
