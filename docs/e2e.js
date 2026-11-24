'use strict';
const e2e = require('./e2ekit'); const { build } = require('../src/app');
const clock = () => new Date('2026-11-24T10:00:00Z');
e2e((o) => build({ ...o, clock }), async ({ page, shot, ok, restart, login, modal, tick, url }) => {
  await login(); await page.waitFor('document.body.innerText.includes("Ingredient price rises")'); await tick(300); await shot('01-margins'); ok((await page.text()).includes('Mozzarella'), 'dashboard flags the mozzarella price rise');
  await page.click('a[data-id=recipes]'); await page.waitFor('document.querySelectorAll("tbody tr").length===5'); await shot('02-recipes');
  await page.clickText('tbody tr', 'Margherita pizza'); await page.waitFor('document.body.innerText.toLowerCase().includes("batch cost")'); const before = await page.eval('document.querySelectorAll(".kpi-value")[1].textContent'); await shot('03-recipe');
  await page.click('a[data-id=ingredients]'); await page.waitFor('document.querySelectorAll("tbody tr").length===16');
  await page.clickText('tbody tr', 'Mozzarella'); await page.eval(`[...document.querySelectorAll('tbody tr')].find(r=>r.textContent.includes('Mozzarella')).querySelector('button').click()`); await page.waitFor('document.querySelector(".modal")'); await modal('price', '19.50'); await page.click('#modal-submit'); await page.waitFor('!document.querySelector(".modal")');
  await page.click('a[data-id=recipes]'); await page.waitFor('document.querySelectorAll("tbody tr").length===5'); await page.clickText('tbody tr', 'Margherita pizza'); await page.waitFor('document.body.innerText.toLowerCase().includes("batch cost")');
  const after = await page.eval('document.querySelectorAll(".kpi-value")[1].textContent'); ok(after !== before, `changing a price updates the recipe (${before} -> ${after})`);
  await restart(); await page.eval('location.reload()'); await page.waitFor('document.body.innerText.toLowerCase().includes("batch cost")'); ok((await page.eval('document.querySelectorAll(".kpi-value")[1].textContent')) === after, 'updated cost persists after restart');
  await page.click('a[data-id=plan]'); await page.waitFor('document.body.innerText.includes("Buying list")'); await page.clickText('button', 'Add dish'); await page.waitFor('document.querySelector(".modal")'); await page.eval(`(()=>{const s=document.querySelector('.modal [name=recipe_id]');s.value=[...s.options].find(o=>o.textContent.includes('Margherita')).value})()`); await modal('portions', '80'); await page.click('#modal-submit');
  await page.waitFor('document.body.innerText.includes("Buying list ·")'); ok((await page.text()).includes('Bread flour'), 'buying list shows whole packs for 80 pizzas'); await shot('04-buying-list');
  await page.viewport(390, 844, true); await page.eval('location.hash="#/recipes"'); await page.waitFor('document.querySelectorAll("tbody tr").length===5'); await tick(300); await shot('05-mobile-recipes');
}, { docs: __dirname });
