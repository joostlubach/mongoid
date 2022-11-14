module.exports = {
  preset:          'ts-jest',
  testEnvironment: 'node',

  setupFiles: [
    // '<rootDir>/tests/setup.ts',
  ],
  setupFilesAfterEnv: [
    // '<rootDir>/tests/helpers/index.ts',
  ],

  moduleDirectories: ['<rootDir>/..', 'node_modules'],

  roots: ['<rootDir>/tests'],

  testMatch: [
    '<rootDir>/tests/**/*Test.ts',
    '<rootDir>/tests/**/*-test.ts',
  ],
};