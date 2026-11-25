'use client';
// Admin > Merch catalog: every product the 3D designer can draw. Each one is
// edited on its own page (/studio/admin/merch/<id>, MerchProductEditor),
// where the API checks every save with the store's rules. Products are
// hidden, never deleted. A new product reuses one of the built-in 3D models;
// a new 3D shape needs code first (docs/merch-3d-models.md).
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useNotify } from './Toaster';
import { nzdc, studio } from '../lib/studio';
import { MERCH_PRODUCTS } from '../lib/merch.mjs';
import s from './AdminMerchCatalog.module.css';

const STATUS_LABEL = { active: 'In store', hidden: 'Hidden' };
const MODEL_LABEL = Object.fromEntries(MERCH_PRODUCTS.map((p) => [p.id, p.label]));
const editHref = (id) => `/studio/admin/merch/${encodeURIComponent(id)}`;

export default function AdminMerchCatalog() {
  const notify = useNotify();
  const [rows, setRows] = useState(null);
  useEffect(() => {
    studio.get('/api/merch/catalog').then((r) => setRows(r || [])).catch((e) => notify(e.message, true));
  }, [notify]);

  if (rows === null) return <p className="empty-note">Loading…</p>;
  const sorted = [...rows].sort((a, b) => a.data.sort - b.data.sort);
  return (
    <>
      <div className={s.top}>
        <p className="st-csub" style={{ margin: 0 }}>{rows.length} products · edit one to move, resize or add logo spots on its 3D model.</p>
        <Link className="st-btn" href="/studio/admin/merch/new">+ Add product</Link>
      </div>
      <div className="st-card" style={{ padding: '6px 22px' }}>
        <div className="table-scroll"><table className="st-table">
          <thead><tr><th>Product</th><th>3D model</th><th>Status</th><th>Base price</th><th>Colours</th><th>Sizes</th><th>Logo spots</th><th /></tr></thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.id}>
                <td><strong>{r.data.label}</strong><br /><small className={s.muted}>{r.id}</small></td>
                <td>{MODEL_LABEL[r.data.model || r.id]}</td>
                <td>{STATUS_LABEL[r.data.status]}</td>
                <td>{nzdc(r.data.baseCents)}</td>
                <td>
                  <span className={s.dots}>
                    {r.data.colorList.map((c) => <span key={c.hex} className={s.dot} style={{ background: c.hex }} title={c.name} />)}
                  </span>
                </td>
                <td>{r.data.sizes.join(' · ')}</td>
                <td>{r.data.slotList.filter((x) => x.active).length} of {r.data.slotList.length}</td>
                <td><Link className="st-btn-ghost" style={{ minHeight: 36 }} href={editHref(r.id)}>Edit</Link></td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>
      <p className="st-csub" style={{ marginTop: 12 }}>
        Changes reach the store within a minute. Orders already sent keep their price and colour.
        A new product uses the 3D model and photos of the model you pick; its logo spots can then be moved, resized and added on the model.
        A new 3D shape (boots, bags) needs code first (docs/merch-3d-models.md).
      </p>
    </>
  );
}
