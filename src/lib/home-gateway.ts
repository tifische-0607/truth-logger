import { supabase } from "@/integrations/supabase/client";

/** The enabled Home Vault (DarkNight) gateway address plus the signed-in bearer. Nothing else is read or stored. */
export async function homeGateway(): Promise<{ url: string | null; token: string }> {
  const { data } = await supabase.from("sources").select("gateway_url,enabled").eq("kind", "home_vault").eq("enabled", true).limit(1).maybeSingle();
  const { data: { session } } = await supabase.auth.getSession();
  return { url: data?.gateway_url ?? null, token: session?.access_token ?? "" };
}

export const errText = (e: unknown) => (e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : String(e));
