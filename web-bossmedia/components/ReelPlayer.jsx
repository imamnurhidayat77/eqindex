'use client';
import { useEffect, useRef, useState } from 'react';
import { Icon } from './figma';

const fmt = (s) => {
  if (!Number.isFinite(s) || s < 0) return '0:00';
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
};

// Proper reel player in Figma voice: custom chrome, no native controls.
// Props: src, poster?, autoPlay?, className? (fills parent).
export default function ReelPlayer({ src, poster = null, autoPlay = true, label = 'Reel' }) {
  const ref = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [time, setTime] = useState(0);
  const [dur, setDur] = useState(0);
  const [waiting, setWaiting] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const v = ref.current;
    if (!v || !src) return;
    setPlaying(false); setTime(0); setDur(0); setFailed(false); setWaiting(true);
    v.load();
    if (autoPlay) v.play().catch(() => {});
  }, [src, autoPlay]);

  const toggle = () => {
    const v = ref.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  };

  const seek = (e) => {
    const v = ref.current;
    const val = Number(e.target.value);
    if (v && Number.isFinite(val)) { v.currentTime = val; setTime(val); }
  };

  const fullscreen = () => {
    const v = ref.current;
    if (!v) return;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else if (v.requestFullscreen) v.requestFullscreen().catch(() => {});
    else if (v.webkitEnterFullscreen) v.webkitEnterFullscreen();
  };

  return (
    <div className="rp" onClick={(e) => e.stopPropagation()}>
      <video
        ref={ref}
        src={src}
        poster={poster || undefined}
        playsInline
        preload="metadata"
        aria-label={label}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => { setDur(e.currentTarget.duration); setWaiting(false); }}
        onCanPlay={() => setWaiting(false)}
        onWaiting={() => setWaiting(true)}
        onPlaying={() => setWaiting(false)}
        onError={() => { setFailed(true); setWaiting(false); }}
        onClick={toggle}
      />
      {waiting && !failed && (
        <span className="rp-spinner" aria-label="Loading video"><i /></span>
      )}
      {failed ? (
        <div className="rp-error">
          <p>Video won’t play here.</p>
          <a href={src} target="_blank" rel="noreferrer">Open original file</a>
        </div>
      ) : (
        <>
          {!playing && !waiting && (
            <button type="button" className="rp-bigplay" onClick={toggle} aria-label={time > 0 ? 'Resume' : 'Play'}>
              <Icon name="play" size={30} />
            </button>
          )}
          <div className="rp-bar" onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}>
              <Icon name={playing ? 'pause' : 'play'} size={16} />
            </button>
            <span className="rp-time">{fmt(time)}</span>
            <input type="range" min={0} max={Math.max(0, dur || 0)} step={0.1} value={Math.min(time, dur || 0)}
              onChange={seek} aria-label="Seek" />
            <span className="rp-time">{fmt(dur)}</span>
            <button type="button" onClick={() => { const v = ref.current; if (v) { v.muted = !v.muted; setMuted(v.muted); } }} aria-label={muted ? 'Unmute' : 'Mute'}>
              <Icon name={muted ? 'muted' : 'sound'} size={16} />
            </button>
            <button type="button" onClick={fullscreen} aria-label="Fullscreen">
              <Icon name="expand" size={16} />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
