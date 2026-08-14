"use server";
import { adminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

/**
 * Deletes only merchants from this batch that are still in the 'new' stage
 * (i.e. not yet touched after import), then deletes the batch record itself.
 */
export async function undoBatch(batchId: string) {
  const { error: deleteErr } = await adminClient
    .from("merchants")
    .delete()
    .eq("batch_id", batchId)
    .eq("stage", "new");
  if (deleteErr) throw new Error(deleteErr.message);

  await adminClient.from("lead_batches").delete().eq("id", batchId);

  revalidatePath("/leads");
}
