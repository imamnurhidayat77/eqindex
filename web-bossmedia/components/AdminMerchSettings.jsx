'use client';
import { useEffect, useMemo, useState } from 'react';
import { useNotify } from './Toaster';
import { studio, studioFetch } from '../lib/studio';
import { nzdShort as nzd, readMerchSettingsForm } from '../lib/merch-settings-form.mjs';
import s from './AdminMerchSettings.module.css';

// Studio > Admin > Merch pricing & delivery. Admin only: courier prices,
// sponsor discount limits and the charge for a buyer's own logo. Fields are
// grouped by what they change, money fields show NZ$, and the save bar
// stays on screen with an unsaved-changes cue.

// [label, hint]
const MONEY = {
  courierCents: ['Courier, flat rate', 'One price for anywhere in New Zealand.'],
  freeOverCents: ['Free courier from', 'Orders at or over this total ship free. Set 0 to always charge courier.'],
  fallbackSponsorDiscountCents: ['Estimated discount per sponsor logo', 'Shown in the designer while a sponsor has no funded amount. Orders only use funded amounts.'],
  sponsorCapCents: ['Most discount per order', 'The total sponsor discount one order can get.'],
  uploadLogoCents: ['Extra for the buyer\u2019s own logo', 'Added per logo the buyer uploads. Set 0 to make it free.'],
};
const SECTIONS = [
  { id: 'delivery', title: 'Delivery', text: 'Courier is the only delivery option, New Zealand only.', fields: ['courierCents', 'freeOverCents'] },
  { id: 'sponsors', title: 'Sponsor discounts', text: 'Sponsor logos lower the price of an item. These limits keep the discount in check.', fields: ['fallbackSponsorDiscountCents', 'maxDiscountPct', 'sponsorCapCents'] },
  { id: 'own-logo', title: 'Buyer’s own logo', text: 'Logos the buyer uploads themselves are never discounted.', fields: ['uploadLogoCents'] },
];

const dollars = (cents) => String(Number(cents) / 100);

function toForm(d) {
  return {
    ...Object.fromEntries(Object.keys(MONEY).map((k) => [k, dollars(d[k])])),
    maxDiscountPct: String(d.maxDiscountPct),
    sponsorDiscountOncePerItem: !!d.sponsorDiscountOncePerItem,
  };
}

function Field({ id, label, hint, error, affix, suffix, value, onChange, inputMode = 'decimal' }) {
  return (
    <div className={s.field}>
      <label htmlFor={id}>{label}</label>
      <div className={s.input} data-invalid={error ? 'true' : undefined}>
        {affix && <i aria-hidden="true">{affix}</i>}
        <input id={id} type="text" inputMode={inputMode} value={value} onChange={onChange}
          aria-invalid={error ? 'true' : undefined} aria-describedby={`${id}-hint`} />
        {suffix && <i aria-hidden="true">{suffix}</i>}
      </div>
      <p id={`${id}-hint`} className={error ? s.error : s.hint}>{error || hint}</p>
    </div>
  );
}

export default function AdminMerchSettings() {
  const notify = useNotify();
  const [saved, setSaved] = useState(null);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    studio.get('/api/merch/settings').then((d) => { const f = toForm(d); setSaved(f); setForm(f); })
      .catch((e) => notify(e.message, true));
  }, [notify]);

  const { body, errors } = useMemo(() => (form ? readMerchSettingsForm(form) : { body: null, errors: {} }), [form]);
  const dirty = !!form && JSON.stringify(form) !== JSON.stringify(saved);
  const invalid = Object.keys(errors).length > 0;

  // Leaving with unsaved edits asks first.
  useEffect(() => {
    if (!dirty) return undefined;
    const onLeave = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', onLeave);
    return () => window.removeEventListener('beforeunload', onLeave);
  }, [dirty]);

  async function save(e) {
    e.preventDefault();
    if (!dirty || invalid || busy) return;
    setBusy(true);
    try {
      const d = await studioFetch('/admin/merch/settings', { method: 'PUT', body });
      const f = toForm(d?.data || body);
      setSaved(f);
      setForm(f);
      notify('Merch settings saved');
    } catch (err) { notify(err.message, true); }
    setBusy(false);
  }

  if (!form) return <p className="empty-note">Loading…</p>;
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const fieldProps = (k) => (k === 'maxDiscountPct'
    ? { label: 'Most discount per item', hint: 'The largest share of an item’s base price sponsors can take off.', suffix: '%', inputMode: 'numeric' }
    : { label: MONEY[k][0], hint: MONEY[k][1], affix: 'NZ$' });

  return (
    <form className={s.page} onSubmit={save} noValidate>
      <div className={s.bar} data-dirty={dirty ? 'true' : undefined}>
        <div className={s.barText}>
          <h2>Merch pricing &amp; delivery</h2>
          <p>Prices include GST. New orders and the designer use these within a minute. Orders already sent keep their quote.</p>
        </div>
        <div className={s.saveCluster}>
          <span className={s.saveState} aria-live="polite">
            {dirty ? <><span className={s.dot} aria-hidden="true" />{invalid ? 'Fix the marked fields' : 'Unsaved changes'}</> : 'All changes saved'}
          </span>
          <button type="button" className="st-btn-ghost" disabled={!dirty || busy} onClick={() => setForm(saved)}>Discard</button>
          <button type="submit" className="st-btn" disabled={!dirty || invalid || busy}>{busy ? 'Saving…' : 'Save changes'}</button>
        </div>
      </div>

      {SECTIONS.map((sec) => (
        <section key={sec.id} className={s.section} aria-labelledby={`merch-${sec.id}`}>
          <div className={s.sectionHead}>
            <h3 id={`merch-${sec.id}`}>{sec.title}</h3>
            <p>{sec.text}</p>
          </div>
          <div className={s.fields}>
            {sec.fields.map((k) => (
              <Field key={k} id={`merch-${k}`} value={form[k]} onChange={set(k)} error={errors[k]} {...fieldProps(k)} />
            ))}
            {sec.id === 'delivery' && !errors.courierCents && !errors.freeOverCents && (
              <p className={s.example}>
                {body.freeOverCents > 0
                  ? <>Buyers pay {nzd(body.courierCents)} courier on orders under {nzd(body.freeOverCents)}. From {nzd(body.freeOverCents)} it is free.</>
                  : <>Every order pays {nzd(body.courierCents)} courier.</>}
              </p>
            )}
            {sec.id === 'sponsors' && (
              <label className={s.switchRow}>
                <input type="checkbox" role="switch" className={s.switch} checked={form.sponsorDiscountOncePerItem}
                  onChange={(e) => setForm((f) => ({ ...f, sponsorDiscountOncePerItem: e.target.checked }))} />
                <span>
                  <strong>Count each sponsor once per item</strong>
                  <small>The same sponsor logo placed twice on one item discounts once.</small>
                </span>
              </label>
            )}
          </div>
        </section>
      ))}
    </form>
  );
}
