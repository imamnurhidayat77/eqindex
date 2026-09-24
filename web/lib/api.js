export const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
export const DEMO_USER = process.env.NEXT_PUBLIC_DEMO_USER_ID || '';

export async function getJSON(path) {
  const res = await fetch(`${API}${path}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`API ${path}: ${res.status}`);
  return res.json();
}
