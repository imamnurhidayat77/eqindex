'use client';
import { useState } from 'react';

// Share card: photo + result overlay text, copied as image+caption via
// native share when available, else clipboard fallback (plan §8.5 loop).
export default function ShareCard({ title, text }) {
  const [msg, setMsg] = useState('');
  async function share() {
    const url = window.location.href;
    const data = { title: title || 'EQIndex photo', text: text || '', url };
    try {
      if (navigator.share) { await navigator.share(data); return; }
      await navigator.clipboard.writeText(`${data.title} — ${data.text} ${url}`);
      setMsg('Link copied.');
    } catch { /* dismissed */ }
  }
  return (
    <div className="mt-3">
      <button onClick={share} className="text-sky text-[13px] hover:underline bg-none border-0 cursor-pointer p-0">
        Share this photo →
      </button>
      {msg && <span className="text-moss text-[12px] ml-2">{msg}</span>}
    </div>
  );
}
