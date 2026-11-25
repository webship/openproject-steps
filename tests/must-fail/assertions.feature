@must-fail
Feature: Assertions that must fail
  Each scenario asserts something that is not true on the test site: its last step must fail with the message its
  description announces, and a hint. The scenarios only read; tests/check-must-fail.js runs them.

  Scenario: A session that is not the account named
    Fails with: Expected the session to be "Owner Test", but it is Member Test (login "member").
    Given I am a logged in user with the "member" user
    Then I should be logged in as "Owner Test"

  Scenario: A login that worked is not refused
    Fails with: Expected the login to be refused with "Invalid user or password", but the page shows no error
    Given I am not logged in
    When I log in with the "member" user
    Then the login should be refused with "Invalid user or password"

  Scenario: A work package the list does not show
    Fails with: Expected to see the work package "Webship test nothing" in the list
    Given I am a logged in user with the "member" user
    When I open the work packages of the project "webship-site"
    Then the work package list should show "Webship test nothing"

  Scenario: A status the work package is not in
    Fails with: Expected the status "Closed", but the work package shows "In progress".
    Given I am a logged in user with the "member" user
    When I open the work package "The greeting script says Helo instead of Hello"
    Then the status of the work package should be "Closed"

  Scenario: A comment the work package does not have
    Fails with: Expected to see the comment "Webship test nothing"
    Given I am a logged in user with the "member" user
    When I open the work package "The greeting script says Helo instead of Hello"
    Then the work package should show the comment "Webship test nothing"

  Scenario: A member who may change the status
    Fails with: Expected the status of the work package to be read only, but its button can be pressed.
    Given I am a logged in user with the "member" user
    When I open the work package "The greeting script says Helo instead of Hello"
    Then I should not be able to change the status of the work package

  Scenario: A project a member may open
    Fails with: Expected the project Webship site to be refused, but the site answered 200
    Given I am a logged in user with the "member" user
    Then I should be refused the project "webship-site"

  Scenario: A work package the sprint does not hold
    Fails with: Expected to see the work package "The usage page spells greeting as greting" in the sprint "Sprint 1"
    Given I am a logged in user with the "member" user
    When I open the backlog of the project "webship-site"
    Then the sprint "Sprint 1" should list the work package "The usage page spells greeting as greting"

  Scenario: A sprint in another state
    Fails with: Expected the sprint "Sprint 1" to be "Completed"
    Given I am a logged in user with the "member" user
    When I open the backlog of the project "webship-site"
    Then the sprint "Sprint 1" should be "Completed"
