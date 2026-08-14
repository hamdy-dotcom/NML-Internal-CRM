"use client";
import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import type { Task, MerchantPriority, TaskStatus } from "@/lib/database.types";
import { PRIORITY_LABELS, fmtDate, isOverdue } from "@/lib/utils";
import EmptyState from "@/components/ui/EmptyState";
import SkeletonRows from "@/components/ui/SkeletonRows";
import Modal from "@/components/ui/Modal";
import UserPicker from "@/components/ui/UserPicker";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { createTask, completeTask, deleteTask } from "./actions";

type Tab = "my_open" | "overdue" | "done" | "team";

interface TaskRow extends Task {
  assignee_name: string | null;
  merchant_name: string | null;
}

interface Props {
  currentUserId: string;
  isManager: boolean;
}

const PRIORITY_BADGE: Record<MerchantPriority, string> = {
  high:   "badge badge-red",
  medium: "badge badge-amber",
  low:    "badge badge-ghost",
};

const TABS: { key: Tab; label: string; manager?: boolean }[] = [
  { key: "my_open", label: "My open" },
  { key: "overdue", label: "Overdue" },
  { key: "done",    label: "Done" },
  { key: "team",    label: "Team", manager: true },
];

interface NewTask {
  title: string;
  description: string;
  assignee_id: string | null;
  due_at: string;
  priority: MerchantPriority;
  merchant_search: string;
  merchant_id: string | null;
}

const DEFAULT_TASK: NewTask = {
  title: "", description: "", assignee_id: null,
  due_at: "", priority: "medium",
  merchant_search: "", merchant_id: null,
};

