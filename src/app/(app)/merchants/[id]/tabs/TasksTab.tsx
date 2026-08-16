'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import type { Task, Merchant, MerchantPriority } from '@/lib/database.types';
import { fmtDate, isOverdue, PRIORITY_LABELS } from '@/lib/utils';
import Modal from '@/components/ui/Modal';
import UserPicker from '@/components/ui/UserPicker';
import EmptyState from '@/components/ui/EmptyState';
import { createTask, completeTask, reopenTask } from '../actions';

interface Props {
  merchant: Merchant;
  tasks: Task[];
  currentUserId: string | null;
}

export default function TasksTab({ merchant, tasks, currentUserId }: Props) {
  const [newOpen, setNewOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assigneeId, setAssigneeId] = useState<string | null>(currentUserId);
  const [dueAt, setDueAt] = useState('');
  const [priority, setPriority] = useState<MerchantPriority>('medium');
  const [pending, startTransition] = useTransition();

  const open = tasks.filter(t => t.status === 'open');
  const done = tasks.filter(t => t.status === 'done');

  function submit() {
    if (!title.trim()) { toast.error('Title is required.'); return; }
    startTransition(async () => {
      const res = await createTask({
        merchant_id: merchant.id,
        title: title.trim(),
        description: description.trim() || null,
        assignee_id: assigneeId,
        due_at: dueAt || null,
        priority,
      });
      if (res.error) toast.error(res.error);
      else {
        toast.success('Task created.');
        setTitle(''); setDescription(''); setDueAt('');
        setAssigneeId(currentUserId);
        setPriority('medium');
        setNewOpen(false);
      }
    });
  }

  function TaskRow({ task, showComplete = true }: { task: Task; showComplete?: boolean }) {
    const overdue = isOverdue(task.due_at) && task.status === 'open';
    return (
      <div
        className="glass-card"
        style={{ padding: '12px 14px', display: 'flex', alignItems: 'flex-start', gap: 10 }}
      >
        {/* Complete checkbox */}
        <input
          type="checkbox"
          checked={task.status === 'done'}
          style={{ marginTop: 2, cursor: 'pointer' }}
          onChange={() => {
            startTransition(async () => {
              const res = task.status === 'open'
                ? await completeTask(task.id, merchant.id)
                : await reopenTask(task.id, merchant.id);
              if (res.error) toast.error(res.error);
              else toast.success(task.status === 'open' ? 'Task completed.' : 'Task reopened.');
            });
          }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <span
              style={{
                fontSize: 13,
                fontWeight: 500,
                color: task.status === 'done' ? 'var(--ink-3)' : 'var(--ink)',
                textDecoration: task.status === 'done' ? 'line-through' : 'none',
              }}
            >
              {task.title}
            </span>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
              {task.priority !== 'medium' && (
                <span
                  className={`badge ${task.priority === 'high' ? 'badge-red' : 'badge-ghost'}`}
                  style={{ fontSize: 10.5 }}
                >
                  {PRIORITY_LABELS[task.priority]}
                </span>
              )}
              {task.due_at && (
                <span style={{ fontSize: 11.5, color: overdue ? 'var(--red)' : 'var(--ink-3)' }}>
                  {overdue ? '⚠ ' : ''}{fmtDate(task.due_at)}
                </span>
              )}
            </div>
          </div>
          {task.description && (
            <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--ink-3)' }}>{task.description}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <h3 style={{ margin: 0, fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>Tasks</h3>
        <button className="pill dark" style={{ fontSize: 12.5 }} onClick={() => setNewOpen(true)}>
          + New task
        </button>
      </div>

      {tasks.length === 0 ? (
        <EmptyState
          icon="✅"
          title="No tasks"
          description="Create tasks to track follow-ups for this merchant."
          action={<button className="pill dark" onClick={() => setNewOpen(true)}>New task</button>}
        />
      ) : (
        <>
          {/* Open */}
          {open.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11.5, color: 'var(--ink-3)', fontWeight: 500, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Open · {open.length}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {open.map(t => <TaskRow key={t.id} task={t} />)}
              </div>
            </div>
          )}

          {/* Done */}
          {done.length > 0 && (
            <div>
              <div style={{ fontSize: 11.5, color: 'var(--ink-3)', fontWeight: 500, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Done · {done.length}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {done.map(t => <TaskRow key={t.id} task={t} />)}
              </div>
            </div>
          )}
        </>
      )}

      {/* New task modal */}
      <Modal open={newOpen} onClose={() => setNewOpen(false)} title="New task" footer={<>
        <button className="pill outline" onClick={() => setNewOpen(false)}>Cancel</button>
        <button className="pill dark" disabled={!title.trim() || pending} onClick={submit}>
          {pending ? 'Creating…' : 'Create task'}
        </button>
      </>}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label className="field-label">Title</label>
            <input className="field" placeholder="Task title…" value={title} onChange={e => setTitle(e.target.value)} autoFocus />
          </div>
          <div>
            <label className="field-label">Description</label>
            <textarea className="field" rows={2} placeholder="Optional description…" value={description} onChange={e => setDescription(e.target.value)} />
          </div>
          <div>
            <label className="field-label">Assignee</label>
            <UserPicker value={assigneeId} onChange={setAssigneeId} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label className="field-label">Due date</label>
              <input className="field" type="date" value={dueAt} onChange={e => setDueAt(e.target.value)} />
            </div>
            <div>
              <label className="field-label">Priority</label>
              <select className="field" value={priority} onChange={e => setPriority(e.target.value as MerchantPriority)}>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
