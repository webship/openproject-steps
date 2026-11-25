'use strict';

// Shared helpers for the step files of this pack.
//
// Not a step file: it registers no step definitions and no hooks. It holds the plumbing the steps use and that
// another pack can require instead of copying: the wait budget, presence assertions with friendly errors, URL
// building, the users registry, signing in (the form, and a session put back), what the site lays over a page (the
// welcome dialog of a first login and the introduction tour), the site's API as the managing account (the test
// content a scenario makes and removes), and the work packages a scenario made, which go after it.
//
// Everything here builds on webship-js's own helpers (`gotoUrl`, `smartSettle`, `waitForPageLoad`, `friendly`) so the
// steps behave like the core webship-js steps.

const { gotoUrl, smartSettle, waitForPageLoad, friendly } = require('webship-js/tests/step-definitions/webship');

let playwright;
try { playwright = require('playwright'); } catch { playwright = require(require.resolve('playwright', { paths: [require.resolve('webship-js/package.json')] })); }

/**
 * The per-assertion wait budget: `minWaitTime.page` from cucumber.js, at least 10 seconds, so a slow page does not fail
 * an assertion that would pass a moment later. Kept below webship-js's 45 second step timeout.
 *
 * @param {object} world
 * @returns {number}
 */
function budget(world) {
  return Math.max((world && world.minWaitTime && world.minWaitTime.page) || 0, 10000);
}

/**
 * Escape a literal string for use in a RegExp.
 *
 * @param {string} text
 * @returns {string}
 */
function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * A RegExp that matches the whole text (ignoring surrounding space and case), for exact names and labels.
 *
 * @param {string} text
 * @returns {RegExp}
 */
function exactly(text) {
  return new RegExp('^\\s*' + escapeRegExp(text) + '\\s*$', 'i');
}

/**
 * Collapse runs of white space and trim.
 *
 * @param {string} text
 * @returns {string}
 */
function tidy(text) {
  return String(text === null || text === undefined ? '' : text).replace(/\s+/g, ' ').trim();
}

/**
 * Run an action and rethrow its failure as a friendly error (action, target, cause and a hint) instead of
 * Playwright's raw timeout stack.
 *
 * @param {string} label
 * @param {string} target
 * @param {Function} fn
 * @param {string} hint
 */
async function actOrExplain(label, target, fn, hint) {
  try {
    return await fn();
  } catch (err) {
    if (err && err.stack === err.message && /Hint:/.test(err.message)) throw err;
    throw friendly({ action: label, target, cause: err, hint });
  }
}

/**
 * Wait until a locator has (or, with `notCase`, no longer has) a visible match and fail with a friendly error
 * otherwise: the wait and the assertion are one call, so content that arrives a moment late still passes.
 *
 * @param {import('playwright').Locator} locator
 * @param {string|null|undefined} notCase
 * @param {{label: string, hint: string, timeout: number}} options
 */
async function assertPresence(locator, notCase, { label, hint, timeout }) {
  try {
    await locator.first().waitFor({ state: notCase ? 'hidden' : 'visible', timeout });
  } catch {
    throw friendly({
      message: notCase ? `Expected not to see ${label}, but it is still on the page.` : `Expected to see ${label}, but it did not appear within ${timeout} ms.`,
      hint,
    });
  }
}

/**
 * Poll a reader until its value satisfies a test, and return the last value read, so a value that changes a moment
 * after the action (a status after a move) still passes.
 *
 * @param {Function} read - async () => value
 * @param {Function} test - (value) => boolean
 * @param {number} timeout
 * @returns {Promise<{ok: boolean, value: *}>}
 */
