'use strict';
const test = require('node:test'), assert = require('node:assert/strict'); const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { start } = require('./testkit'); const { build } = require('../src/app');
const clock = () => new Date('2026-11-24T10:00:00Z'); const mk = (o) => build({ ...o, clock });
const recipes = async (s) => (await s.call('GET', '/api/recipes')).data.recipes; const ingr = async (s) => (await s.call('GET', '/api/ingredients')).data.ingredients;
test('auth; seeded margherita costs out exactly', async () => {
  const s = await start(mk); assert.equal((await s.anon('GET', '/api/recipes')).status, 401);
  const r = (await recipes(s)).find((x) => x.name === 'Margherita pizza');
  // flour 1.2kg@8.6c/100g... compute independently
  const exp = 1200 * (2150 / 25000) + 6 * (890 / 500) + 600 * (540 / 2500) + 800 * (1480 / 2000) / 0.97 + 24 * (320 / 100) / 0.65 + 80 * (4600 / 5000) + 24 * (190 / 1000);
  assert.equal(r.total_cents, Math.round(exp)); assert.equal(r.cost_per_portion_cents, Math.round(Math.round(exp) / 8)); assert.equal(r.food_cost_pct, Math.round((r.cost_per_portion_cents / 1100) * 1000) / 10);
  assert.ok(r.suggested_price_cents % 5 === 0 && r.cost_per_portion_cents / r.suggested_price_cents <= 0.28); await s.close();
});
test('price rise flows into recipe cost and the dashboard flags it', async () => {
  const s = await start(mk); const before = (await recipes(s)).find((x) => x.name === 'Margherita pizza'); const moz = (await ingr(s)).find((i) => i.name === 'Mozzarella');
  assert.equal(moz.change_30d_pct, 19.4); await s.call('PATCH', '/api/ingredients/' + moz.id, { pack_cents: 1800 });
  const after = (await recipes(s)).find((x) => x.name === 'Margherita pizza'); assert.ok(after.total_cents > before.total_cents);
  const hist = (await s.call('GET', `/api/ingredients/${moz.id}/history`)).data.history; assert.equal(hist.at(-1).pack_cents, 1800);
  const d = (await s.call('GET', '/api/dashboard')).data; assert.ok(d.rises.some((r) => r.name === 'Mozzarella' && r.change_pct > 19 && r.recipes === 1)); await s.close();
});
test('recipe lines: unit type mismatch refused; ingredient in use cannot be deleted; fractions ok', async () => {
  const s = await start(mk); const R = await recipes(s); const fries = R.find((r) => r.name === 'Hand-cut fries'); const I = await ingr(s); const salt = I.find((i) => i.name === 'Sea salt'), egg = I.find((i) => i.name === 'Eggs');
  assert.match((await s.call('POST', `/api/recipes/${fries.id}/lines`, { ingredient_id: egg.id, qty: 2, unit: 'g' })).data.error, /count, not mass/);
  assert.equal((await s.call('POST', `/api/recipes/${fries.id}/lines`, { ingredient_id: egg.id, qty: 2, unit: 'pc' })).status, 200);
  assert.equal((await s.call('POST', `/api/recipes/${fries.id}/lines`, { ingredient_id: egg.id, qty: 1, unit: 'pc' })).status, 409);
  assert.match((await s.call('DELETE', '/api/ingredients/' + salt.id)).data.error, /used in a recipe/);
  assert.equal((await s.call('POST', `/api/recipes/${fries.id}/lines`, { ingredient_id: egg.id, qty: 0, unit: 'pc' })).status, 400);
  assert.match((await s.call('PATCH', '/api/ingredients/' + salt.id, { pack_unit: 'l' })).data.error, /cannot change/); await s.close();
});
test('new recipe from scratch, validation, over-target flag', async () => {
  const s = await start(mk); const I = await ingr(s); const egg = I.find((i) => i.name === 'Eggs');
  assert.equal((await s.call('POST', '/api/recipes', { name: 'X', category: 'Y', portions: 0 })).status, 400); assert.equal((await s.call('POST', '/api/ingredients', { name: 'Z', pack_qty: 1, pack_unit: 'cups', pack_cents: 100 })).status, 400);
  const id = (await s.call('POST', '/api/recipes', { name: 'Omelette', category: 'Brunch', portions: 1, price_cents: 500, target_pct: 20 })).data.id; await s.call('POST', `/api/recipes/${id}/lines`, { ingredient_id: egg.id, qty: 3, unit: 'pc' });
  const r = (await s.call('GET', '/api/recipes/' + id)).data.recipe; assert.equal(r.total_cents, 96); assert.equal(r.over_target, false);
  await s.call('PATCH', '/api/recipes/' + id, { price_cents: 400 }); assert.equal((await s.call('GET', '/api/recipes/' + id)).data.recipe.food_cost_pct, 24); assert.equal((await s.call('GET', '/api/recipes/' + id)).data.recipe.over_target, true); await s.close();
});
test('shopping list endpoint; csv; restart persistence', async () => {
  const dbFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'kc-')), 'x.db'); let s = await start((o) => mk({ ...o, dbFile })); const R = await recipes(s); const piz = R.find((r) => r.name === 'Margherita pizza');
  const sh = (await s.call('POST', '/api/shopping', { plan: [{ recipe_id: piz.id, portions: 80 }] })).data; const flour = sh.items.find((i) => i.name === 'Bread flour'); assert.equal(flour.need_base, 12000); assert.equal(flour.packs, 1);
  assert.equal(sh.total_cents, sh.items.reduce((t, i) => t + i.cost_cents, 0)); assert.equal((await s.call('POST', '/api/shopping', { plan: [] })).status, 400);
  assert.match((await s.call('GET', '/api/recipes.csv', null, true)).text, /^Recipe,Category/); await s.call('PATCH', '/api/recipes/' + piz.id, { price_cents: 1300 }); await s.close();
  s = await start((o) => mk({ ...o, dbFile })); assert.equal((await recipes(s)).find((r) => r.name === 'Margherita pizza').price_cents, 1300); await s.close();
});
