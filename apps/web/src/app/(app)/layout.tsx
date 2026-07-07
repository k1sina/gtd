import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Providers } from "@/components/providers";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <Providers>
      <AppShell
        userEmail={user.email ?? ""}
        displayName={(user.user_metadata?.display_name as string) ?? ""}
      >
        {children}
      </AppShell>
    </Providers>
  );
}
