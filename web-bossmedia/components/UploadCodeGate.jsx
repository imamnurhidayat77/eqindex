'use client';
// Manual fallback when the QR won't scan: type the event code printed under it.
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import SmartImage from './SmartImage';
import styles from './UploadQr.module.css';

export default function UploadCodeGate() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');

  function go(e) {
    e.preventDefault();
    const clean = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!/^(?=.*[0-9])[A-Z0-9]{4,12}$/.test(clean)) {
      setErr('That code doesn’t look right — it’s printed under the QR (e.g. TAKAPO26).');
      return;
    }
    router.push(`/upload/${clean}`);
  }

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <p className={styles.eyebrow}>Boss Media · Community upload</p>
        <h1>Share from the event.</h1>
        <p className={styles.lede}>
          At the venue? Point your camera at the Boss Media QR on the poster.
          No QR in reach — type the event code instead:
        </p>
        <form onSubmit={go} className={styles.stack}>
          <label className={styles.field}>
            <span>Event code</span>
            <input
              type="text" value={code} autoCapitalize="characters" autoCorrect="off"
              onChange={(e) => { setCode(e.target.value); setErr(''); }}
              placeholder="e.g. TAKAPO26" maxLength={12} inputMode="text"
            />
          </label>
          {err && <p className={styles.error} role="alert">{err}</p>}
          <button type="submit" className={styles.primary}>Continue</button>
        </form>
        <p className={styles.fine}>
          <Link href="/events">Not at an event? Browse galleries</Link>
        </p>
      </div>
      <div className={styles.side}>
        <SmartImage src="https://images.unsplash.com/photo-1553284965-83fd3e82fa5a?auto=format&fit=crop&w=1200&q=80" alt="Show jumper clearing a fence" fill sizes="(max-width: 900px) 100vw, 50vw" />
      </div>
    </main>
  );
}
