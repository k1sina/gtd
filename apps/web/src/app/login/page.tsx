import { Suspense } from "react";
import LoginForm from "./login-form";

// The form creates a Supabase client during render, which needs env vars
// that only exist at runtime — the page must not be prerendered at build
// time (it was the only static page in the app).
export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
