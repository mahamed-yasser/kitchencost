'use strict';
const { h, api, toast, money, badge, formModal, confirmBox, table, kpi, toolbar, btn, download, mountApp } = UI;
const UNITS = ['g', 'kg', 'ml', 'l', 'pc'].map((u) => [u, u]); const cents = (x) => Math.round(Number(x) * 100);
const pct = (x) => x == null ? 'n/a' : x + '%';
const fcBadge = (r) => r.price_cents ? badge(pct(r.food_cost_pct), r.over_target ? 'bad' : 'ok') : badge('No price');

async function dashboard(el) {
  const d = await api('GET', '/api/dashboard');
  el.append(h('div', { class: 'grid g4' }, kpi('Priced recipes', d.recipes), kpi('Average food cost', pct(d.avg_food_cost_pct), 'across priced recipes'), kpi('Over target', d.over_target.length, 'recipes above their target %', d.over_target.length ? 'bad' : 'ok'), kpi('Price rises, 30 days', d.rises.length, 'ingredients', d.rises.length ? 'warn' : 'ok')),
    h('div', { class: 'grid g2', style: 'margin-top:14px' },
      h('div', { class: 'card' }, h('h2', {}, 'Dishes losing margin'), d.over_target.length ? h('ul', { class: 'list' }, d.over_target.map((r) => h('li', {}, h('a', { href: '#/recipes/' + r.id }, r.name), h('span', {}, pct(r.food_cost_pct) + ' vs ' + r.target_pct + '% target · raise to ' + money(r.suggested_price_cents))))) : h('p', { class: 'muted' }, 'Every dish is inside its target.'),
        h('h2', { style: 'margin-top:14px' }, 'Best margin per portion'), h('ul', { class: 'list' }, d.best_margin.map((r) => h('li', {}, r.name, h('b', {}, money(r.margin_cents)))))),
      h('div', { class: 'card' }, h('h2', {}, 'Ingredient price rises'), d.rises.length ? h('ul', { class: 'list' }, d.rises.map((r) => h('li', {}, r.name, h('span', {}, '+' + r.change_pct + '% · in ' + r.recipes + ' recipe' + (r.recipes === 1 ? '' : 's'))))) : h('p', { class: 'muted' }, 'No increases.'))));
}
async function recipes(el, args) {
  if (args[0]) return detail(el, args[0]);
  const { recipes: rows } = await api('GET', '/api/recipes');
  el.append(toolbar(h('span', { class: 'grow' }), btn('Export CSV', async () => download('recipes.csv', await (await fetch('/api/recipes.csv')).text())),
    btn('New recipe', async () => { const r = await formModal({ title: 'New recipe', fields: [{ name: 'name', label: 'Name', required: true }, { name: 'category', label: 'Category', required: true }, { name: 'portions', label: 'Portions it makes', type: 'number', min: 1, required: true }, { name: 'price', label: 'Menu price (ex tax)', type: 'number', step: '0.01' }, { name: 'target_pct', label: 'Target food cost %', type: 'number' }], values: { portions: 1, target_pct: 30 }, onSubmit: (v) => api('POST', '/api/recipes', { name: v.name, category: v.category, portions: v.portions, price_cents: cents(v.price || 0), target_pct: v.target_pct }).then((x) => { v.id = x.id; }) }); if (r) location.hash = '#/recipes/' + r.id; }, 'primary')),
    table([{ label: 'Recipe', render: (r) => h('div', {}, h('b', {}, r.name), h('div', { class: 'muted small' }, r.category + ' · makes ' + r.portions)) }, { label: 'Cost / portion', class: 'r', render: (r) => money(r.cost_per_portion_cents) }, { label: 'Price', class: 'r', render: (r) => r.price_cents ? money(r.price_cents) : '' },
      { label: 'Food cost', render: fcBadge }, { label: 'Margin', class: 'r', render: (r) => r.price_cents ? money(r.margin_cents) : '' }], rows, { onRow: (r) => { location.hash = '#/recipes/' + r.id; } }));
}
async function detail(el, id) {
  const [{ recipe: r }, { ingredients }] = await Promise.all([api('GET', '/api/recipes/' + id), api('GET', '/api/ingredients')]); const refresh = () => window.dispatchEvent(new HashChangeEvent('hashchange'));
  el.append(h('p', {}, h('a', { href: '#/recipes' }, '← Recipes')),
    h('div', { class: 'grid g4' }, kpi('Batch cost', money(r.total_cents), 'makes ' + r.portions), kpi('Cost per portion', money(r.cost_per_portion_cents)), kpi('Food cost', pct(r.food_cost_pct), 'target ' + r.target_pct + '%', r.over_target ? 'bad' : 'ok'), kpi('Price for target', money(r.suggested_price_cents), r.price_cents ? 'current ' + money(r.price_cents) : 'no price set yet', r.over_target ? 'warn' : '')),
    h('div', { class: 'card', style: 'margin-top:14px' }, h('div', { class: 'row spread' }, h('h2', {}, r.name), h('div', { class: 'row' },
      btn('Edit price & target', async () => { if (await formModal({ title: 'Price and target', fields: [{ name: 'portions', label: 'Portions', type: 'number', min: 1 }, { name: 'price', label: 'Menu price (ex tax)', type: 'number', step: '0.01' }, { name: 'target_pct', label: 'Target food cost %', type: 'number' }], values: { portions: r.portions, price: (r.price_cents / 100).toFixed(2), target_pct: r.target_pct }, onSubmit: (v) => api('PATCH', '/api/recipes/' + id, { portions: v.portions, price_cents: cents(v.price), target_pct: v.target_pct }) })) refresh(); }),
      btn('Add ingredient', async () => { if (await formModal({ title: 'Add ingredient to ' + r.name, fields: [{ name: 'ingredient_id', label: 'Ingredient', type: 'select', options: ingredients.map((i) => [i.id, i.name + ' (' + i.pack_unit + ')']), wide: true }, { name: 'qty', label: 'Quantity', type: 'number', step: 'any', required: true }, { name: 'unit', label: 'Unit', type: 'select', options: UNITS }], onSubmit: (v) => api('POST', `/api/recipes/${id}/lines`, { ingredient_id: Number(v.ingredient_id), qty: v.qty, unit: v.unit }) })) refresh(); }, 'primary'))),
      table([{ label: 'Ingredient', key: 'name' }, { label: 'Quantity', class: 'r', render: (l) => l.qty + ' ' + l.unit }, { label: 'Cost', class: 'r', render: (l) => money(l.cost_cents) }, { label: 'Share', render: (l) => h('div', { class: 'bar', style: 'width:100px' }, h('i', { style: 'width:' + Math.round((l.cost_cents / (r.total_cents || 1)) * 100) + '%' })) },
        { label: '', render: (l) => btn('Remove', async () => { await api('DELETE', '/api/lines/' + l.id); refresh(); }, 'sm danger') }], r.lines, { empty: 'No ingredients yet.' })));
}
async function ingredients(el) {
  const draw = async () => { const { ingredients: rows } = await api('GET', '/api/ingredients');
    const fields = [{ name: 'name', label: 'Name', required: true }, { name: 'supplier', label: 'Supplier' }, { name: 'pack_qty', label: 'Pack size', type: 'number', step: 'any', required: true }, { name: 'pack_unit', label: 'Unit', type: 'select', options: UNITS }, { name: 'price', label: 'Pack price', type: 'number', step: '0.01', required: true }, { name: 'waste_pct', label: 'Trim waste %', type: 'number', min: 0, max: 89 }];
    const save = (id) => (v) => api(id ? 'PATCH' : 'POST', '/api/ingredients' + (id ? '/' + id : ''), { name: v.name, supplier: v.supplier, pack_qty: v.pack_qty, pack_unit: v.pack_unit, pack_cents: cents(v.price), waste_pct: v.waste_pct || 0 });
    el.replaceChildren(toolbar(h('span', { class: 'grow muted' }, 'Prices are per pack. Changing one updates every recipe at once.'), btn('Add ingredient', async () => { if (await formModal({ title: 'Add ingredient', fields, values: { pack_unit: 'kg', waste_pct: 0 }, onSubmit: save() })) draw(); }, 'primary')),
      table([{ label: 'Ingredient', render: (i) => h('div', {}, h('b', {}, i.name), h('div', { class: 'muted small' }, i.supplier)) }, { label: 'Pack', render: (i) => i.pack_qty + ' ' + i.pack_unit }, { label: 'Pack price', class: 'r', render: (i) => money(i.pack_cents) },
        { label: 'Waste', class: 'r', render: (i) => i.waste_pct ? i.waste_pct + '%' : '' }, { label: '30-day change', render: (i) => i.change_30d_pct ? badge((i.change_30d_pct > 0 ? '+' : '') + i.change_30d_pct + '%', i.change_30d_pct > 0 ? 'bad' : 'ok') : '' }, { label: 'Used in', class: 'r', key: 'used_in' },
        { label: '', render: (i) => btn('Edit', async () => { if (await formModal({ title: 'Edit ' + i.name, fields, values: { ...i, price: (i.pack_cents / 100).toFixed(2) }, onSubmit: save(i.id) })) { toast('Saved. Recipe costs updated.'); draw(); } }, 'sm') }], rows)); };
  await draw();
}
async function plan(el) {
  const { recipes: rs } = await api('GET', '/api/recipes'); const rows = []; const out = h('div');
  const draw = () => { el.replaceChildren(h('p', { class: 'muted' }, 'Choose what you will make and how many portions. You get the buying list with whole packs, waste included.'),
    toolbar(btn('Add dish', async () => { const r = await formModal({ title: 'Add dish to plan', fields: [{ name: 'recipe_id', label: 'Recipe', type: 'select', options: rs.map((x) => [x.id, x.name]), wide: true }, { name: 'portions', label: 'Portions', type: 'number', min: 1, required: true }], values: { portions: 40 } }); if (r) { rows.push({ recipe_id: Number(r.recipe_id), portions: r.portions }); await calc(); } }, 'primary')),
    table([{ label: 'Dish', render: (p) => rs.find((x) => x.id === p.recipe_id).name }, { label: 'Portions', class: 'r', key: 'portions' }, { label: '', render: (p) => btn('Remove', () => { rows.splice(rows.indexOf(p), 1); calc(); }, 'sm') }], rows, { empty: 'No dishes in the plan yet.' }), out); };
  const calc = async () => { draw(); if (!rows.length) return; const s = await api('POST', '/api/shopping', { plan: rows });
    out.append(h('h2', { style: 'margin:16px 0 8px' }, 'Buying list · ' + money(s.total_cents)), table([{ label: 'Ingredient', key: 'name' }, { label: 'Needed', class: 'r', render: (i) => i.need_base + ' ' + i.base_unit }, { label: 'Buy', render: (i) => i.packs + ' × ' + i.pack_label }, { label: 'Leftover', class: 'r', render: (i) => i.leftover_pct + '%' }, { label: 'Cost', class: 'r', render: (i) => money(i.cost_cents) }], s.items)); };
  draw();
}
mountApp({ title: 'KitchenCost', tagline: 'Recipe costing and menu margins', accent: '#ea580c', views: [{ id: 'dashboard', label: 'Margins', render: dashboard }, { id: 'recipes', label: 'Recipes', render: recipes }, { id: 'ingredients', label: 'Ingredients', render: ingredients }, { id: 'plan', label: 'Buying list', render: plan }] });
