'use client';
import { useCallback, useEffect, useState } from 'react';
import ReelPlayer from './ReelPlayer';
import { Icon } from './figma';

const PHOTO_MS = 5000;

// Instagram-Story-style reel viewer: progress segments, tap/arrow
// navigation, auto-advance (video end or 5s per photo).
export default function StoryViewer({ reels, index, onIndex, onClose }) {
  const [prog, setProg] = useState(0);
  const reel = reels[index];
  const last = index >= reels.length - 1;

  const next = useCallback(() => {
    if (index < reels.length - 1) { setProg(0); onIndex(index + 1); }
    else onClose();
  }, [index, reels.length, onIndex, onClose]);

  const prev = useCallback(() => {
    if (index > 0) { setProg(0); onIndex(index - 1); }
  }, [index, onIndex]);

  useEffect(() => { setProg(0); }, [index]);

  // Photo timer with smooth progress.
  useEffect(() => {
    if (!reel || reel.video) return undefined;
    let raf = 0;
    const t0 = performance.now();
    const tick = (t) => {
      const p = Math.min(1, (t - t0) / PHOTO_MS);
      setProg(p);
      if (p >= 1) next();
      else raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [index, reel, next]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    const h = (e) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') next();
      else if (e.key === 'ArrowLeft') prev();
    };
    window.addEventListener('keydown', h);
    return () => { document.body.style.overflow = ''; window.removeEventListener('keydown', h); };
  }, [onClose, next, prev]);

  if (!reel) return null;
  const prevReel = index > 0 ? reels[index - 1] : null;
  const nextReel = index < reels.length - 1 ? reels[index + 1] : null;

  const peek = (r, label) => (
    r ? (
      <button type="button" className={`story-peek ${label}`} onClick={label === 'prev' ? prev : next} aria-label={`${label === 'prev' ? 'Previous' : 'Next'} reel: ${r.rider}`}>
        {r.image ? <img src={r.image} alt="" aria-hidden="true" /> : <span className="cover-fallback">Boss Media</span>}
        <span className="story-peek-label">{r.rider}</span>
        <span className="story-peek-arrow" aria-hidden="true">{label === 'prev' ? '‹' : '›'}</span>
      </button>
    ) : <span className="story-peek empty" aria-hidden="true" />
  );

  return (
    <div className="story" role="dialog" aria-modal="true" aria-label={`Reel ${index + 1} of ${reels.length} featuring ${reel.rider}`}>
      <div className="story-segs" aria-hidden="true">
        {reels.map((r, i) => (
          <span key={r.id || i}><i style={{ width: `${i < index ? 100 : i === index ? Math.round(prog * 100) : 0}%` }} /></span>
        ))}
      </div>
      <div className="story-head">
        <span className="story-who">
          <strong>{reel.rider}{reel.horse ? ` × ${reel.horse}` : ''}</strong>
          <small>{reel.event}</small>
        </span>
        <span className="story-count">{index + 1} / {reels.length}</span>
        <button type="button" className="story-close" onClick={onClose} aria-label="Close viewer">
          <Icon name="close" size={22} />
        </button>
      </div>
      <div className="story-deck">
        {peek(prevReel, 'prev')}
        <div className="story-stage" key={reel.id}>
          {reel.video ? (
            <ReelPlayer src={reel.video} poster={reel.image} label={`Reel featuring ${reel.rider}`}
              onProgress={setProg} onEnded={next} />
          ) : reel.image ? (
            <img src={reel.image} alt={`${reel.rider} at ${reel.event}`} />
          ) : (
            <span className="cover-fallback">Boss Media</span>
          )}
        </div>
        {peek(nextReel, 'next')}
      </div>
      <button type="button" className="story-tap left" onClick={prev} disabled={index === 0} aria-label="Previous reel" />
      <button type="button" className="story-tap right" onClick={next} aria-label="Next reel" />
    </div>
  );
}
