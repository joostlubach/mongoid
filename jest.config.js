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
  testMatch: ['<rootDir>/src/**/*.test.ts'],
  testEnvironment: 'node'
}