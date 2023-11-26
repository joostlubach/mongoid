module.exports = {
  extends: '../../.eslintrc.client.yml',
  ignorePatterns: ['/.eslintrc.js'],
  parserOptions: {
    project: './tsconfig.json',
    tsconfigRootDir: __dirname,
  }
}