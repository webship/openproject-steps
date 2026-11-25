@work-packages
Feature: Work packages
  A member reads the list, opens a work package, moves it through the workflow, comments on it, logs time on it and
  assigns it; a new one is made through the form. What a scenario makes is removed after it.

  Background:
    Given I am a logged in user with the "member" user

  Scenario: The list shows a work package, and leaves it once it is closed
    Given there is a work package "Webship test list" in the project "webship-site"
    When I open the work packages of the project "webship-site"
    Then the work package list should show "Webship test list"
    When I open the work package "Webship test list"
    And I set the status of the work package to "Closed"
    Then the status of the work package should be "Closed"
    When I open the work packages of the project "webship-site"
    Then the work package list should not show "Webship test list"

  Scenario: A comment, the time logged and the assignee of a work package
    Given there is a work package "Webship test work" in the project "webship-site"
    When I open the work package "Webship test work"
    And I set the status of the work package to "In progress"
    And I comment "Checked on the test site" on the work package
    And I log "0.5" hours on the work package with the comment "Read the work package"
    And I assign the work package to "Member Test"
    Then the status of the work package should be "In progress"
    And the work package should show the comment "Checked on the test site" by "Member Test"
    And the time spent on the work package should be "0.5h"
    And the work package should be assigned to "Member Test"

  Scenario: A work package made through the form
    Given there is no work package "Webship test new" in the project "webship-site"
    When I create a work package "Webship test new" in the project "webship-site"
    Then the status of the work package should be "New"
    When I open the work packages of the project "webship-site"
    Then the work package list should show "Webship test new"
