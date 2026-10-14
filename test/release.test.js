import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { rollChangelog } from '../.github/scripts/changelog-release.mjs';

const REPO = 'https://github.com/prohand/gladys-certificatexpiry';

test('the Unreleased section moves under the released version', () => {
  const before = [
    '# Changelog',
    '',
    '## [Unreleased]',
    '',
    '### Added',
    '',
    '- Something.',
    '',
    `[Unreleased]: ${REPO}/commits/main`,
    '',
  ].join('\n');
  const after = rollChangelog(before, '1.0.0', '2026-10-14');
  assert.match(
    after,
    /## \[Unreleased\]\n\n## \[1\.0\.0\] - 2026-10-14\n\n### Added\n\n- Something\./,
  );
  assert.match(after, new RegExp(`\\[Unreleased\\]: ${REPO}/compare/v1\\.0\\.0\\.\\.\\.HEAD`));
  assert.match(after, new RegExp(`\\[1\\.0\\.0\\]: ${REPO}/releases/tag/v1\\.0\\.0`));
});

test('the next release compares with the previous tag', () => {
  const before = [
    '## [Unreleased]',
    '',
    '- Fix.',
    '',
    '## [1.0.0] - 2026-10-14',
    '',
    `[Unreleased]: ${REPO}/compare/v1.0.0...HEAD`,
    `[1.0.0]: ${REPO}/releases/tag/v1.0.0`,
  ].join('\n');
  const after = rollChangelog(before, '1.0.1', '2026-10-15');
  assert.match(after, new RegExp(`\\[1\\.0\\.1\\]: ${REPO}/compare/v1\\.0\\.0\\.\\.\\.v1\\.0\\.1`));
});

test('an empty Unreleased section still names the release', () => {
  const after = rollChangelog('## [Unreleased]\n', '1.0.2', '2026-10-16');
  assert.match(after, /## \[1\.0\.2\] - 2026-10-16\n\n- Maintenance release/);
});

test('the changelog of the repository can be rolled', async () => {
  const text = await readFile(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
  assert.match(text, /^## \[Unreleased\]$/m, 'the Release workflow needs this heading');
  assert.match(text, new RegExp(`^\\[Unreleased\\]: ${REPO}/`, 'm'));
});
