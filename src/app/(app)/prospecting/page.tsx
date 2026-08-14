import { createClient } from '@/lib/supabase/server';
import EmptyState from '@/components/ui/EmptyState';
import ProspectingClient from './ProspectingClient';
import type { SearchList } from '@/lib/database.types';

export const metadata = { title: 'Prospecting' };

interface ListWithMeta extends SearchList {
  result_count: number;
  converted_count: number;
  creator_name: string | null;
}

export default async function ProspectingPage() {
  const supabase = await createClient();

  // Fetch search lists with creator profile
  const { data: lists, error: listsErr } = await supabase
    .from('search_lists')
    .select('*, profiles(full_name)')
    .order('created_at', { ascending: false });

  if (listsErr) {
    return (
      <div className="glass-panel" style={{ padding: 24, color: 'var(--red)' }}>
        Failed to load search lists: {listsErr.message}
      </div>
    );
  }

  // Fetch result counts grouped by list
  const { data: resultCounts } = await supabase
    .from('search_results')
    .select('list_id, converted');

  // Build count maps
  const totalByList = new Map<string, number>();
  const convertedByList = new Map<string, number>();

  for (const row of resultCounts ?? []) {
    totalByList.set(row.list_id, (totalByList.get(row.list_id) ?? 0) + 1);
    if (row.converted) {
      convertedByList.set(row.list_id, (convertedByList.get(row.list_id) ?? 0) + 1);
    }
  }

  const enriched: ListWithMeta[] = (lists ?? []).map(l => ({
    ...l,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    creator_name: (l.profiles as any)?.full_name ?? null,
    result_count: totalByList.get(l.id) ?? 0,
    converted_count: convertedByList.get(l.id) ?? 0,
  }));

  if (!enriched.length) {
    return (
      <div style={{ padding: '32px 24px' }}>
        <ProspectingClient lists={[]} />
        <EmptyState
          icon="🔍"
          title="No search lists yet"
          description="Create one to find merchants by product."
        />
      </div>
    );
  }

  return (
    <div style={{ padding: '24px' }}>
      <ProspectingClient lists={enriched} />
    </div>
  );
}
