"use client";

import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { use, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

/** Invite acceptance: signed-in users join the space and land in it. */
export default function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const router = useRouter();
  const [state, setState] = useState<"working" | "done" | "error">("working");
  const [message, setMessage] = useState("Joining the space…");
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace(`/login?next=/invite/${token}`);
        return;
      }
      const { data: spaceId, error } = await supabase.rpc(
        "accept_space_invite",
        { invite_token: token }
      );
      if (error) {
        setState("error");
        setMessage(
          error.message.includes("not found")
            ? "This invite link is invalid or was already used."
            : error.message
        );
        return;
      }
      localStorage.setItem("clarity.currentSpaceId", spaceId as string);
      setState("done");
      setMessage("You're in! Taking you to the shared space…");
      setTimeout(() => {
        router.replace("/today");
        router.refresh();
      }, 900);
    })();
  }, [token, router]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
      {state === "working" && (
        <Loader2 size={28} className="animate-spin text-accent" />
      )}
      {state === "done" && <CheckCircle2 size={28} className="text-emerald-500" />}
      {state === "error" && <XCircle size={28} className="text-red-500" />}
      <p className="text-sm text-ink-soft">{message}</p>
      {state === "error" && (
        <Button onClick={() => router.push("/today")}>Go to the app</Button>
      )}
    </main>
  );
}
