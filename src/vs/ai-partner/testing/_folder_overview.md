# Folder: src/vs/ai-partner/testing

## Role
This directory holds tests specifically for the AI Partner feature. It includes both unit tests for individual components and integration tests for verifying the interactions between them.

## File Breakdown
- **`UnitTests.test.ts`**: Contains unit tests for specific functions and classes within the AI Partner codebase. This is for testing components in isolation.
- **`IntegrationTests.test.ts`**: Contains integration tests that verify the collaboration between multiple components, such as the communication between an agent and a service, or the full flow from a UI interaction to an agent action.

## AI Reading Guide
- Read these test files to understand the expected behavior of the AI Partner's components and how they are intended to be used.
- Before making changes to any component, run the tests in this folder to ensure you haven't introduced a regression.
- Add new tests here when developing new features for the AI Partner.
