import { getJSON } from './api';
import { setMerchCatalog, setMerchSettings } from './merch.mjs';

// Server side: the live catalog rows and price settings (30 s cache), also
// applied to the shared merch lib for this render. Null parts mean the API
// is down: the lib keeps the built-in defaults.
export async function loadMerchCatalog() {
  const [rows, settings] = await Promise.all([
    getJSON('/api/merch/catalog').then((j) => j.data).catch(() => null),
    getJSON('/api/merch/settings').then((j) => j.data).catch(() => null),
  ]);
  if (rows) setMerchCatalog(rows);
  if (settings) setMerchSettings(settings);
  return { rows, settings };
}
