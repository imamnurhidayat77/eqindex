'use client';
import { useEffect, useState } from 'react';
import SponsorPhoto, { RECOMMENDED_BY_ASPECT, aspectKeyOf, variantShort } from './SponsorTemplates';
import { nzd } from '../lib/figma-data';
import q from './QuickStyles.module.css';

// Photo page quick picks: the three templates that suit this photo best,
// drawn small with the sponsor that would go on it. One tap puts the
// design on the big photo (the parent saves it); Customize opens the full
// editor. The discount line only repeats what the server funded.
export default function QuickStyles({ photo, sponsors = [], discountCents = 0, current, theme = 'light', meta = {}, owned = () => false, onPick, onCustomize }) {
  const [size, setSize] = useState(null);
  useEffect(() => {
    if (!photo) return undefined;
    let live = true;
    const im = new Image();
    im.onload = () => { if (live) setSize({ w: im.naturalWidth, h: im.naturalHeight }); };
    im.src = photo;
    return () => { live = false; };
  }, [photo]);
  if (!sponsors.length) return null;
  const ids = RECOMMENDED_BY_ASPECT[aspectKeyOf(size?.w, size?.h)].filter((id) => !owned(id)).slice(0, 3);
  const ar = size ? size.w / size.h : 1.5;
  const ratio = size ? `${size.w} / ${size.h}` : '3 / 2';
  // Every card shares one square box (--qb); the photo is contain-fit in it.
  const width = ar >= 1 ? 'var(--qb)' : `calc(var(--qb) * ${ar.toFixed(3)})`;
  const labels = sponsors.map((sp) => sp.label).filter(Boolean);
  const names = labels.length > 2 ? `${labels.slice(0, 2).join(', ')} +${labels.length - 2} more` : labels.join(', ');
  return (
    <div className={q.wrap}>
      <div role="group" aria-label="Quick styles" className={q.grid}>
        {ids.map((id) => {
          const on = current?.template === id;
          return (
            <button key={id} type="button" aria-pressed={on} className={q.card} onClick={() => onPick?.(id)}
              aria-label={`${variantShort(id)} style${on ? ' (on your photo)' : ''}`}>
              <span className={q.box}>
                <span style={{ display: 'block', width }}>
                  <SponsorPhoto photo={photo} variant={id} ratio={ratio} theme={theme} sponsors={sponsors}
                    event={meta.event} className={meta.className} result={meta.result} subject={meta.subject} />
                </span>
              </span>
              <span className={q.name}>{variantShort(id)}</span>
            </button>
          );
        })}
      </div>
      <p className={q.note}>
        With {names || 'your sponsor'}{discountCents > 0 ? <> · <b>{nzd(discountCents)} off</b></> : null}. Tap a style to see it on your photo.
      </p>
      <button type="button" className={q.customize} onClick={onCustomize}>
        Customize <span>more styles, sponsors and text</span> <i aria-hidden="true">→</i>
      </button>
    </div>
  );
}
