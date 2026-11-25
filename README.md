<p align="center"><img src="https://raw.githubusercontent.com/webship/openproject-steps/2.0.x/assets/logo.svg" alt="OpenProject logo" width="96"></p>

# openproject-steps

[![Test](https://github.com/webship/openproject-steps/actions/workflows/test.yml/badge.svg)](https://github.com/webship/openproject-steps/actions/workflows/test.yml)

Cucumber step definitions for testing OpenProject, the open-source project management software, with
[webship-js](https://webship.co/docs/webship-js/2.0.x), a BDD browser automation harness built on Playwright and
Cucumber-js. The pack covers what a project's work goes through:

- **logging in and out**: an account of the users registry by its handle, the login form, a refused login, who the
  session is, logging out;
- **a project**: opened by its identifier or its name, and refused to an account with no membership;
- **the work package list** of a project, and **one work package**: its status through the workflow, a comment, the
  time logged on it, its assignee;
- **a new work package** made through the form;
- **the backlog and its sprints**: what a sprint lists, what the backlog lists, the state of a sprint;
- **what an account may not do**: a Reader's status button, "Log time" and the create button.

The steps make and remove their test content through the site's own API, as a managing account (a Project admin):
a work package a scenario makes goes after it, with the time logged on it, so a run leaves the site as it found it.

No step phrase names the platform: a scenario reads `When I set the status of the work package to "In progress"` and
`Then the sprint "Sprint 1" should list the work package "…"`.

CI builds a real OpenProject site with [DDEV](https://ddev.com) on the runner (the publisher's image on the project's
own PostgreSQL, the accounts of the suite, the sample content), runs the whole suite against it twice on every push
and pull request, checks after each run that the site holds what it held before, then runs the assertions that must
fail; see [The test site](#the-test-site) and [`.github/workflows/test.yml`](.github/workflows/test.yml).

## Logging in first

Every scenario starts by logging in, so these are the steps to know first:

| Step | What it does |
| --- | --- |
| `Given I am a logged in user with the "member" user` | Logs in as an account of the users registry, by its handle. The first time in a run through the login form, then its session is put back. The welcome dialog of a first login and the introduction tour are closed when they show |
| `When I log in with the "member" user` | Fills and submits the login form with the account's login and password, and asserts nothing: for scenarios about the login itself |
| `When I log in as "member" with the password "wrong"` | The same with a login and a password as typed |
| `Given I am not logged in` | The browser forgets its session |
| `When I log out` | Logs out through the site, and waits until the session is a visitor's |
| `Then I should be logged in as "Member Test"` | The session is the account's: its name as the site shows it, or its login (`"member"`) |
| `Then I should not be logged in` | The session is a visitor's |
| `Then the login should be refused with "Invalid user or password"` | The login form refused the last login with that message (give the scenario `@js-off`: the browser logs the refused request) |

```gherkin
Scenario: An account logs in through the form and out again
  Given I am not logged in
  When I log in with the "member" user
  Then I should be logged in as "Member Test"
  When I log out
  Then I should not be logged in
```

## From nothing to a green run

What the machine needs: Docker, [DDEV](https://ddev.com), git, python3, and Node.js 24 or later with npm. OpenProject
and its database run in DDEV's containers.

**1. The site.** The pack's own build script (the one CI runs) makes the site in a DDEV project: the publisher's image
(`openproject/openproject:17.9.8`, `OPENPROJECT_VERSION` for another release) on PostgreSQL 17, the four accounts of
[Test users](#test-users), and the sample content (see [The test site](#the-test-site)). It takes about two minutes
once the image is pulled (about 2 GB); a running site takes about 2 GB of memory.

```bash
git clone https://github.com/webship/openproject-steps.git
SITE_DIR="$PWD/openproject-site" openproject-steps/.github/scripts/build-ddev-site.sh
```

The site answers at `https://openprojectsteps.ddev.site`. In the
[Webship Workspace](https://github.com/webship/workspace), its OpenProject plugin builds the same site in a sites
folder, on DDEV or on Docker Compose, and wires this pack into the testing setup of the site:

```bash
bash core/scripts/plugins.sh --require openproject --with-needs
bash core/scripts/plugins.sh --activate openproject --with-needs
bash core/scripts/plugins.sh --install openproject
bash dev/cmd-openproject-project.sh opsite --install --add-users --sample-content
bash dev/cmd-tools-testing.sh opsite --run
```

**2. A test project.**

```bash
mkdir openproject-tests && cd openproject-tests
npm init -y
npm install --save-dev webship-js @webship-js/openproject-steps
npx init-webship-js
```

**3. `cucumber.js`.** Add the pack's step definitions after webship-js's own, and give the world its parameters:

```javascript
require: [
  'node_modules/webship-js/tests/step-definitions/**/*.js',
  'node_modules/@webship-js/openproject-steps/tests/step-definitions/**/*.js',
],
tags: process.env.CUCUMBER_TAGS || 'not @wip and not @must-fail',
worldParameters: {
  launchUrl: process.env.LAUNCH_URL || 'https://openprojectsteps.ddev.site',
  // The account that makes and removes test content through the site's API: a Project admin of the projects used.
  manager: process.env.MANAGER || 'owner',
  // The project a step works in when it names none (its identifier).
  project: process.env.PROJECT || 'webship-site',
  users: {
    owner: { username: process.env.OPENPROJECT_OWNER_USER || 'owner', password: process.env.OPENPROJECT_OWNER_PASSWORD, name: 'Owner Test' },
    member: { username: process.env.OPENPROJECT_MEMBER_USER || 'member', password: process.env.OPENPROJECT_MEMBER_PASSWORD, name: 'Member Test' },
    reader: { username: process.env.OPENPROJECT_READER_USER || 'reader', password: process.env.OPENPROJECT_READER_PASSWORD, name: 'Reader Test' },
    stranger: { username: process.env.OPENPROJECT_STRANGER_USER || 'stranger', password: process.env.OPENPROJECT_STRANGER_PASSWORD, name: 'Stranger Test' },
  },
  // … webship-js's own parameters (minWaitTime, screenshot, javascript …)
},
```

This repository's own [`cucumber.js`](cucumber.js) is a whole example.

**4. Run.**

```bash
npx cucumber-js                                      # every feature
npx cucumber-js tests/features/work-packages.feature # one feature
CUCUMBER_TAGS=@backlogs npx cucumber-js              # one tag
```

## Steps

### Projects

| Step | What it does |
| --- | --- |
| `When I open the project "webship-site"` | Opens the project's overview, by its identifier or its name ("Webship site") |
| `Then I should be refused the project "webship-site"` | The session may not open the project: the site answers "not found" (`@js-off`) |

### Test content

| Step | What it does |
| --- | --- |
| `Given there is a work package "Webship test …" in the project "webship-site"` | Makes it through the API as the managing account (one of the subject left by a stopped run goes first). It goes after the scenario |
| `Given there is no work package "Webship test …" in the project "webship-site"` | Removes any of the subject, with the time logged on it |

The project part is optional in both: the last project the scenario used, else `worldParameters.project`.

### The work package list

| Step | What it does |
| --- | --- |
| `When I open the work packages of the project "webship-site"` | The project's list (its default view: the open work packages) |
| `Then the work package list should show "…"` / `should not show "…"` | A row of the subject is (not) in the list on screen |
| `When I create a work package "Webship test …" in the project "webship-site"` | Through the form of a new work package (the project's default type), saved. It goes after the scenario |

### One work package

| Step | What it does |
| --- | --- |
| `When I open the work package "…"` | Opens it by its subject, at its activity |
| `When I set the status of the work package to "In progress"` | Through its status menu: the statuses the workflow of the account's role allows |
| `Then the status of the work package should be "In progress"` | The status it shows |
| `When I comment "…" on the work package` | Adds a comment through its activity, and waits until it is listed |
| `Then the work package should show the comment "…"` (`… by "Member Test"`) | The activity lists the comment, written by that account when one is named |
| `When I log "0.5" hours on the work package` (`… with the comment "…"`) | Through its "Log time" dialog, for today |
| `Then the time spent on the work package should be "0.5h"` | The spent time as it shows it |
| `When I assign the work package to "Member Test"` | Through its assignee field: someone who takes work packages in its project |
| `Then the work package should be assigned to "Member Test"` | The assignee it shows |

### What an account may not do

| Step | What it does |
| --- | --- |
| `Then I should not be able to change the status of the work package` | Its status button cannot be pressed (a Reader) |
| `Then I should not be able to log time on the work package` | There is no "Log time" |
| `Then I should not be able to create a work package in the project "webship-site"` | The list's create button is off or not there |

### The backlog and its sprints

| Step | What it does |
| --- | --- |
| `When I open the backlog of the project "webship-site"` | The project's "Backlog and sprints" page |
| `Then the sprint "Sprint 1" should be "Active"` | The state the sprint shows (In planning, Active, Completed) |
| `Then the sprint "Sprint 1" should list the work package "…"` / `should not list "…"` | What the sprint lists |
| `Then the backlog should list the work package "…"` / `should not list "…"` | What the backlog (its inbox and buckets) lists |

Every step carries five example phrasings in its JSDoc, and `npm run test:examples` checks that each one matches its
own step only.

## Rules of a suite

- Log in by a handle of the users registry; never write a password into a feature.
- Never create or delete an account in a suite: accounts are configuration, made by the build of the site.
- Change only what the scenario made: a status, a comment, the time and an assignee go on a work package of
  `Given there is a work package "…"`, which goes after the scenario with all of it. A comment cannot be taken back.
- Name test content "Webship test …". A run that was stopped half way leaves its work packages; the Workspace's
  `cmd-tools-openproject-cli.sh <site> --tidy` removes them, or delete them as the managing account.
- A refusal the site answers with an error status (a wrong password, a project an account may not open) makes the
  browser log a failed request: give those scenarios `@js-off`.

## Test users

The accounts the features log in as, each with the password `dD.123123ddd` and its first login done:

| Handle | Login | Name | Role in Webship site |
| --- | --- | --- | --- |
| `owner` | `owner` | Owner Test | Project admin (the managing account) |
| `member` | `member` | Member Test | Member |
| `reader` | `reader` | Reader Test | Reader |
| `stranger` | `stranger` | Stranger Test | No membership |

## The test site

`.github/scripts/build-ddev-site.sh` builds it, and `COUNTS_ONLY=1` makes it print what the site holds (work
packages, comments, journals, time entries, sprints, members, users, notifications, attachments): CI compares them
before and after each run. The sample content, in the project Webship site (`webship-site`):

- "The greeting script says Helo instead of Hello": a Task by the owner, In progress, assigned to Member Test, in the
  active sprint "Sprint 1", with a comment;
- "The usage page spells greeting as greting": a Bug by the member, in the backlog;
- "A work package opened by someone outside the project": opened by the stranger.

The features read them and never change them.

## The assertions that must fail

`tests/must-fail/` holds scenarios that assert something that is not true on the test site; `npm run test:must-fail`
runs them and checks that each fails at its last step with the message its description announces, and a hint. A step
that cannot fail proves nothing.

## Logo

The logo is OpenProject's, from [Simple Icons](https://simpleicons.org) (`openproject.svg`, CC0 1.0, its source
https://www.openproject.org/press/), in its brand colour. OpenProject is a trademark of its owner; the logo names the
platform the pack tests.

## License

MIT (see `LICENSE`).
