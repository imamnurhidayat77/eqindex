import { API } from './api';

// Subject search for tag/credit pickers. kind: 'horse'|'horses'|'rider'|'riders'.
// Returns [{ id, label }] — [] for short queries and on any failure.
export async function searchSubjects(kind, q) {
  if (String(q || '').trim().length < 2) return [];
  const plural = kind === 'horse' || kind === 'horses' ? 'horses' : 'riders';
  try {
    const res = await fetch(`${API}/api/${plural}/search?q=${encodeURIComponent(q)}&limit=8`);
    const j = await res.json().catch(() => ({}));
    return (j.data || []).map((o) => ({ id: o.id, label: o.name }));
  } catch { return []; }
}
