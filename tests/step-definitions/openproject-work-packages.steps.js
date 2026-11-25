'use strict';

// Work package step definitions: the test content a scenario makes and removes (through the site's API, as the managing
// account), the work package list, one work package and what a person changes on it (its status through the
// workflow, a comment, the time logged, its assignee), a new work package made through the form, and what an account
// may not do (a Reader's status, a create button that is off).
//
// What a scenario makes goes after it: the work packages a Given step made and the ones a scenario created through
// the form are removed, with the time logged on them, as the managing account, so a run leaves the site as it found it.
// Name test content "Webship test …": `cmd-tools-openproject-cli.sh <site> --tidy` removes what a stopped run left.

const { Given, When, Then, After, AfterAll } = require('@cucumber/cucumber');
const { smartSettle, friendly } = require('webship-js/tests/step-definitions/webship');
const {
  budget,
  exactly,
  tidy,
  open,
  actOrExplain,
  assertPresence,
  waitForValue,
  findProject,
  findWorkPackages,
  workPackageNamed,
  remember,
  removeWorkPackage,
  makeWorkPackage,
  managerContexts,
} = require('./openproject-helpers');

/** The project a step names, else the last one a scenario used, else the one of cucumber.js. */
async function projectOf(world, which) {
  const project = await findProject(world, which || (world.openproject && world.openproject.project));
  world.openproject = Object.assign(world.openproject || {}, { project: project.identifier });
  return project;
}

/** The work package page on screen: its id, from the address, or a friendly error. */
function openWorkPackage(world) {
  const m = world.page.url().match(/\/work_packages\/(\d+)/);
  if (!m) throw friendly({ message: `No work package is open (the page is ${world.page.url()}).`, hint: 'Open one first with When I open the work package "…".' });
  return m[1];
}

// ---------------------------------------------------------------------------
// Test content
// ---------------------------------------------------------------------------

/**
 * Make a work package through the site's API as the managing account, in the project's first type and default status;
 * one of the subject left by a stopped run goes first. It goes again after the scenario.
 *
 * Example #1: Given there is a work package "Webship test task" in the project "webship-site"
 * Example #2: Given there is a work package "Webship test comment" in the project "Webship site"
 * Example #3: And there is a work package "Webship test status"
 * Example #4: Given there is a work package "Webship test time" in the project "webship-site"
 * Example #5: Given there is a work package "Webship test assignee"
 *
 */
Given(/^there is a work package "([^"]*)"(?: in the project "([^"]*)")?$/, async function (subject, which) {
  const project = await projectOf(this, which);
  for (const old of await findWorkPackages(this, project, subject)) await removeWorkPackage(this, old.id);
  await makeWorkPackage(this, project, subject);
});

/**
 * Make sure no work package of the subject is in the project: one there is removed with the time logged on it, as
 * the managing account.
 *
 * Example #1: Given there is no work package "Webship test new" in the project "webship-site"
 * Example #2: Given there is no work package "Webship test new" in the project "Webship site"
 * Example #3: And there is no work package "Webship test task"
 * Example #4: Given there is no work package "Webship test created"
 * Example #5: Then there is no work package "Webship test new" in the project "webship-site"
 *
 */
Given(/^there is no work package "([^"]*)"(?: in the project "([^"]*)")?$/, async function (subject, which) {
  const project = await projectOf(this, which);
  for (const old of await findWorkPackages(this, project, subject)) await removeWorkPackage(this, old.id);
});

// ---------------------------------------------------------------------------
// The list and one work package
// ---------------------------------------------------------------------------

/**
 * Open the work package list of a project (its default view: the open work packages).
 *
 * Example #1: When I open the work packages of the project "webship-site"
 * Example #2: When I open the work packages of the project "Webship site"
 * Example #3: And we open the work packages of the project "webship-site"
 * Example #4: Given I open the work packages of the project "webship-site"
 * Example #5: When open the work packages of the project "Webship site"
 *
 */
When(/^(I |we )*open the work packages of the project "([^"]*)"$/, async function (pronounCase, which) {
  const project = await projectOf(this, which);
  await open(this, `/projects/${project.identifier}/work_packages`);
  await this.page.locator('.work-package-table, .wp-table--row, .generic-table--empty-row, op-wp-table').first().waitFor({ state: 'attached', timeout: budget(this) }).catch(() => {});
});

