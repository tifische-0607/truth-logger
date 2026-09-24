import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Translates the given items plus their comments/replies that have no English yet.
export const translateItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { itemId: string; includeChildren?: boolean }) => {
    if (!data?.itemId) throw new Error("itemId is required");
    return { itemId: String(data.itemId), includeChildren: data.includeChildren !== false };
  })
  .handler(async ({ data, context }) => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("AI is not configured for this project.");
    const { translateRows, MACHINE_TRANSLATION_STATEMENT } = await import("./translate.server");
    const sb = context.supabase;

    const ids = [data.itemId];
    if (data.includeChildren) {
      let frontier = [data.itemId];
      while (frontier.length) {
        const { data: kids, error } = await sb.from("items").select("id").in("parent_item_id", frontier);
        if (error) throw error;
        frontier = (kids ?? []).map((k) => k.id).filter((id) => !ids.includes(id));
        ids.push(...frontier);
      }
    }
    const { data: rows, error } = await sb
      .from("items")
      .select("id, text_original, text_en")
      .in("id", ids)
      .not("text_original", "is", null);
    if (error) throw error;
    const todo = (rows ?? [])
      .filter((r) => !r.text_en && r.text_original?.trim())
      .map((r) => ({ id: r.id, text: r.text_original as string }));
    if (!todo.length) return { translated: 0 };

    const map = await translateRows(todo, apiKey);
    let translated = 0;
    for (const [id, english] of map) {
      const { error: uErr } = await sb
        .from("items")
        .update({ text_en: english, translator_statement: MACHINE_TRANSLATION_STATEMENT })
        .eq("id", id)
        .is("text_en", null);
      if (!uErr) translated++;
    }
    return { translated };
  });
