# Testing Guide

This project uses [Jest](https://jestjs.io/) for testing. The tests are located in the `src` directory, typically alongside the files they test (unit tests) or in the `tests` directory (integration tests).

## Prerequisites

Ensure you have installed the project dependencies:

```bash
npm install
```

## Running Tests

### Run All Tests

To run all tests in the project:

```bash
npm test
```

### Run Tests in Watch Mode

To run tests in watch mode (useful during development):

```bash
npm run test:watch
```

### Run Tests with Coverage

To generate a coverage report:

```bash
npm run test:coverage
```

### Run All Tests

```bash
npm run test:all
```

## Writing Tests

- **Unit Tests**: Should be placed alongside the source file with the extension `.test.ts`.
- **Integration Tests**: Should be placed in `src/tests` or equivalent directory.
- **Mocks**: Use `jest.mock()` to mock external dependencies and services like `anvilService` or `chopsticksService`.

## CI/CD

Tests are automatically run in the CI pipeline on every pull request. Ensure all tests pass before merging.
