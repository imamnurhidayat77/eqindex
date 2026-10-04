const pool = require('../db');
const { asyncH } = require('../lib/async');
const { audit } = require('../lib/audit');
const { needRole } = require('../lib/auth');
const { bustCache } = require('../middleware/cache');
const { bustCategoryKeys } = require('../lib/categories');

const COLS = 'key, title, label, name_contains, class_types, exclude_name, sort, is_active';

function toJson(r) {
  return {
    key: r.key, title: r.title, label: r.label,
    nameContains: r.name_contains || [], classTypes: r.class_types || [],
    excludeName: r.exclude_name || [], sort: r.sort, is_active: r.is_active,
  };
}

module.exports = function mountCategoryRoutes(app) {
  // Public: active categories for Weekend Best + labels.
  app.get('/categories', asyncH(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT ${COLS} FROM rider_categories WHERE is_active ORDER BY sort, key`);
    res.json({ data: rows.map(toJson) });
  }));

  app.get('/admin/categories', needRole('ADMIN'), asyncH(async (req, res) => {
    const { rows } = await pool.query(`SELECT ${COLS} FROM rider_categories ORDER BY sort, key`);
    res.json({ data: rows.map(toJson) });
  }));

  app.post('/admin/categories', needRole('ADMIN'), asyncH(async (req, res) => {
    const { key, title, label, nameContains, classTypes, excludeName, sort, is_active } = req.body || {};
    if (!key || !/^[a-z0-9-]{1,30}$/.test(key)) return res.status(400).json({ error: 'key must be [a-z0-9-], max 30' });
    if (!title || !label) return res.status(400).json({ error: 'need {key, title, label}' });
    const { rows } = await pool.query(
      `INSERT INTO rider_categories (key, title, label, name_contains, class_types, exclude_name, sort, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING ${COLS}`,
      [key, String(title).slice(0, 80), String(label).slice(0, 80),
        nameContains || [], classTypes || [], excludeName || [],
        Number.isFinite(Number(sort)) ? Number(sort) : 0, is_active !== false]);
    audit(req, 'category.create', 'category', key, {});
    bustCache('/news'); bustCache('/categories'); bustCategoryKeys();
    res.status(201).json({ data: toJson(rows[0]) });
  }));

  app.patch('/admin/categories/:key', needRole('ADMIN'), asyncH(async (req, res) => {
    const { title, label, nameContains, classTypes, excludeName, sort, is_active } = req.body || {};
    const sets = [], vals = [];
    const put = (col, v) => { vals.push(v); sets.push(`${col} = $${vals.length}`); };
    if (title !== undefined) put('title', String(title).slice(0, 80));
    if (label !== undefined) put('label', String(label).slice(0, 80));
    if (nameContains !== undefined) put('name_contains', nameContains || []);
    if (classTypes !== undefined) put('class_types', classTypes || []);
    if (excludeName !== undefined) put('exclude_name', excludeName || []);
    if (!sets.length) return res.status(400).json({ error: 'nothing to update' });
    vals.push(req.params.key);
    const { rows } = await pool.query(
      `UPDATE rider_categories SET ${sets.join(', ')} WHERE key = $${vals.length} RETURNING ${COLS}`, vals);
    if (!rows.length) return res.status(404).json({ error: 'category not found' });
    audit(req, 'category.edit', 'category', req.params.key, {});
    bustCache('/news'); bustCache('/categories'); bustCategoryKeys();
    res.json({ data: toJson(rows[0]) });
  }));

  app.delete('/admin/categories/:key', needRole('ADMIN'), asyncH(async (req, res) => {
    const { rowCount } = await pool.query('DELETE FROM rider_categories WHERE key = $1', [req.params.key]);
    if (!rowCount) return res.status(404).json({ error: 'category not found' });
    audit(req, 'category.delete', 'category', req.params.key, {});
    bustCache('/news'); bustCache('/categories'); bustCategoryKeys();
    res.json({ ok: true });
  }));
};
