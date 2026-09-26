import { BADGE, CARD, H1, H2, MUT, SUB, TABLE, TABLEWRAP, TD, TH, badge } from '../../lib/tokens';

const GROUPS = [
  ['System', [
    ['GET', '/health', 'Service + DB status check.'],
  ]],
  ['Rankings — ?limit&min_starts + round filters (season, region, arena, height_min, height_max, since)', [
    ['GET', '/rankings/horses', 'Horse rankings: starts, clears, clear_pct, avg_faults, wins.'],
    ['GET', '/rankings/riders', 'Rider rankings + horses_ridden.'],
    ['GET', '/rankings/horses?metric=points&window=', 'Briefing points leaderboard: total_points, podiums, win_rate. window=all|12m|3m.'],
    ['GET', '/rankings/riders?metric=points&window=', 'Rider points leaderboard, same windows.'],
    ['GET', '/partnerships', 'Horse–rider pairs: rounds_together, clear_pct, avg_faults.'],
  ]],
  ['Events & Classes', [
    ['GET', '/events', 'Event list ?limit&season&region&arena, with class/round counts.'],
    ['GET', '/events/:id', 'One event + its class_stats rows.'],
    ['GET', '/events/:id/analytics', 'Full analytics: rounds, horses, riders, partnerships.'],
    ['GET', '/arenas', 'Arena aggregates: rounds, clear_pct, avg_faults, top_horse.'],
    ['GET', '/classes', 'Class difficulty ?limit&season&region&arena&type&format.'],
    ['GET', '/height-stats', 'Per-horse height progression ?limit.'],
    ['GET', '/trends/circuit', 'Monthly circuit aggregates + round filters.'],
  ]],
  ['Profiles', [
    ['GET', '/horses/:id', 'Horse row, stats, 50-round history, partnerships.'],
    ['GET', '/horses/:id/trend', 'Monthly trend for one horse.'],
    ['GET', '/horses/:id/timeline', 'Training + health + competition feed (100).'],
    ['GET', '/riders/:id', 'Rider row, stats, 50-round history, partnerships.'],
    ['GET', '/comparison?type=horse|rider|combination|event&a=&b=', 'Head-to-head stat rows (event = edition matchup, YoY verdict).'],
    ['GET', '/peers?horse_id=', 'Same-age-band (±1y) horses with career stats + peer averages.'],
  ]],
  ['Stable records', [
    ['GET', '/horses/:id/training', 'Training records + rider names.'],
    ['POST', '/horses/:id/training', 'Body {rider_id, date, type, intensity: Low|Medium|High, notes}.'],
    ['DELETE', '/training/:id', 'Delete a training record.'],
    ['GET', '/horses/:id/health', 'Health records.'],
    ['POST', '/horses/:id/health', 'Body {date, category: VET|TREATMENT|FARRIER|VACCINATION|OTHER, description, provider}.'],
    ['DELETE', '/health/:id', 'Delete a health record.'],
  ]],
  ['Series', [
    ['GET', '/series', 'Series list with entry counts.'],
    ['GET', '/series/:key/standings', 'Points standings ?limit (rank, rider, horse, points, shows).'],
    ['GET', '/series/:key/detail', 'Engine view: per-event matrix, completed/remaining, drops, source, last calculated.'],
    ['POST', '/admin/series/:key/recalc', 'Stamp calculated_at (ADMIN).'],
  ]],
  ['Watchlist & alerts — identity via ?user_id= or X-User-Id header', [
    ['GET', '/watchlist', 'Watched entities with resolved names.'],
    ['POST', '/watchlist', 'Body {user_id, entity_type: horse|rider|combination|event, entity_id?, horse_id+rider_id for combination, note?}.'],
    ['DELETE', '/watchlist/:id', 'Unwatch (scoped to user).'],
    ['GET', '/watchlist/updates', 'Recent rounds from watched entities ?user_id&days&limit.'],
    ['GET', '/alert-prefs', 'Alert toggles for user.'],
    ['PUT', '/alert-prefs', 'Body {user_id, score_changes, ranking_movements, new_results, benchmark_changes}.'],
  ]],
  ['Saved comparisons', [
    ['GET', '/comparisons', 'Saved matchups with resolved sides ?user_id.'],
    ['POST', '/comparisons', 'Body {user_id, type: horse|rider|combination, a_id, b_id (a≠b), label?}.'],
    ['DELETE', '/comparisons/:id', 'Delete (scoped to user).'],
  ]],
  ['Naming review queue', [
    ['GET', '/review?status=', 'Queue items: pending|approved|merged|rejected.'],
    ['POST', '/review/:id', 'Body {action: approve_new|merge|reject, match_id? for merge}.'],
  ]],
];

const methodBadge = (m) =>
  m === 'GET' ? badge(BADGE.green) : m === 'DELETE' ? badge(BADGE.red) : badge(BADGE.goldfill);

export default function ApiDocs() {
  return (
    <>
      <h1 className={H1}>API</h1>
      <p className={SUB}>41 endpoints. JSON responses; errors as {'{error}. Base URL configurable via NEXT_PUBLIC_API_URL.'}</p>
      {GROUPS.map(([title, rows]) => (
        <section className={CARD} key={title}>
          <h2 className={H2}>{title}</h2>
          <div className={TABLEWRAP}>
          <table className={TABLE}>
            <thead><tr><th className={TH}>Method</th><th className={TH}>Endpoint</th><th className={TH}>Notes</th></tr></thead>
            <tbody>
              {rows.map(([m, e, d]) => (
                <tr key={`${m} ${e}`}><td className={TD}><span className={methodBadge(m)}>{m}</span></td><td className={TD}><code>{e}</code></td><td className={MUT}>{d}</td></tr>
              ))}
            </tbody>
          </table>
          </div>
        </section>
      ))}
    </>
  );
}
