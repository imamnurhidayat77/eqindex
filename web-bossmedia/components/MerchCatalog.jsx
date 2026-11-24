'use client';
import { setMerchCatalog, setMerchSettings } from '../lib/merch.mjs';

let applied = null;

// Puts the server-fetched catalog (Studio > Admin > Merch catalog) and price
// settings into the shared merch lib before any merch page renders. Null
// parts (API down) keep the built-in defaults.
export default function MerchCatalog({ data, children }) {
  if (data && data !== applied) {
    if (data.rows) setMerchCatalog(data.rows);
    if (data.settings) setMerchSettings(data.settings);
    applied = data;
  }
  return children;
}
