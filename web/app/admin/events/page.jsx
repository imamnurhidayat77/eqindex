'use client';
import ManageTable from '../../../components/AdminTable';

export default function ManageEvents() {
  return (
    <ManageTable
      title="Manage events" sub="Edit details or delete with full cascade (classes + rounds). Deletion is audited."
      base="events" profile={(r) => `/events/${r.id}`}
      columns={[
        { k: 'name', label: 'Event' }, { k: 'venue', label: 'Venue' },
        { k: 'date_start', label: 'Starts' }, { k: 'status', label: 'Status' },
        { k: 'round_count', label: 'Rounds', num: true },
      ]}
      fields={[
        { k: 'name', label: 'Name' }, { k: 'venue', label: 'Venue' },
        { k: 'region', label: 'Region' }, { k: 'date_start', label: 'Start (YYYY-MM-DD)' },
        { k: 'date_end', label: 'End (YYYY-MM-DD)' }, { k: 'arena_type', label: 'Arena type' },
        { k: 'event_type', label: 'Type', options: ['Show', 'Championship', 'League', 'Training'] },
        { k: 'status', label: 'Status', options: ['Upcoming', 'Live', 'Completed', 'Cancelled'] },
        { k: 'description', label: 'Description' }, { k: 'image_url', label: 'Image URL' },
      ]}
    />
  );
}
