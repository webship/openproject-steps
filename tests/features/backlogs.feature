@backlogs
Feature: The backlog and its sprints
  The sample project's active sprint lists the work package planned in it, and the backlog lists the others.

  Scenario: The active sprint and the backlog
    Given I am a logged in user with the "member" user
    When I open the backlog of the project "webship-site"
    Then the sprint "Sprint 1" should be "Active"
    And the sprint "Sprint 1" should list the work package "The greeting script says Helo instead of Hello"
    And the sprint "Sprint 1" should not list the work package "The usage page spells greeting as greting"
    And the backlog should list the work package "The usage page spells greeting as greting"
    And the backlog should not list the work package "The greeting script says Helo instead of Hello"
