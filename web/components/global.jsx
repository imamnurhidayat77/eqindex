'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import { API } from '../lib/api';

const SeasonCtx = createContext({ season: '', seasons: [], setSeason: () => {} });

export function SeasonProvider({ children }) {
  const [seasons, setSeasons] = useState([]);
  const [season, setSeasonState] = useState('');
  useEffect(() => {
    try {
      const s = localStorage.getItem('eq-season') || '';
      if (s) setSeasonState(s);
    } catch { /* ignore */ }
    fetch(`${API}/events?limit=100`)
      .then((r) => r.json())
      .then((j) => {
        const uniq = [...new Set((j.data || []).map((e) => e.season).filter(Boolean))].sort().reverse();
        setSeasons(uniq);
      })
      .catch(() => {});
  }, []);
  const setSeason = (s) => {
    setSeasonState(s);
    try { localStorage.setItem('eq-season', s); } catch { /* ignore */ }
  };
  return <SeasonCtx.Provider value={{ season, seasons, setSeason }}>{children}</SeasonCtx.Provider>;
}

export const useSeason = () => useContext(SeasonCtx);