/**
 * Assert that the work package list on screen shows (or does not show) a row of the subject.
 *
 * Example #1: Then the work package list should show "Webship test task"
 * Example #2: Then the work package list should not show "Webship test task"
 * Example #3: And the work package list should show "The greeting script says Helo instead of Hello"
 * Example #4: But the work package list should not show "Webship test closed"
 * Example #5: Then the work package list should show "Webship test new"
 *
 */
Then(/^the work package list should (not )?show "([^"]*)"$/, async function (notCase, subject) {
  await assertPresence(this.page.locator('.wp-table--row').filter({ hasText: subject }), notCase, {
    label: `the work package "${subject}" in the list`,
    hint: notCase ? 'The list shows the open work packages: a closed one leaves it.' : 'The list shows the open work packages of the project the session may see; open it first with When I open the work packages of the project "…".',
    timeout: budget(this),
  });
});

/**
 * Open a work package by its subject, at its activity (comments and changes), in the project the scenario works in.
 *
 * Example #1: When I open the work package "Webship test task"
 * Example #2: When I open the work package "The greeting script says Helo instead of Hello"
 * Example #3: And we open the work package "Webship test comment"
 * Example #4: Given I open the work package "Webship test status"
 * Example #5: When open the work package "Webship test time"
 *
 */
When(/^(I |we )*open the work package "([^"]*)"$/, async function (pronounCase, subject) {
  const wp = await workPackageNamed(this, subject);
  await open(this, `/work_packages/${wp.id}/activity`);
  await assertPresence(this.page.locator('[data-field-name="subject"]').filter({ hasText: subject }), null, {
    label: `the work package "${subject}"`,
    hint: 'The account of the session must see the project of the work package.',
    timeout: budget(this),
  });
});

/**
 * Create a work package through the form of a project (its default type), and wait until it is saved. It goes again
 * after the scenario.
 *
 * Example #1: When I create a work package "Webship test new" in the project "webship-site"
 * Example #2: When I create a work package "Webship test new" in the project "Webship site"
 * Example #3: And we create a work package "Webship test created"
 * Example #4: When I create a work package "Webship test new"
 * Example #5: Then I create a work package "Webship test created" in the project "webship-site"
 *
 */
When(/^(I |we )*create a work package "([^"]*)"(?: in the project "([^"]*)")?$/, async function (pronounCase, subject, which) {
  const project = await projectOf(this, which);
  await open(this, `/projects/${project.identifier}/work_packages/new`);
  await actOrExplain('create the work package', subject, async () => {
    const field = this.page.locator('#wp-new-inline-edit--field-subject');
    await field.waitFor({ state: 'visible', timeout: budget(this) });
    await field.fill(subject);
    await this.page.locator('#work-packages--edit-actions-save').click();
    await this.page.waitForURL(/\/work_packages\/\d+/, { timeout: budget(this) });
  }, 'The form of a new work package (its subject, and Save) shows to an account that may add work packages in the project.');
  remember(this, openWorkPackage(this));
  await smartSettle(this.page, 1500);
});

// ---------------------------------------------------------------------------
// What a person changes on the open work package
// ---------------------------------------------------------------------------

/** The status the open work package shows. */
async function statusShown(world) {
  return tidy(await world.page.locator('[data-test-selector="op-wp-status-button"] button').first().innerText({ timeout: 2000 }));
}

/**
 * Move the open work package to a status, through its status menu (the statuses the workflow of the account's role
 * allows).
 *
 * Example #1: When I set the status of the work package to "In progress"
 * Example #2: When I set the status of the work package to "Closed"
 * Example #3: And we set the status of the work package to "On hold"
 * Example #4: When I set the status of the work package to "Rejected"
 * Example #5: Then I set the status of the work package to "New"
 *
 */
When(/^(I |we )*set the status of the work package to "([^"]*)"$/, async function (pronounCase, status) {
  openWorkPackage(this);
  await actOrExplain('set the status to', status, async () => {
    await this.page.locator('[data-test-selector="op-wp-status-button"] button').first().click({ timeout: budget(this) });
    await this.page.locator('.dropdown-menu button.menu-item, button.menu-item').filter({ hasText: exactly(status) }).first().click({ timeout: budget(this) });
  }, 'The status menu lists the statuses the workflow allows the account\'s role from the status the work package is in.');
  const result = await waitForValue(() => statusShown(this), (shown) => exactly(status).test(shown), budget(this));
  if (!result.ok) throw friendly({ message: `The status did not become "${status}": it shows "${result.value}".`, hint: 'The site may have refused the move (the workflow, or a field it asks for).' });
});

