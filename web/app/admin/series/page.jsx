'use client';
import ManageTable from '../../../components/AdminTable';
import { badge, BADGE } from '../../../lib/tokens';

export default function AdminSeries() {
  return (
    <ManageTable
      title="Series management" sub="Qualification rules and official vs independent labelling per series."
      base="series" idKey="series_key" hideSearch
      nameKey={(r) => r.display_name || r.series_name}
      profile={null}
      columns={[
        { k: 'display_name', label: 'Series', render: (r) => (<><b>{r.display_name || r.series_name}</b><div className="text-faint text-[11px]">{r.series_key}</div></>) },
        { k: 'season', label: 'Season', render: (r) => (r.season || '').replace('-', '/') || '—' },
        { k: 'entries', label: 'Entries', num: true },
        { k: 'is_official', label: 'Status', render: (r) => (r.is_official
          ? <span className={badge(BADGE.green)}>Official{r.official_source ? ` · ${r.official_source}` : ''}</span>
          : <span className={badge(BADGE.goldfill)}>Independent</span>) },
      ]}
      fields={[
        { k: 'display_name', label: 'Display name' },
        { k: 'official_source', label: 'Official source', placeholder: 'e.g. ESNZ' },
        { k: 'description', label: 'Description' },
        { k: 'qual_rules', label: 'Qualification rules', type: 'textarea', placeholder: 'How points qualify, dropped scores, finals…' },
        { k: 'is_official', label: 'Official (organiser-published) — off means EQIndex-calculated independent', bool: true },
        { k: 'best_of', label: 'Best-of (dropped scores; empty = all count)', placeholder: 'e.g. 8' },
        { k: 'auto_calc', label: 'Auto-calculate from linked classes (ignores imported rows)', bool: true },
      ]}
    />
  );
}
