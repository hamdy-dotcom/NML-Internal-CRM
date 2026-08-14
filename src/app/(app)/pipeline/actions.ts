"use server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { MerchantStage } from "@/lib/database.types";

export async function moveMerchantStage(
  merchantId: string,
  newStage: MerchantStage,
): Promise<{ error?: string }> {
  const supabase = await createClient();

  // Build the timestamp field to set based on new stage
  const timestampField: Partial<Record<MerchantStage, string>> = {
    assigned:      "assigned_at",
    contacted:     "first_contact_at",
    interested:    "interested_at",
    form_sent:     "form_sent_at",
    cta_completed: "cta_completed_at",
  };
  const tsField = timestampField[newStage];
  const update: Record<string, string> = { stage: newStage };
  if (tsField) update[tsField] = new Date().toISOString();

  const { error } = await supabase
    .from("merchants")
    .update(update)
    .eq("id", merchantId);

  if (error) return { error: error.message };
  revalidatePath("/pipeline");
  return {};
}

export async function setNextAction(
  merchantId: string,
  nextActionAt: string,
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("merchants")
    .update({ next_action_at: nextActionAt })
    .eq("id", merchantId);
  if (error) return { error: error.message };
  revalidatePath("/pipeline");
  return {};
}
