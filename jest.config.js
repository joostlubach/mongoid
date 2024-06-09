/** @type {import('@jest/types').Config.InitialOptions} */
module.exports = {
  preset: 'ts-jest',
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          moduleResolution: 'Node',
        },
        isolatedModules: true
      }
    ],
  },

  globalTeardown: '<rootDir>/src/__tests__/teardown.ts',
  testMatch: process.env.INTEGRATION_TESTS ? ['**/*.integrationtest.ts'] : ['**/*.test.ts'],
  testEnvironment: 'node'
}