module.exports = {
  extends: '../../.eslintrc.yml',
  ignorePatterns: ['/.eslintrc.js'],
  parserOptions: {
    project: './tsconfig.json',
    tsconfigRootDir: __dirname,
  }
}