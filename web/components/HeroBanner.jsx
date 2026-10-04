import Link from 'next/link';
import { LIVE } from '../lib/tokens';

// Real show jumping photograph (horse clearing an obstacle, Lausanne):
// Wikimedia Commons featured picture by Fanny Schertzer, CC BY 3.0.
const PHOTO_URL =
  'https://commons.wikimedia.org/wiki/Special:FilePath/' +
  encodeURIComponent('Kamal Bahamdan & Noblesse Des Tess - 2013 Longines Global Champions Tour.jpg') +
  '?width=1600';

/**
 * Home hero — real show jumping photography blended into the dark
 * arena theme, with headline copy and CTA buttons.
 */
export default function HeroBanner() {
  return (
    <section className="relative overflow-hidden rounded border border-line mb-6">
      {/* ---- night base ---- */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(900px 400px at 12% 0%, rgba(76,154,255,0.12), transparent 55%),' +
            'linear-gradient(180deg, #07090f 0%, #0b0e16 60%, #0a0c10 100%)',
        }}
      />
      {/* ---- horse photograph, blended into the dark theme ---- */}
      <img
        src={PHOTO_URL}
        alt="Show jumping horse clearing an obstacle"
        className="absolute inset-y-0 right-0 h-full w-full md:w-[62%] object-cover"
        style={{
          maskImage:
            'linear-gradient(to right, transparent 0%, black 32%), linear-gradient(to top, transparent 0%, black 18%)',
          maskComposite: 'intersect',
          WebkitMaskImage:
            'linear-gradient(to right, transparent 0%, black 32%), linear-gradient(to top, transparent 0%, black 18%)',
          WebkitMaskComposite: 'source-in',
        }}
        loading="eager"
      />
      {/* gold wash over the photo edge for warmth */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'linear-gradient(to right, #07090f 22%, transparent 62%),' +
            'radial-gradient(600px 300px at 80% 30%, rgba(255,215,0,0.10), transparent 65%)',
        }}
      />

      {/* ---- floating chips (static) ---- */}
      <div className="hidden md:flex absolute right-[38%] top-8 items-center gap-1.5 rounded-full border border-moss/40 bg-ink/80 px-3 py-1.5 text-[11px] font-bold text-moss backdrop-blur">
        <span className="w-1.5 h-1.5 rounded-full bg-moss" /> CLEAR · 0 FAULTS
      </div>
      <div className="hidden md:flex absolute right-[5%] bottom-16 items-center gap-1.5 rounded-full border border-gold/40 bg-ink/80 px-3 py-1.5 text-[11px] font-bold text-gold backdrop-blur">
        ★ 1.40m · GOLD FINAL
      </div>

      {/* ---- copy ---- */}
      <div className="relative p-6 md:p-10 max-w-[560px]">
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <span className={LIVE}>● LIVE CIRCUIT DATA</span>
        </div>
        <h1 className="font-display font-bold uppercase leading-[0.95] tracking-tight text-[42px] md:text-[60px]">
          Every fence.
          <br />
          <span className="text-gold">Every round.</span>
          <br />
          Tracked.
        </h1>
        <p className="text-muted text-[14px] md:text-[15px] leading-relaxed mt-4 max-w-[440px]">
          Live NZ show jumping data — clear rates, faults, rankings and form
          for every horse, rider and combination on the national circuit.
        </p>
        <div className="flex flex-wrap items-center gap-3 mt-6">
          <Link
            href="/rankings"
            className="bg-gold text-black font-bold rounded px-6 py-3 text-sm no-underline hover:brightness-110 transition shadow-[0_0_28px_rgba(255,215,0,0.35)]"
          >
            Explore rankings →
          </Link>
          <Link
            href="/watchlist"
            className="border border-line text-body rounded px-6 py-3 text-sm no-underline font-semibold hover:border-gold/70 hover:text-gold transition-colors bg-ink/40"
          >
            My watchlist
          </Link>
        </div>
      </div>

      {/* photo credit */}
      <a
        href="https://commons.wikimedia.org/wiki/File:Kamal_Bahamdan_%26_Noblesse_Des_Tess_-_2013_Longines_Global_Champions_Tour.jpg"
        target="_blank"
        rel="noreferrer"
        className="absolute bottom-2 right-3 text-[10px] text-faint/70 no-underline hover:text-faint"
      >
        Photo: Fanny Schertzer / Wikimedia Commons (CC BY 3.0)
      </a>

      {/* bottom fade into page */}
      <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-ink/60 to-transparent pointer-events-none" />
    </section>
  );
}
