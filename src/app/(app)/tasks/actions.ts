"use server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { MerchantPriority } from "@/lib/database.types";

export async function createTask(task: {
  title: string;
  description?: string | null;
  assignee_id?: string | null;
  due_at?: string | null;
  priority: MerchantPriority;
  merchant_id?: string | null;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from("tasks") as any).insert({
    ...task,
    created_by: user?.id ?? null,
    status: "open",
  });
  if (error) throw new Error((error as { message: string }).message);
  revalidatePath("/tasks");
}

export async function completeTask(taskId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from("tasks") as any).update({
    status:       "done",
    completed_at: new Date().toISOString(),
    completed_by: user?.id ?? null,
  }).eq("id", taskId);
  if (error) throw new Error((error as { message: string }).message);
  revalidatePath("/tasks");
}

export async function deleteTask(taskId: string) {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from("tasks") as any).delete().eq("id", taskId);
  if (error) throw new Error((error as { message: string }).message);
  revalidatePath("/tasks");
}