export default function TasksList({ currentUserId, isManager }: Props) {
  const supabase = createClient();

  const [tab,         setTab]         = useState<Tab>("my_open");
  const [tasks,       setTasks]       = useState<TaskRow[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const [form,        setForm]        = useState<NewTask>(DEFAULT_TASK);
  const [submitting,  setSubmitting]  = useState(false);
  const [deleteId,    setDeleteId]    = useState<string | null>(null);
  const [deleting,    setDeleting]    = useState(false);
  const [completing,  setCompleting]  = useState<string | null>(null);

  // Filters
  const [filterAssignee, setFilterAssignee] = useState<string | null>(null);
  const [filterDueFrom,  setFilterDueFrom]  = useState("");
  const [filterDueTo,    setFilterDueTo]    = useState("");
  const [filterPriority, setFilterPriority] = useState<MerchantPriority | "">("");
  const [filterMerchant, setFilterMerchant] = useState("");

  // Merchant search for new-task form
  const [merchantResults, setMerchantResults] = useState<{ id: string; store_name: string }[]>([]);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (supabase.from("tasks") as any).select(
        "id, title, description, status, priority, due_at, completed_at, assignee_id, merchant_id, created_by, created_at, updated_at",
      );

      if (tab === "my_open") {
        q = q.eq("assignee_id", currentUserId).eq("status", "open");
      } else if (tab === "overdue") {
        q = q.eq("assignee_id", currentUserId).eq("status", "open").lt("due_at", new Date().toISOString());
      } else if (tab === "done") {
        q = q.eq("assignee_id", currentUserId).eq("status", "done");
      } else {
        q = q.in("status", ["open", "done"]);
      }

      if (filterAssignee)        q = q.eq("assignee_id", filterAssignee);
      if (filterPriority)        q = q.eq("priority", filterPriority);
      if (filterDueFrom)         q = q.gte("due_at", filterDueFrom);
      if (filterDueTo)           q = q.lte("due_at", filterDueTo + "T23:59:59");

      if (filterMerchant.trim()) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: ms } = await (supabase.from("merchants") as any)
          .select("id").ilike("store_name", `%${filterMerchant}%`).limit(50);
        const ids = (ms ?? []).map((m: { id: string }) => m.id);
        if (ids.length) q = q.in("merchant_id", ids);
        else { setTasks([]); setLoading(false); return; }
      }

      q = q.order("due_at", { ascending: true, nullsFirst: false }).limit(300);
      const { data: rawTasks, error } = await q;
      if (error) { toast.error((error as { message: string }).message); return; }

      const taskList = (rawTasks ?? []) as Task[];
      if (!taskList.length) { setTasks([]); return; }

      // Fetch assignee names
      const assigneeIds = [...new Set(taskList.map((t) => t.assignee_id).filter(Boolean))] as string[];
      const assigneeMap: Record<string, string> = {};
      if (assigneeIds.length) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: profiles } = await (supabase.from("profiles") as any)
          .select("id, full_name").in("id", assigneeIds);
        for (const p of (profiles ?? []) as { id: string; full_name: string | null }[]) {
          if (p.full_name) assigneeMap[p.id] = p.full_name;
        }
      }

      // Fetch merchant names
      const merchantIds = [...new Set(taskList.map((t) => t.merchant_id).filter(Boolean))] as string[];
      const merchantMap: Record<string, string> = {};
      if (merchantIds.length) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: merchants } = await (supabase.from("merchants") as any)
          .select("id, store_name").in("id", merchantIds);
        for (const m of (merchants ?? []) as { id: string; store_name: string }[]) {
          merchantMap[m.id] = m.store_name;
        }
      }

      const rows: TaskRow[] = taskList.map((t) => ({
        ...t,
        assignee_name: t.assignee_id ? (assigneeMap[t.assignee_id] ?? null) : null,
        merchant_name: t.merchant_id ? (merchantMap[t.merchant_id] ?? null) : null,
      }));

      setTasks(rows);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, filterAssignee, filterPriority, filterDueFrom, filterDueTo, filterMerchant]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  const handleComplete = async (taskId: string) => {
    setCompleting(taskId);
    try {
      await completeTask(taskId);
      toast.success("Task completed");
      fetchTasks();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setCompleting(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await deleteTask(deleteId);
      toast.success("Task deleted");
      setDeleteId(null);
      fetchTasks();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setDeleting(false);
    }
  };

  const handleSubmit = async () => {
    if (!form.title.trim()) { toast.error("Title is required"); return; }
    setSubmitting(true);
    try {
      await createTask({
        title:       form.title.trim(),
        description: form.description.trim() || null,
        assignee_id: form.assignee_id,
        due_at:      form.due_at || null,
        priority:    form.priority,
        merchant_id: form.merchant_id,
      });
      toast.success("Task created");
      setForm(DEFAULT_TASK);
      setMerchantResults([]);
      setNewTaskOpen(false);
      fetchTasks();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const searchMerchants = async (q: string) => {
    if (!q.trim()) { setMerchantResults([]); return; }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase.from("merchants") as any).select("id, store_name").ilike("store_name", `%${q}%`).limit(8);
    setMerchantResults((data ?? []) as { id: string; store_name: string }[]);
  };

  const clearFilters = () => {
    setFilterAssignee(null);
    setFilterMerchant("");
    setFilterPriority("");
    setFilterDueFrom("");
    setFilterDueTo("");
  };

  const hasFilters = filterAssignee || filterMerchant || filterPriority || filterDueFrom || filterDueTo;
  const visibleTabs = TABS.filter((t) => !t.manager || isManager);

  return (
    <div style={{ paddingTop: 16 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <h1 style={{ fontSize: 17, fontWeight: 500, margin: 0, color: "var(--ink)" }}>Tasks</h1>
        <button className="pill dark" onClick={() => setNewTaskOpen(true)}>+ New task</button>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
        {visibleTabs.map((t) => (
          <button key={t.key} className={`pill${tab === t.key ? " active" : ""}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
        {isManager && tab === "team" && (
          <div style={{ minWidth: 180 }}>
            <UserPicker value={filterAssignee} onChange={setFilterAssignee} placeholder="Any assignee" />
          </div>
        )}
        <input className="field" style={{ maxWidth: 180 }} placeholder="Merchant search…"
          value={filterMerchant} onChange={(e) => setFilterMerchant(e.target.value)} />
        <select className="field" style={{ maxWidth: 140 }} value={filterPriority}
          onChange={(e) => setFilterPriority(e.target.value as MerchantPriority | "")}>
          <option value="">Any priority</option>
          {(Object.entries(PRIORITY_LABELS) as [MerchantPriority, string][]).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <input className="field" type="date" style={{ maxWidth: 150 }} value={filterDueFrom}
          onChange={(e) => setFilterDueFrom(e.target.value)} />
        <input className="field" type="date" style={{ maxWidth: 150 }} value={filterDueTo}
          onChange={(e) => setFilterDueTo(e.target.value)} />
        {hasFilters && (
          <button className="pill ghost" onClick={clearFilters}>Clear</button>
        )}
      </div>

      {/* Table */}
      <div style={{ overflowX: "auto" }}>
        <table className="nml-table">
          <thead>
            <tr>
              <th style={{ width: 32 }}></th>
              <th>Title</th>
              <th>Merchant</th>
              <th>Assignee</th>
              <th>Due</th>
              <th>Priority</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <SkeletonRows cols={8} rows={10} />
            ) : tasks.length === 0 ? (
              <tr>
                <td colSpan={8}>
                  <EmptyState
                    icon="📋"
                    title="No tasks"
                    description="Nothing here yet."
                    action={<button className="pill dark" onClick={() => setNewTaskOpen(true)}>Create task</button>}
                  />
                </td>
              </tr>
            ) : tasks.map((t) => {
              const overdue = t.status === "open" && isOverdue(t.due_at);
              return (
                <tr key={t.id} className={overdue ? "warn" : t.status === "done" ? "good" : undefined}>
                  <td>
                    {t.status === "open" ? (
                      <input type="checkbox" title="Mark done" disabled={completing === t.id}
                        onChange={() => handleComplete(t.id)} />
                    ) : (
                      <span style={{ fontSize: 14, color: "var(--green)" }}>✓</span>
                    )}
                  </td>
                  <td style={{ maxWidth: 260 }}>
                    <div className="ellipsis" style={{ fontWeight: 500 }}>{t.title}</div>
                    {t.description && <div className="sub ellipsis">{t.description}</div>}
                  </td>
                  <td>
                    {t.merchant_id && t.merchant_name ? (
                      <a href={`/merchants/${t.merchant_id}`} style={{ color: "var(--blue)", textDecoration: "none", fontSize: 12.5 }}>
                        {t.merchant_name}
                      </a>
                    ) : (
                      <span className="sub">—</span>
                    )}
                  </td>
                  <td>
                    <span style={{ fontSize: 12.5 }}>
                      {t.assignee_name ?? <span className="sub awaiting">Unassigned</span>}
                    </span>
                  </td>
                  <td>
                    {t.status === "done" && t.completed_at ? (
                      <span className="sub">{fmtDate(t.completed_at)}</span>
                    ) : t.due_at ? (
                      <span style={{ fontSize: 12.5, color: overdue ? "var(--red)" : "var(--ink-2)" }}>
                        {fmtDate(t.due_at)}
                      </span>
                    ) : (
                      <span className="sub">—</span>
                    )}
                  </td>
                  <td><span className={PRIORITY_BADGE[t.priority]}>{PRIORITY_LABELS[t.priority]}</span></td>
                  <td>
                    <span className={t.status === "done" ? "badge badge-green" : overdue ? "badge badge-red" : "badge badge-ghost"}>
                      {t.status === "done" ? "Done" : overdue ? "Overdue" : "Open"}
                    </span>
                  </td>
                  <td>
                    <button onClick={() => setDeleteId(t.id)}
                      style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "var(--ink-4)", padding: "2px 4px" }}
                      title="Delete">×</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* New task modal */}
      <Modal open={newTaskOpen} onClose={() => { setNewTaskOpen(false); setForm(DEFAULT_TASK); setMerchantResults([]); }} title="New task" wide>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label className="field-label">Title *</label>
            <input className="field" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Task title…" />
          </div>
          <div>
            <label className="field-label">Description</label>
            <textarea className="field" rows={2} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Optional description…" />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label className="field-label">Assignee</label>
              <UserPicker value={form.assignee_id} onChange={(id) => setForm((f) => ({ ...f, assignee_id: id }))} />
            </div>
            <div>
              <label className="field-label">Priority</label>
              <select className="field" value={form.priority}
                onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value as MerchantPriority }))}>
                {(Object.entries(PRIORITY_LABELS) as [MerchantPriority, string][]).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="field-label">Due date &amp; time</label>
            <input className="field" type="datetime-local" value={form.due_at}
              onChange={(e) => setForm((f) => ({ ...f, due_at: e.target.value }))} />
          </div>
          <div style={{ position: "relative" }}>
            <label className="field-label">Merchant (optional)</label>
            <input
              className="field"
              placeholder="Search merchant…"
              value={form.merchant_id ? form.merchant_search : form.merchant_search}
              onChange={(e) => {
                setForm((f) => ({ ...f, merchant_search: e.target.value, merchant_id: null }));
                searchMerchants(e.target.value);
              }}
            />
            {form.merchant_id && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                <span style={{ fontSize: 12.5, color: "var(--blue)" }}>{form.merchant_search}</span>
                <button onClick={() => setForm((f) => ({ ...f, merchant_id: null, merchant_search: "" }))}
                  style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "var(--ink-3)" }}>×</button>
              </div>
            )}
            {merchantResults.length > 0 && !form.merchant_id && (
              <div className="glass-card" style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 20, marginTop: 4, overflow: "hidden" }}>
                {merchantResults.map((m) => (
                  <div
                    key={m.id}
                    onClick={() => { setForm((f) => ({ ...f, merchant_id: m.id, merchant_search: m.store_name })); setMerchantResults([]); }}
                    style={{ padding: "8px 12px", cursor: "pointer", fontSize: 13, borderBottom: "1px solid var(--g-line)" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,.8)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "")}
                  >
                    {m.store_name}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
            <button className="pill outline" onClick={() => { setNewTaskOpen(false); setForm(DEFAULT_TASK); setMerchantResults([]); }}>Cancel</button>
            <button className="pill dark" onClick={handleSubmit} disabled={submitting}>
              {submitting ? "Creating…" : "Create task"}
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        loading={deleting}
        title="Delete task"
        body="This cannot be undone."
        confirmLabel="Delete"
        danger
      />
    </div>
  );
}