/**
 * Assert the status the open work package shows.
 *
 * Example #1: Then the status of the work package should be "In progress"
 * Example #2: Then the status of the work package should be "New"
 * Example #3: And the status of the work package should be "Closed"
 * Example #4: But the status of the work package should be "On hold"
 * Example #5: Then the status of the work package should be "Confirmed"
 *
 */
Then(/^the status of the work package should be "([^"]*)"$/, async function (status) {
  openWorkPackage(this);
  const result = await waitForValue(() => statusShown(this), (shown) => exactly(status).test(shown), budget(this));
  if (!result.ok) throw friendly({ message: `Expected the status "${status}", but the work package shows "${result.value}".`, hint: 'The status is the button at the top of the work package.' });
});

/**
 * Add a comment to the open work package through its activity, and wait until it is listed.
 *
 * Example #1: When I comment "Checked on the test site" on the work package
 * Example #2: When I comment "Webship test comment" on the work package
 * Example #3: And we comment "Ready for a review" on the work package
 * Example #4: When I comment "Done" on the work package
 * Example #5: Then I comment "Webship test reply" on the work package
 *
 */
When(/^(I |we )*comment "([^"]*)" on the work package$/, async function (pronounCase, text) {
  openWorkPackage(this);
  await actOrExplain('comment', text, async () => {
    await this.page.locator('[data-test-selector="op-open-work-package-journal-form-trigger"]').first().click({ timeout: budget(this) });
    const editor = this.page.locator('[data-test-selector="op-work-package-journal--new-comment-component"] [contenteditable="true"]').first();
    await editor.waitFor({ state: 'visible', timeout: budget(this) });
    await editor.click();
    await this.page.keyboard.type(text);
    await this.page.locator('[data-test-selector="op-submit-work-package-journal-form"]').first().click();
  }, 'The comment box ("Add a comment") shows to an account that may comment on the work package.');
  await assertPresence(this.page.locator('[data-test-selector="op-journal-notes-body"]').filter({ hasText: text }), null, {
    label: `the comment "${text}"`,
    hint: 'The comment was sent but is not listed: the site may have refused it.',
    timeout: budget(this),
  });
});

/**
 * Assert that the activity of the open work package lists a comment holding the text, written by an account when it
 * names one (its name as the site shows it).
 *
 * Example #1: Then the work package should show the comment "Checked on the test site"
 * Example #2: Then the work package should show the comment "Checked on the test site" by "Member Test"
 * Example #3: And the work package should show the comment "The script is in the project's repository"
 * Example #4: Then the work package should show the comment "Ready for a review" by "Owner Test"
 * Example #5: But the work package should show the comment "Done"
 *
 */
Then(/^the work package should show the comment "([^"]*)"(?: by "([^"]*)")?$/, async function (text, author) {
  openWorkPackage(this);
  const note = this.page.locator('[data-test-selector="op-journal-notes-body"]').filter({ hasText: text });
  await assertPresence(note, null, { label: `the comment "${text}"`, hint: 'The comments are in the activity of the work package (open it with When I open the work package "…").', timeout: budget(this) });
  if (!author) return;
  const by = await note.first().evaluate((el) => {
    // The journal the note belongs to: the nearest element above it with a notes header in it.
    let n = el.parentElement;
    while (n && !n.querySelector('[data-test-selector="op-journal-notes-header"]')) n = n.parentElement;
    return n ? (n.querySelector('[data-test-selector="op-journal-notes-header"]').textContent || '') : '';
  });
  if (!exactly(author).test(tidy(by)) && !tidy(by).toLowerCase().includes(author.toLowerCase())) {
    throw friendly({ message: `Expected the comment "${text}" to be by ${author}, but its header says "${tidy(by)}".`, hint: 'Give the name the site shows for the account ("Member Test").' });
  }
});

