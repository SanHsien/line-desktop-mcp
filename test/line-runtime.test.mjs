import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { PACKAGE_ROOT, runtimeRequire, configuredPythonPath } from '../src/extensions/line-runtime.mjs';

test('resolves runtime dependencies from this package root', () => {
  const expectedRoot = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
  assert.equal(PACKAGE_ROOT, expectedRoot);
  assert.equal(runtimeRequire().resolve('./package.json'), path.join(expectedRoot, 'package.json'));
});

test('optional Python requires an explicit absolute executable without shell or PATH interpretation', () => {
  for (const value of [undefined, '', 'python', 'python.exe', './python.exe', ' python.exe ', 'python.exe\0', 'C:/Tools/python.cmd']) {
    assert.equal(configuredPythonPath(value), null);
  }
  const executable = path.resolve('example-runtime', 'python.exe');
  assert.equal(configuredPythonPath(executable), executable);
});
