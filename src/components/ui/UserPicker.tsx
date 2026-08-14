"use client";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Profile, UserRole } from "@/lib/database.types";

interface Props {
  value: string | null;
  onChange: (id: string | null) => void;
  roles?: UserRole[];
  placeholder?: string;
}

export default function UserPicker({ value, onChange, roles, placeholder = "Select person…" }: Props) {
  const [users, setUsers] = useState<Profile[]>([]);
  const supabase = createClient();

  useEffect(() => {
    let q = supabase.from("profiles").select("*").eq("is_active", true);
    if (roles) q = q.in("role", roles);
    q.order("full_name").then(({ data }) => { if (data) setUsers(data); });
  }, []);

  const selected = users.find(u => u.id === value);

  return (
    <select
      className="field"
      value={value ?? ""}
      onChange={e => onChange(e.target.value || null)}
    >
      <option value="">{placeholder}</option>
      {users.map(u => (
        <option key={u.id} value={u.id}>{u.full_name ?? u.email}</option>
      ))}
    </select>
  );
}