/**
 * Log time on the open work package through its "Log time" dialog: the hours ("0.5", "1", "1h 30m"), and a comment
 * when the step gives one. The day is today.
 *
 * Example #1: When I log "0.5" hours on the work package
 * Example #2: When I log "1" hours on the work package with the comment "Read the code"
 * Example #3: And we log "2" hours on the work package
 * Example #4: When I log "1.25" hours on the work package with the comment "Webship test time"
 * Example #5: Then I log "0.5" hours on the work package
 *
 */
When(/^(I |we )*log "([^"]*)" hours on the work package(?: with the comment "([^"]*)")?$/, async function (pronounCase, hours, comment) {
  openWorkPackage(this);
  await actOrExplain('log time', `${hours} hours`, async () => {
    await this.page.locator('a.icon-time[title="Log time"]').first().click({ timeout: budget(this) });
    const dialog = this.page.locator('dialog#time-entry-dialog[open]');
    await dialog.waitFor({ state: 'visible', timeout: budget(this) });
    await dialog.locator('#time_entry_hours_display').fill(hours);
    if (comment) await dialog.locator('#time_entry_comments').fill(comment);
    await dialog.locator('button[type="submit"]').first().click();
    await dialog.waitFor({ state: 'hidden', timeout: budget(this) });
  }, 'The "Log time" link shows beside the spent time to an account that may log time in the project.');
  await smartSettle(this.page, 1000);
});

/**
 * Assert the time spent on the open work package, as it shows it ("0.5h", "1h 30m").
 *
 * Example #1: Then the time spent on the work package should be "0.5h"
 * Example #2: Then the time spent on the work package should be "0h"
 * Example #3: And the time spent on the work package should be "1h"
 * Example #4: But the time spent on the work package should be "2h"
 * Example #5: Then the time spent on the work package should be "1.25h"
 *
 */
Then(/^the time spent on the work package should be "([^"]*)"$/, async function (spent) {
  openWorkPackage(this);
  const read = async () => tidy(await this.page.locator('a.time-logging--value, [data-field-name="spentTime"]').first().innerText({ timeout: 2000 }));
  let result = await waitForValue(read, (shown) => shown.replace(/\s+/g, '') === spent.replace(/\s+/g, ''), Math.min(budget(this), 5000));
  if (!result.ok) {
    // The sum is drawn when the page loads: a time logged a moment ago shows after a reload.
    await this.page.reload();
    await smartSettle(this.page, 1500);
    result = await waitForValue(read, (shown) => shown.replace(/\s+/g, '') === spent.replace(/\s+/g, ''), budget(this));
  }
  if (!result.ok) throw friendly({ message: `Expected the time spent "${spent}", but the work package shows "${result.value}".`, hint: 'The spent time is the sum of the time logged on the work package, as it shows it ("0.5h").' });
});

/**
 * Assign the open work package to someone who takes work packages in its project, by the name the site shows.
 *
 * Example #1: When I assign the work package to "Member Test"
 * Example #2: When I assign the work package to "Owner Test"
 * Example #3: And we assign the work package to "Member Test"
 * Example #4: Then I assign the work package to "Owner Test"
 * Example #5: When assign the work package to "Member Test"
 *
 */
When(/^(I |we )*assign the work package to "([^"]*)"$/, async function (pronounCase, name) {
  openWorkPackage(this);
  await actOrExplain('assign the work package to', name, async () => {
    await this.page.locator('[data-field-name="assignee"]').first().click({ timeout: budget(this) });
    const input = this.page.locator('op-user-autocompleter.assignee input, .assignee.op-autocompleter input').first();
    await input.waitFor({ state: 'visible', timeout: budget(this) });
    await input.fill(name);
    await this.page.locator('.ng-dropdown-panel .ng-option').filter({ hasText: name }).first().click({ timeout: budget(this) });
  }, 'The assignee field is editable for an account that may edit the work package, and lists the members who take work packages.');
  const result = await waitForValue(async () => tidy(await this.page.locator('[data-field-name="assignee"]').first().getAttribute('title', { timeout: 2000 })), (shown) => exactly(name).test(shown), budget(this));
  if (!result.ok) throw friendly({ message: `The work package was not assigned to ${name}: it shows "${result.value}".`, hint: 'Only a member whose role takes work packages can be assigned.' });
});

