"use server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function bulkAssignManual(merchantIds: string[], specialistId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("merchants")
    .update({
      acquisition_owner_id: specialistId,
      stage: "assigned",
      assigned_at: new Date().toISOString(),
    })
    .in("id", merchantIds);
  if (error) throw new Error(error.message);
  revalidatePath("/leads");
}

export async function bulkAssignRoundRobin(merchantIds: string[], specialistIds: string[]) {
  if (specialistIds.length === 0) throw new Error("No specialists selected");
  const supabase = await createClient();
  const now = new Date().toISOString();
  for (let i = 0; i < merchantIds.length; i++) {
    const { error } = await supabase
      .from("merchants")
      .update({
        acquisition_owner_id: specialistIds[i % specialistIds.length],
        stage: "assigned",
        assigned_at: now,
      })
      .eq("id", merchantIds[i]);
    if (error) throw new Error(error.message);
  }
  revalidatePath("/leads");
}

export async function bulkAssignByCity(merchantIds: string[], cityMap: Record<string, string>) {
  const supabase = await createClient();
  const { data: merchants, error: fetchError } = await supabase
    .from("merchants")
    .select("id, city")
    .in("id", merchantIds);
  if (fetchError) throw new Error(fetchError.message);

  const now = new Date().toISOString();
  for (const m of merchants ?? []) {
    const specialistId = m.city ? cityMap[m.city] : undefined;
    if (!specialistId) continue;
    const { error } = await supabase
      .from("merchants")
      .update({
        acquisition_owner_id: specialistId,
        stage: "assigned",
        assigned_at: now,
      })
      .eq("id", m.id);
    if (error) throw new Error(error.message);
  }
  revalidatePath("/leads");
}
