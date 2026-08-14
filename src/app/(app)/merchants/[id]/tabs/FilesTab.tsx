'use client';

import { useState, useRef, useTransition } from 'react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import type { Attachment, Merchant } from '@/lib/database.types';
import { fmtDate } from '@/lib/utils';
import EmptyState from '@/components/ui/EmptyState';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { useRouter } from 'next/navigation';

const BUCKET = 'merchant-files';

function fmtSize(bytes: number | null): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIcon(mime: string | null): string {
  if (!mime) return '📄';
  if (mime.startsWith('image/')) return '🖼';
  if (mime === 'application/pdf') return '📕';
  if (mime.includes('spreadsheet') || mime.includes('csv') || mime.includes('excel')) return '📊';
  if (mime.includes('word') || mime.includes('document')) return '📝';
  return '📄';
}

interface Props {
  merchant: Merchant;
  attachments: Attachment[];
  currentUserId: string | null;
}

export default function FilesTab({ merchant, attachments, currentUserId }: Props) {
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const supabase = createClient();

  async function uploadFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    for (const file of Array.from(files)) {
      const path = `${merchant.id}/${Date.now()}-${file.name}`;
      const { error: uploadErr } = await supabase.storage.from(BUCKET).upload(path, file);
      if (uploadErr) { toast.error(`Upload failed: ${uploadErr.message}`); continue; }
      // Insert attachment record
      const { error: insertErr } = await supabase.from('attachments').insert({
        entity_type: 'merchant',
        entity_id: merchant.id,
        merchant_id: merchant.id,
        file_path: path,
        file_name: file.name,
        mime_type: file.type || null,
        size_bytes: file.size,
        uploaded_by: currentUserId,
      });
      if (insertErr) toast.error(`DB error: ${insertErr.message}`);
      else toast.success(`Uploaded ${file.name}`);
    }
    setUploading(false);
    router.refresh();
  }

  async function download(att: Attachment) {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(att.file_path, 60);
    if (error || !data) { toast.error('Could not generate download link.'); return; }
    const a = document.createElement('a');
    a.href = data.signedUrl;
    a.download = att.file_name ?? 'file';
    a.click();
  }

  async function deleteFile(att: Attachment) {
    const { error: storageErr } = await supabase.storage.from(BUCKET).remove([att.file_path]);
    if (storageErr) { toast.error(storageErr.message); return; }
    const { error: dbErr } = await supabase.from('attachments').delete().eq('id', att.id);
    if (dbErr) { toast.error(dbErr.message); return; }
    toast.success('File deleted.');
    router.refresh();
  }

  const toDelete = attachments.find(a => a.id === deleteId);

  return (
    <div>
      {/* Upload zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); uploadFiles(e.dataTransfer.files); }}
        onClick={() => fileRef.current?.click()}
        style={{
          border: `2px dashed ${dragging ? 'var(--blue)' : 'var(--g-line)'}`,
          borderRadius: 14,
          padding: '24px 20px',
          textAlign: 'center',
          cursor: 'pointer',
          background: dragging ? 'var(--blue-bg)' : 'var(--g-card)',
          transition: 'all 0.15s',
          marginBottom: 16,
        }}
      >
        <div style={{ fontSize: 28, marginBottom: 8 }}>📎</div>
        <div style={{ fontSize: 13, color: 'var(--ink-2)', fontWeight: 500 }}>
          {uploading ? 'Uploading…' : 'Drop files here or click to upload'}
        </div>
        <div className="sub" style={{ marginTop: 4 }}>Any file type, up to 50 MB each</div>
        <input
          ref={fileRef}
          type="file"
          multiple
          style={{ display: 'none' }}
          onChange={e => uploadFiles(e.target.files)}
        />
      </div>

      {/* File grid */}
      {attachments.length === 0 ? (
        <EmptyState icon="📁" title="No files yet" description="Upload documents, images, or any other files for this merchant." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {attachments.map(att => (
            <div
              key={att.id}
              className="glass-card"
              style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}
            >
              <span style={{ fontSize: 24, flexShrink: 0 }}>{fileIcon(att.mime_type)}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)' }} className="ellipsis">
                  {att.file_name ?? att.file_path.split('/').pop()}
                </div>
                <div className="sub">
                  {fmtSize(att.size_bytes)} · {fmtDate(att.created_at)}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button
                  className="pill outline"
                  style={{ fontSize: 11.5 }}
                  onClick={() => download(att)}
                >
                  Download
                </button>
                <button
                  className="pill danger"
                  style={{ fontSize: 11.5 }}
                  onClick={() => setDeleteId(att.id)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={async () => {
          if (!toDelete) return;
          await deleteFile(toDelete);
          setDeleteId(null);
        }}
        title="Delete file"
        body={`Delete "${toDelete?.file_name ?? 'this file'}"? This cannot be undone.`}
        confirmLabel="Delete"
        danger
      />
    </div>
  );
}