/**
 * Assert who the open work package is assigned to, by the name the site shows.
 *
 * Example #1: Then the work package should be assigned to "Member Test"
 * Example #2: Then the work package should be assigned to "Owner Test"
 * Example #3: And the work package should be assigned to "Member Test"
 * Example #4: But the work package should be assigned to "Owner Test"
 * Example #5: Then the work package should be assigned to "Member Test"
 *
 */
Then(/^the work package should be assigned to "([^"]*)"$/, async function (name) {
  openWorkPackage(this);
  const result = await waitForValue(async () => tidy(await this.page.locator('[data-field-name="assignee"]').first().getAttribute('title', { timeout: 2000 })), (shown) => exactly(name).test(shown), budget(this));
  if (!result.ok) throw friendly({ message: `Expected the work package to be assigned to ${name}, but it shows "${result.value || 'nobody'}".`, hint: 'The assignee is the field of that name among the work package\'s details.' });
});

// ---------------------------------------------------------------------------
// What an account may not do
// ---------------------------------------------------------------------------

/**
 * Assert that the account of the session may not move the open work package: its status button is off.
 *
 * Example #1: Then I should not be able to change the status of the work package
 * Example #2: Then we should not be able to change the status of the work package
 * Example #3: And I should not be able to change the status of the work package
 * Example #4: But I should not be able to change the status of the work package
 * Example #5: Then should not be able to change the status of the work package
 *
 */
Then(/^(I |we )*should not be able to change the status of the work package$/, async function (pronounCase) {
  openWorkPackage(this);
  const button = this.page.locator('[data-test-selector="op-wp-status-button"] button').first();
  await button.waitFor({ state: 'visible', timeout: budget(this) });
  if (!(await button.isDisabled())) throw friendly({ message: 'Expected the status of the work package to be read only, but its button can be pressed.', hint: 'A Reader may not change a work package; a Member and a Project admin may.' });
});

/**
 * Assert that the account of the session may not log time on the open work package: there is no "Log time".
 *
 * Example #1: Then I should not be able to log time on the work package
 * Example #2: Then we should not be able to log time on the work package
 * Example #3: And I should not be able to log time on the work package
 * Example #4: But I should not be able to log time on the work package
 * Example #5: Then should not be able to log time on the work package
 *
 */
Then(/^(I |we )*should not be able to log time on the work package$/, async function (pronounCase) {
  openWorkPackage(this);
  await this.page.locator('[data-field-name="subject"]').first().waitFor({ state: 'visible', timeout: budget(this) });
  if (await this.page.locator('a.icon-time[title="Log time"]').count()) throw friendly({ message: 'Expected no "Log time" on the work package, but it is there.', hint: 'Logging time takes the permission of a Member or a Project admin.' });
});

/**
 * Assert that the account of the session may not create a work package in a project: the list's create button is off
 * or not there.
 *
 * Example #1: Then I should not be able to create a work package in the project "webship-site"
 * Example #2: Then we should not be able to create a work package in the project "Webship site"
 * Example #3: And I should not be able to create a work package in the project "webship-site"
 * Example #4: But I should not be able to create a work package in the project "webship-site"
 * Example #5: Then should not be able to create a work package in the project "Webship site"
 *
 */
Then(/^(I |we )*should not be able to create a work package in the project "([^"]*)"$/, async function (pronounCase, which) {
  const project = await projectOf(this, which);
  await open(this, `/projects/${project.identifier}/work_packages`);
  const create = this.page.locator('button.add-work-package').first();
  await this.page.locator('.wp-table--row, .generic-table--empty-row, op-wp-table').first().waitFor({ state: 'attached', timeout: budget(this) }).catch(() => {});
  if ((await create.count()) && !(await create.isDisabled())) throw friendly({ message: `Expected no way to create a work package in ${project.name}, but its create button can be pressed.`, hint: 'A Reader may not add work packages; a Member and a Project admin may.' });
});

// ---------------------------------------------------------------------------
// What a scenario made goes after it
// ---------------------------------------------------------------------------

After(async function () {
  const made = (this.openproject && this.openproject.made) || new Set();
  for (const id of made) {
    try { await removeWorkPackage(this, id); } catch (e) { console.warn(`  could not remove the work package #${id} a scenario made: ${e.message}`); }
  }
  if (this.openproject) this.openproject.made = new Set();
});

AfterAll(async function () {
  await managerContexts.dispose();
});
