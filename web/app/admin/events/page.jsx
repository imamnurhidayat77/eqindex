'use client';
import ManageTable from '../../../components/AdminTable';

export default function ManageEvents() {
  return (
    <ManageTable
      title="Manage events" sub="Edit details or delete with full cascade (classes + rounds). Deletion is audited."
      base="events" profile={(r) => { const id = r.slug || r.id; return id ? `/events/${id}` : null; }}
      columns={[
        { k: 'is_active', label: 'Active', bool: true }, { k: 'name', label: 'Event' }, { k: 'venue', label: 'Venue' },
        { k: 'date_start', label: 'Starts' }, { k: 'tier', label: 'Tier' }, { k: 'status', label: 'Status' },
        { k: 'round_count', label: 'Rounds', num: true },
      ]}
      fields={[
        { k: 'is_active', label: 'Active (on = open for results + visible)', bool: true },
        { k: 'name', label: 'Name' }, { k: 'venue', label: 'Venue' },
        { k: 'region', label: 'Region' }, { k: 'date_start', label: 'Start (YYYY-MM-DD)' },
        { k: 'date_end', label: 'End (YYYY-MM-DD)' }, { k: 'arena_type', label: 'Arena type' },
        { k: 'event_kind', label: 'Kind — series multipliers (recompute scoring after changing)', options: ['regular', 'national_championship', 'series_final', 'islands', 'hoy', 'national_young_horse'] },
        { k: 'tier', label: 'Tier', options: ['Grand Prix', 'Premier', 'No Series'] },
        { k: 'event_type', label: 'Type', options: ['Show', 'Championship', 'League', 'Training'] },
        { k: 'status', label: 'Status', options: ['Upcoming', 'Live', 'Completed', 'Cancelled'] },
        { k: 'description', label: 'Description' }, { k: 'image_url', label: 'Image URL' },
      ]}
    />
  );
}