async function waitForValue(read, test, timeout) {
  const deadline = Date.now() + timeout;
  let value;
  for (;;) {
    try { value = await read(); } catch { value = undefined; }
    if (value !== undefined && test(value)) return { ok: true, value };
    if (Date.now() >= deadline) return { ok: false, value };
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

/**
 * The site root without a trailing slash.
 *
 * @param {object} world
 * @returns {string}
 */
function siteRoot(world) {
  return String(world.launchUrl).replace(/\/+$/, '');
}

/**
 * Join the site root and a path with exactly one slash. Absolute URLs pass through.
 *
 * @param {object} world
 * @param {string} url
 * @returns {string}
 */
function siteUrl(world, url) {
  if (!url) return siteRoot(world);
  if (/^https?:\/\//i.test(url)) return url;
  return siteRoot(world) + '/' + String(url).replace(/^\/+/, '');
}

/**
 * Open a page of the site and wait for it to settle; then close what the site lays over it.
 *
 * @param {object} world
 * @param {string} url
 */
async function open(world, url) {
  await gotoUrl(world.page, siteUrl(world, url));
  await world.page.waitForSelector('body', { state: 'attached', timeout: budget(world) });
  await waitForPageLoad(world.page, (world.minWaitTime && world.minWaitTime.page) || 3000);
  await clearObstacles(world);
}

/**
 * Close what the site lays over a page on an account's first visits and that takes the clicks meant for the page: the
 * welcome dialog of a first login (the language and the "Save" button) and the introduction tour ("Skip").
 *
 * @param {object} world
 */
async function clearObstacles(world) {
  const page = world.page;
  for (let round = 0; round < 3; round += 1) {
    let closed = false;
    const tour = page.locator('.enjoyhint_skip_btn, .enjoyhint .enjoyhint_close_btn').first();
    if (await tour.isVisible().catch(() => false)) { await tour.click().catch(() => {}); closed = true; }
    const welcome = page.locator('dialog[open], .spot-modal').filter({ has: page.locator('button', { hasText: /^\s*(Save|Close)\s*$/ }) }).first();
    if (await welcome.isVisible().catch(() => false)) {
      await welcome.locator('button', { hasText: /^\s*Save\s*$/ }).first().click().catch(() => welcome.locator('button', { hasText: /^\s*Close\s*$/ }).first().click().catch(() => {}));
      closed = true;
    }
    if (!closed) return;
    await smartSettle(page, 1000);
  }
}

/**
 * A user of the `users` registry in cucumber.js (`worldParameters.users`).
 *
 * @param {object} world
 * @param {string} handle
 * @returns {{username: string, password: string, name: string}}
 */
function resolveUser(world, handle) {
  const users = (world.parameters && world.parameters.users) || {};
  const entry = users[handle];
  if (!entry) {
    throw friendly({
      message: `The account "${handle}" is not in the users registry. Known accounts: ${Object.keys(users).join(', ') || '(none)'}.`,
      hint: `Add it to worldParameters.users in cucumber.js: users: { ${handle}: { username: '...', password: process.env.OPENPROJECT_${handle.toUpperCase()}_PASSWORD, name: '...' } }. The account itself is made once by the build of the site, never by a feature.`,
    });
  }
  const username = entry.username || handle;
  const password = typeof entry === 'string' ? entry : entry.password;
  if (!password) {
    throw friendly({
      message: `The account "${handle}" has no password in the users registry.`,
      hint: `Set worldParameters.users.${handle}.password in cucumber.js, from an environment variable.`,
    });
  }
  return { username, password, name: entry.name || '' };
}

/**
 * The login of the account the browser's session is of, asked of the site; an empty string for a visitor.
 *
 * @param {object} world
 * @returns {Promise<string>}
 */
async function currentUser(world) {
  const r = await world.context.request.get(siteUrl(world, '/api/v3/users/me'), {
    headers: { 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/hal+json' }, ignoreHTTPSErrors: true, failOnStatusCode: false,
  }).catch(() => null);
  if (!r || r.status() !== 200) return '';
  const me = await r.json().catch(() => ({}));
  return me && me._type === 'User' ? String(me.login || '') : '';
}

/**
 * The name the site shows for the account the browser's session is of; an empty string for a visitor.
 *
 * @param {object} world
 * @returns {Promise<string>}
 */
async function currentName(world) {
  const r = await world.context.request.get(siteUrl(world, '/api/v3/users/me'), {
    headers: { 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/hal+json' }, ignoreHTTPSErrors: true, failOnStatusCode: false,
  }).catch(() => null);
  if (!r || r.status() !== 200) return '';
  const me = await r.json().catch(() => ({}));
  return me && me._type === 'User' ? String(me.name || '') : '';
}

/**
 * Forget the browser's session: the page is emptied first, so no request of the site brings a new session back.
 *
 * @param {object} world
 */
async function dropSession(world) {
  if (world.page.url() !== 'about:blank') await world.page.goto('about:blank').catch(() => {});
  await world.context.clearCookies();
}

/**
 * Fill and submit the login form with a username and a password. It asserts nothing.
 *
 * @param {object} world
 * @param {string} username
 * @param {string} password
 */
async function submitLogin(world, username, password) {
  const page = world.page;
  await open(world, '/login');
  await actOrExplain('fill in the login form for', username, async () => {
    const form = page.locator('form:has(#username):has(#password)').last();
    await form.locator('#username').waitFor({ state: 'visible', timeout: budget(world) });
    await form.locator('#username').fill(username);
    await form.locator('#password').fill(password);
    await form.locator('[type="submit"]').first().click();
  }, 'The login form (#username, #password and its submit button) did not show at /login. A site that signs in through another provider only has no such form, and a session that is already open is sent to its home page instead.');
  await smartSettle(page, 2000);
}

const sessions = new Map();

/**
 * Sign in with an account of the users registry and make sure the session is that account's. An account that is
 * already signed in is kept; an account that signed in earlier in the run gets its session back; otherwise the account
 * goes through the login form. What the site lays over the first page is closed.
 *
 * @param {object} world
 * @param {string} handle
 */
async function signInAs(world, handle) {
  const user = resolveUser(world, handle);
  const key = siteRoot(world) + '|' + handle;
  if ((await currentUser(world)) === user.username) {
    if (world.page.url() === 'about:blank' || !world.page.url().startsWith(siteRoot(world))) await open(world, '/my/page');
    return;
  }
  await dropSession(world);
  const saved = sessions.get(key);
  if (saved) {
    await world.context.addCookies(saved);
    if ((await currentUser(world)) === user.username) {
      await open(world, '/my/page');
      return;
    }
    sessions.delete(key);
    await dropSession(world);
  }
  await submitLogin(world, user.username, user.password);
  const result = await waitForValue(() => currentUser(world), (login) => login === user.username, budget(world));
  if (!result.ok) {
    const error = tidy(await world.page.locator('.op-toast--content, .flash, [role="alert"]').first().innerText({ timeout: 1500 }).catch(() => ''));
    throw friendly({
      message: `Logging in as "${handle}" (login "${user.username}") did not work${error ? `: the site says "${error}"` : `; the page is ${world.page.url()}`}.`,
      hint: 'Check the login and the password of this account in worldParameters.users of cucumber.js, and that the account exists on the site and is not locked.',
    });
  }
  sessions.set(key, await world.context.cookies());
  await clearObstacles(world);
}

// ---------------------------------------------------------------------------
// The site's API, as the managing account
// ---------------------------------------------------------------------------

const managers = new Map();

/** The managing accounts' request contexts of a run, all of them, and their end. */
const managerContexts = {
  async dispose() {
    for (const m of managers.values()) await m.ctx.dispose().catch(() => {});
    managers.clear();
  },
};

/**
 * A request context of its own, logged in as the managing account (`worldParameters.manager`, a handle of the users
 * registry), for the test content a scenario makes and removes. It never touches the browser's session. The site's
 * API takes a session from its login form; a change on it must say it comes from the site's own pages.
 *
 * @param {object} world
 * @returns {Promise<{ctx: import('playwright').APIRequestContext, csrf: string}>}
 */
async function managerContext(world) {
  const handle = (world.parameters && world.parameters.manager) || 'owner';
  const key = siteRoot(world) + '|' + handle;
  if (managers.has(key)) return managers.get(key);
  const user = resolveUser(world, handle);
  const ctx = await playwright.request.newContext({ baseURL: siteRoot(world), ignoreHTTPSErrors: true });
  const form = await ctx.get('/login');
  const html = await form.text();
  const token = (html.match(/name="authenticity_token" value="([^"]+)"/) || [])[1];
  if (!token) throw friendly({ message: `The login page of ${siteRoot(world)} has no form to log the managing account in with.`, hint: 'Is LAUNCH_URL the address of the site, and is the site up?' });
  // The login goes on through the site's own redirects (its second-factor step answers at once for an account with none).
  await ctx.post('/login', { form: { authenticity_token: token, username: user.username, password: user.password }, failOnStatusCode: false });
  const me = await ctx.get('/api/v3/users/me', { headers: { 'X-Requested-With': 'XMLHttpRequest' }, failOnStatusCode: false });
  const login = me.status() === 200 ? String((await me.json()).login || '') : '';
  // A change through the API on a session also carries the session's form token, as the site's own pages send it.
  const page = await ctx.get('/my/page', { failOnStatusCode: false });
  const csrf = ((await page.text()).match(/<meta name="csrf-token" content="([^"]+)"/) || [])[1] || '';
  if (login !== user.username || !csrf) {
    await ctx.dispose();
    throw friendly({ message: `The managing account "${handle}" could not log in to ${siteRoot(world)} for the test content.`, hint: `Check worldParameters.manager and the account "${handle}" in worldParameters.users of cucumber.js.` });
  }
  const manager = { ctx, csrf };
  managers.set(key, manager);
  return manager;
}

/**
 * One call of the site's API v3 as the managing account: its status and its JSON.
 *
 * @param {object} world
 * @param {string} method
 * @param {string} path - after /api/v3
 * @param {object} [data]
 * @returns {Promise<{status: number, data: *}>}
 */
async function api(world, method, path, data) {
  const { ctx, csrf } = await managerContext(world);
  const r = await ctx.fetch('/api/v3' + path, {
    method,
    headers: {
      // A change on a session is taken from the site's own origin only: the browser says so with Sec-Fetch-Site (the
      // site asks for it over HTTPS), and X-Requested-With over plain HTTP.
      'X-Requested-With': 'XMLHttpRequest', 'Sec-Fetch-Site': 'same-origin', Accept: 'application/hal+json',
      ...(method === 'GET' ? {} : { 'X-CSRF-Token': csrf }),
      ...(data === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    data: data === undefined ? undefined : JSON.stringify(data),
    failOnStatusCode: false,
  });
  let body = null;
  try { body = await r.json(); } catch { body = null; }
  return { status: r.status(), data: body };
}

/**
 * An answer of the API that is not a success, as a friendly error.
 *
 * @param {string} what
 * @param {{status: number, data: *}} r
 * @param {string} hint
 */
function apiFailure(what, r, hint) {
  return friendly({ message: `Could not ${what}: the site answered ${r.status}${r.data && r.data.message ? ` (${r.data.message})` : ''}.`, hint });
}

/**
 * A filter of the API v3, as its query parameter.
 *
 * @param {object[]} list
 * @returns {string}
 */
function filters(list) {
  return encodeURIComponent(JSON.stringify(list));
}

/**
 * A project by its identifier or its name: { id, identifier, name }. The step's project, else the one of cucumber.js.
 *
 * @param {object} world
 * @param {string} [which]
 */
async function findProject(world, which) {
  const wanted = String(which || (world.parameters && world.parameters.project) || '').trim();
  const direct = /^[a-z][a-z0-9_-]*$/.test(wanted) ? await api(world, 'GET', `/projects/${encodeURIComponent(wanted)}`) : { status: 0 };
  if (direct.status === 200) return { id: direct.data.id, identifier: direct.data.identifier, name: direct.data.name };
  const all = await api(world, 'GET', '/projects?pageSize=200');
  const found = ((all.data && all.data._embedded && all.data._embedded.elements) || []).find((p) => exactly(wanted).test(p.name) || p.identifier === wanted);
  if (!found) throw friendly({ message: `There is no project "${wanted}" the managing account can see.`, hint: 'Name the project by its identifier (webship-site) or its name (Webship site); the managing account must be a member of it.' });
  return { id: found.id, identifier: found.identifier, name: found.name };
}

/**
 * The work packages of a project whose subject is the text, open or closed.
 *
 * @param {object} world
 * @param {{id: number}} project
 * @param {string} subject
 * @returns {Promise<object[]>}
 */
async function findWorkPackages(world, project, subject) {
  const r = await api(world, 'GET', `/projects/${project.id}/work_packages?pageSize=100&filters=${filters([{ status: { operator: '*', values: [] } }, { subject: { operator: '~', values: [subject] } }])}`);
  if (r.status !== 200) throw apiFailure(`look for the work package "${subject}"`, r, 'The managing account must see the project\'s work packages.');
  return ((r.data && r.data._embedded && r.data._embedded.elements) || []).filter((w) => exactly(subject).test(w.subject));
}

/**
 * The one work package of a subject in a project (the step's, else the last one a scenario used).
 *
 * @param {object} world
 * @param {string} subject
 * @param {string} [projectName]
 * @returns {Promise<object>}
 */
async function workPackageNamed(world, subject, projectName) {
  const project = await findProject(world, projectName || (world.openproject && world.openproject.project));
  const found = await findWorkPackages(world, project, subject);
  if (!found.length) throw friendly({ message: `There is no work package "${subject}" in the project ${project.name}.`, hint: 'Make it first with Given there is a work package "…" in the project "…".' });
  return found[0];
}

/**
 * Remember a work package a scenario made, so it goes after the scenario.
 *
 * @param {object} world
 * @param {number|string} id
 */
function remember(world, id) {
  world.openproject = world.openproject || {};
  world.openproject.made = world.openproject.made || new Set();
  world.openproject.made.add(String(id));
}

/**
 * Remove a work package with the time logged on it, as the managing account.
 *
 * @param {object} world
 * @param {number|string} id
 */
async function removeWorkPackage(world, id) {
  const entries = await api(world, 'GET', `/time_entries?pageSize=200&filters=${filters([{ entity_type: { operator: '=', values: ['WorkPackage'] } }, { entity_id: { operator: '=', values: [String(id)] } }])}`);
  let list = (entries.status === 200 && entries.data && entries.data._embedded && entries.data._embedded.elements) || null;
  if (!list) {
    const old = await api(world, 'GET', `/time_entries?pageSize=200&filters=${filters([{ work_package: { operator: '=', values: [String(id)] } }])}`);
    list = (old.status === 200 && old.data && old.data._embedded && old.data._embedded.elements) || [];
  }
  for (const e of list) await api(world, 'DELETE', `/time_entries/${e.id}`);
  const r = await api(world, 'DELETE', `/work_packages/${id}`);
  if (r.status !== 204 && r.status !== 404) throw apiFailure(`remove the work package #${id}`, r, 'The managing account must be allowed to delete work packages and time in the project (a Project admin).');
}

/**
 * Make a work package as the managing account: the project's first type, its default status.
 *
 * @param {object} world
 * @param {{id: number}} project
 * @param {string} subject
 * @returns {Promise<object>}
 */
async function makeWorkPackage(world, project, subject) {
  const r = await api(world, 'POST', `/projects/${project.id}/work_packages`, { subject, description: { raw: 'Made by a test scenario; it goes after the scenario.' } });
  if (r.status !== 201) throw apiFailure(`make the work package "${subject}"`, r, 'The managing account must be allowed to add work packages in the project.');
  remember(world, r.data.id);
  return r.data;
}

module.exports = {
  budget,
  escapeRegExp,
  exactly,
  tidy,
  actOrExplain,
  assertPresence,
  waitForValue,
  siteRoot,
  siteUrl,
  open,
  clearObstacles,
  resolveUser,
  currentUser,
  currentName,
  dropSession,
  submitLogin,
  signInAs,
  managerContext,
  api,
  apiFailure,
  filters,
  findProject,
  findWorkPackages,
  workPackageNamed,
  remember,
  removeWorkPackage,
  makeWorkPackage,
  managerContexts,
};
