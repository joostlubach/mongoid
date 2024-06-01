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
  testMatch: process.env.INTEGRATION_TESTS ? ['**/*.integrationtest.ts'] : ['**/*.test.ts'],
  testEnvironment: 'node'
}