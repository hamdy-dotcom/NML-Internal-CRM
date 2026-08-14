"use server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { StepStatus, MerchantStage } from "@/lib/database.types";

export async function updateStepStatus(
  stepId: string,
  status: StepStatus,
  blockedReason?: string,
) {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const builder = supabase.from("merchant_onboarding_steps") as any;
  const patch: Record<string, unknown> = { status };
  if (status === "done") patch.completed_at = new Date().toISOString();
  if (status === "blocked" && blockedReason) patch.blocked_reason = blockedReason;
  const { error } = await builder.update(patch).eq("id", stepId);
  if (error) throw new Error((error as { message: string }).message);
  revalidatePath("/onboarding");
}

export async function activateMerchant(merchantId: string) {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const builder = supabase.from("merchants") as any;
  const patch: { stage: MerchantStage; activated_at: string } = {
    stage: "active",
    activated_at: new Date().toISOString(),
  };
  const { error } = await builder.update(patch).eq("id", merchantId);
  if (error) throw new Error((error as { message: string }).message);
  revalidatePath("/onboarding");
  revalidatePath("/");
}

export async function completeStep(stepId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const builder = supabase.from("merchant_onboarding_steps") as any;
  const { error } = await builder.update({
    status:       "done" as StepStatus,
    completed_at: new Date().toISOString(),
    completed_by: user?.id ?? null,
  }).eq("id", stepId);
  if (error) throw new Error((error as { message: string }).message);
  revalidatePath("/onboarding");
}

export async function reassignStepOwner(stepId: string, ownerId: string) {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const builder = supabase.from("merchant_onboarding_steps") as any;
  const { error } = await builder.update({ owner_id: ownerId }).eq("id", stepId);
  if (error) throw new Error((error as { message: string }).message);
  revalidatePath("/onboarding");
}
