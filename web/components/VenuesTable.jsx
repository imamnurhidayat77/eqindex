'use client';
import Link from 'next/link';
import { LINK, NUM, TD, TH } from '../lib/tokens';
import DataTable from './DataTable';

export default function VenuesTable({ rows }) {
  return (
    <DataTable
      rows={rows}
      searchKeys={['name', 'region']}
      placeholder="Filter by venue or region…"
      initialPerPage={15}
      colSpan={5}
      thead={<tr><th className={TH}>Venue</th><th className={TH}>Region</th><th className={`${TH} ${NUM}`}>Events</th><th className={`${TH} ${NUM}`}>Rounds</th><th className={TH}></th></tr>}
      renderRow={(x) => (
        <tr key={x.id}>
          <td className={TD}><b>{x.name}</b></td>
          <td className={`${TD} text-muted`}>{x.region || '—'}</td>
          <td className={`${TD} ${NUM} text-muted`}>{x.events}</td>
          <td className={`${TD} ${NUM} text-muted`}>{x.rounds}</td>
          <td className={`${TD} ${NUM}`}><Link className={LINK} href={`/venues/${x.id}`}>Open →</Link></td>
        </tr>
      )}
    />
  );
}
