import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — SpyGlass V2" },
      {
        name: "description",
        content: "Sign in to the private evidence workspace for Facebook capture and custody.",
      },
      { property: "og:title", content: "Sign in — SpyGlass V2" },
      {
        property: "og:description",
        content: "Sign in to the private evidence workspace for Facebook capture and custody.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const signupOpen = useQuery({
    queryKey: ["signup-open"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("signup_open");
      if (error) throw error;
      return Boolean(data);
    },
  });

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) void navigate({ to: "/dashboard", replace: true });
    });
  }, [navigate]);

  useEffect(() => {
    if (signupOpen.data && mode === "signin") setMode("signup");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signupOpen.data]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/dashboard` },
        });
        if (error) throw error;
        toast.success("Owner account created. Check your email if confirmation is required.");
        const { data } = await supabase.auth.getSession();
        if (data.session) void navigate({ to: "/dashboard", replace: true });
        else setMode("signin");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        void navigate({ to: "/dashboard", replace: true });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  const closed = signupOpen.data === false;

  return (
    <div className="bg-sidebar flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-sidebar-foreground mb-8 flex flex-col items-center gap-3 text-center">
          <img src="/app-icon.png" alt="" width={72} height={72} className="rounded-2xl" />
          <h1 className="text-2xl font-bold tracking-tight">SpyGlass V2</h1>
          <p className="text-sidebar-foreground/60 text-sm">
            Evidence capture and chain of custody
          </p>
        </div>

        <div className="panel p-6 md:p-8">
          <form onSubmit={submit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-12 text-base"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-12 text-base"
              />
            </div>
            <Button type="submit" disabled={busy} className="h-12 w-full text-base">
              {busy ? "Working…" : mode === "signup" ? "Create owner account" : "Sign in"}
            </Button>
          </form>

          <div className="text-muted-foreground mt-5 text-center text-sm">
            {signupOpen.isLoading ? null : closed ? (
              <span className="inline-flex items-center gap-2">
                <ShieldCheck className="size-4" /> Sign-ups are closed.
              </span>
            ) : mode === "signup" ? (
              <button className="underline" onClick={() => setMode("signin")}>
                Already have the owner account? Sign in
              </button>
            ) : (
              <button className="underline" onClick={() => setMode("signup")}>
                Claim this workspace as owner
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
