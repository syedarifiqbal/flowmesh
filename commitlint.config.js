/** @type {import('@commitlint/types').UserConfig} */
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [
      2,
      'always',
      [
        // services
        'ingestion',
        'pipeline',
        'delivery',
        'auth',
        'analytics',
        'alert',
        'config',
        'gateway',
        // shared / infra
        'shared-types',
        'docker',
        'makefile',
        'prisma',
        'ci',
        'deps',
        'docs',
      ],
    ],
    'scope-empty': [2, 'never'],
    'subject-case': [2, 'always', 'lower-case'],
    'header-max-length': [2, 'always', 100],
  },
}
