"use client";
import { useTransition } from "react";
import { setDefaultTemplate } from "./actions";
import { toast } from "sonner";

export default function SetDefaultButton({ templateId }: { templateId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      disabled={pending}
      className="pill ghost"
      style={{ fontSize: 12 }}
      onClick={() => startTransition(async () => {
        const res = await setDefaultTemplate(templateId);
        if (res?.error) toast.error(res.error);
        else { toast.success("Default template updated"); window.location.reload(); }
      })}
    >
      Set as default
    </button>
  );
}
