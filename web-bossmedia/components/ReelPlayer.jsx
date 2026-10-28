'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from './figma';

const fmt = (s) => {
  if (!Number.isFinite(s) || s < 0) return '0:00';
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
};

// Custom reel chrome: click video to toggle, auto-hiding bar, arrows/space shortcuts.
// Props: src, poster?, autoPlay?, label? (fills parent — parent must be positioned).
export default function ReelPlayer({ src, poster = null, autoPlay = false, label = 'Reel', onProgress = null, onEnded = null }) {
  const ref = useRef(null);
  const idleTimer = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [time, setTime] = useState(0);
  const [dur, setDur] = useState(0);
  const [waiting, setWaiting] = useState(true);
  const [failed, setFailed] = useState(false);
  const [idle, setIdle] = useState(false);

  useEffect(() => {
    const v = ref.current;
    if (!v || !src) return;
    setPlaying(false); setTime(0); setDur(0); setFailed(false); setWaiting(true); setIdle(false);
    v.load();
    if (autoPlay) v.play().catch(() => {});
  }, [src, autoPlay]);

  useEffect(() => () => clearTimeout(idleTimer.current), []);

  const poke = useCallback(() => {
    setIdle(false);
    clearTimeout(idleTimer.current);
    const v = ref.current;
    if (v && !v.paused) idleTimer.current = setTimeout(() => setIdle(true), 2200);
  }, []);

  const toggle = useCallback(() => {
    const v = ref.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  }, []);

  const toggleMute = useCallback(() => {
    const v = ref.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  }, []);

  const fullscreen = useCallback(() => {
    const v = ref.current;
    if (!v) return;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else if (v.requestFullscreen) v.requestFullscreen().catch(() => {});
    else if (v.webkitEnterFullscreen) v.webkitEnterFullscreen();
  }, []);

  const seek = (e) => {
    const v = ref.current;
    const val = Number(e.target.value);
    if (v && Number.isFinite(val)) { v.currentTime = val; setTime(val); }
    poke();
  };

  const onKeys = (e) => {
    const v = ref.current;
    if (!v) return;
    if (e.key === ' ') { e.preventDefault(); toggle(); poke(); }
    else if (e.key === 'ArrowLeft') { v.currentTime = Math.max(0, v.currentTime - 5); poke(); }
    else if (e.key === 'ArrowRight') { v.currentTime = Math.min(dur || v.duration || 0, v.currentTime + 5); poke(); }
    else if (e.key === 'm' || e.key === 'M') { toggleMute(); poke(); }
    else if (e.key === 'f' || e.key === 'F') { fullscreen(); poke(); }
  };

  const pct = dur > 0 ? Math.min(100, (time / dur) * 100) : 0;

  return (
    <div className={`rp${playing && idle ? ' is-idle' : ''}`} onClick={(e) => e.stopPropagation()}
      onMouseMove={poke} onMouseLeave={() => { if (ref.current && !ref.current.paused) setIdle(true); }}
      tabIndex={0} onKeyDown={onKeys} role="region" aria-label={label}>
      <video
        ref={ref}
        src={src}
        poster={poster || undefined}
        playsInline
        preload="metadata"
        aria-label={label}
        onPlay={() => { setPlaying(true); poke(); }}
        onPause={() => { setPlaying(false); setIdle(false); clearTimeout(idleTimer.current); }}
        onTimeUpdate={(e) => {
          setTime(e.currentTarget.currentTime);
          if (onProgress && e.currentTarget.duration) onProgress(Math.min(1, e.currentTarget.currentTime / e.currentTarget.duration));
        }}
        onEnded={() => { setPlaying(false); onEnded?.(); }}
        onLoadedMetadata={(e) => { setDur(e.currentTarget.duration); setWaiting(false); }}
        onCanPlay={() => setWaiting(false)}
        onWaiting={() => setWaiting(true)}
        onPlaying={() => { setWaiting(false); poke(); }}
        onError={() => { setFailed(true); setWaiting(false); }}
        onClick={toggle}
      />
      {waiting && !failed && (
        <span className="rp-spinner" aria-label="Loading video"><i /></span>
      )}
      {failed ? (
        <div className="rp-error">
          <p>Video won’t play here.</p>
          {/^https:\/\//i.test(src || '')
            ? <a href={src} target="_blank" rel="noreferrer">Open original file</a>
            : <span>Check back shortly.</span>}
        </div>
      ) : (
        <>
          {!playing && !waiting && (
            <button type="button" className="rp-bigplay" onClick={toggle} aria-label={time > 0 ? 'Resume' : 'Play'}>
              <Icon name="play" size={30} />
            </button>
          )}
          <div className="rp-bar" onClick={(e) => e.stopPropagation()}>
            <input className="rp-track" type="range" min={0} max={Math.max(0, dur || 0)} step={0.1}
              value={Math.min(time, dur || 0)} onChange={seek} aria-label="Seek reel position"
              style={{ '--p': `${pct}%` }} />
            <div className="rp-row">
              <button type="button" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}>
                <Icon name={playing ? 'pause' : 'play'} size={17} />
              </button>
              <span className="rp-time">{fmt(time)} / {fmt(dur)}</span>
              <span className="rp-flex" aria-hidden="true" />
              <button type="button" onClick={toggleMute} aria-label={muted ? 'Unmute' : 'Mute'}>
                <Icon name={muted ? 'muted' : 'sound'} size={17} />
              </button>
              <button type="button" onClick={fullscreen} aria-label="Fullscreen">
                <Icon name="expand" size={17} />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
