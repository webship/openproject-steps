'use strict';

// Backlog step definitions: the "Backlog and sprints" page of a project, what its backlog lists and what a sprint
// lists, and the state of a sprint. They only read: a work package moves into a sprint through the site, not here.

const { When, Then } = require('@cucumber/cucumber');
const { friendly } = require('webship-js/tests/step-definitions/webship');
const { budget, exactly, tidy, open, assertPresence, findProject } = require('./openproject-helpers');

/** The box of a sprint on the backlog page, by its name. */
function sprintBox(world, sprint) {
  return world.page.locator('#sprint_backlogs_container [id^="sprint_"][id$="_header"]').filter({ hasText: sprint }).locator('xpath=..');
}

/**
 * Open the "Backlog and sprints" page of a project: its backlog (the inbox and the buckets) beside its sprints.
 *
 * Example #1: When I open the backlog of the project "webship-site"
 * Example #2: When I open the backlog of the project "Webship site"
 * Example #3: And we open the backlog of the project "webship-site"
 * Example #4: Given I open the backlog of the project "webship-site"
 * Example #5: When open the backlog of the project "Webship site"
 *
 */
When(/^(I |we )*open the backlog of the project "([^"]*)"$/, async function (pronounCase, which) {
  const project = await findProject(this, which);
  this.openproject = Object.assign(this.openproject || {}, { project: project.identifier });
  await open(this, `/projects/${project.identifier}/backlogs`);
  await assertPresence(this.page.locator('#sprint_backlogs_container, #owner_backlogs_container'), null, {
    label: `the backlog of ${project.name}`,
    hint: 'The backlog is a module of the project (Backlogs): it must be on in the project, and the account must see it.',
    timeout: budget(this),
  });
});

/**
 * Assert that a sprint on the backlog page lists (or does not list) a work package, by its subject.
 *
 * Example #1: Then the sprint "Sprint 1" should list the work package "The greeting script says Helo instead of Hello"
 * Example #2: Then the sprint "Sprint 1" should not list the work package "The usage page spells greeting as greting"
 * Example #3: And the sprint "Sprint 1" should list the work package "Webship test task"
 * Example #4: But the sprint "Sprint 2" should not list the work package "Webship test task"
 * Example #5: Then the sprint "Sprint 1" should list the work package "The greeting script says Helo instead of Hello"
 *
 */
Then(/^the sprint "([^"]*)" should (not )?list the work package "([^"]*)"$/, async function (sprint, notCase, subject) {
  const box = sprintBox(this, sprint);
  await assertPresence(box, null, { label: `the sprint "${sprint}"`, hint: 'Open the backlog first with When I open the backlog of the project "…"; the sprints are on its right.', timeout: budget(this) });
  await assertPresence(box.locator('a[href*="/work_packages/"]').filter({ hasText: exactly(subject) }), notCase, {
    label: `the work package "${subject}" in the sprint "${sprint}"`,
    hint: notCase ? 'A work package leaves a sprint when it is moved to the backlog or another sprint.' : 'A work package is in a sprint when its Sprint field names it.',
    timeout: budget(this),
  });
});

/**
 * Assert that the backlog of the open backlog page (its inbox and buckets, not the sprints) lists (or does not list) a
 * work package, by its subject.
 *
 * Example #1: Then the backlog should list the work package "The usage page spells greeting as greting"
 * Example #2: Then the backlog should not list the work package "The greeting script says Helo instead of Hello"
 * Example #3: And the backlog should list the work package "Webship test task"
 * Example #4: But the backlog should not list the work package "Webship test task"
 * Example #5: Then the backlog should list the work package "A work package opened by someone outside the project"
 *
 */
Then(/^the backlog should (not )?list the work package "([^"]*)"$/, async function (notCase, subject) {
  await assertPresence(this.page.locator('#owner_backlogs_container'), null, { label: 'the backlog', hint: 'Open the backlog first with When I open the backlog of the project "…".', timeout: budget(this) });
  await assertPresence(this.page.locator('#owner_backlogs_container a[href*="/work_packages/"]').filter({ hasText: exactly(subject) }), notCase, {
    label: `the work package "${subject}" in the backlog`,
    hint: notCase ? 'A work package in a sprint is listed by the sprint, not by the backlog.' : 'The backlog lists the open work packages that are in no sprint.',
    timeout: budget(this),
  });
});

/**
 * Assert the state a sprint shows on the backlog page ("Active", "In planning", "Completed").
 *
 * Example #1: Then the sprint "Sprint 1" should be "Active"
 * Example #2: Then the sprint "Sprint 2" should be "In planning"
 * Example #3: And the sprint "Sprint 1" should be "Active"
 * Example #4: But the sprint "Sprint 0" should be "Completed"
 * Example #5: Then the sprint "Sprint 1" should be "Active"
 *
 */
Then(/^the sprint "([^"]*)" should be "([^"]*)"$/, async function (sprint, state) {
  const header = this.page.locator('#sprint_backlogs_container [id^="sprint_"][id$="_header"]').filter({ hasText: sprint }).first();
  await assertPresence(header, null, { label: `the sprint "${sprint}"`, hint: 'Open the backlog first with When I open the backlog of the project "…".', timeout: budget(this) });
  const text = tidy(await header.innerText());
  if (!text.toLowerCase().includes(state.toLowerCase())) throw friendly({ message: `Expected the sprint "${sprint}" to be "${state}", but its header says "${text}".`, hint: 'A sprint is In planning, Active or Completed.' });
});
