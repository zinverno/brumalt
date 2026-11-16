import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

// Execute the actual workflow script; the stub forbids every GitHub mutation.
const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
const publish = workflow.split('      - name: Publish verified beta\n')[1]!.split('        run: |\n')[1]!
  .split('\n').map(line => line.replace(/^          /, '')).join('\n');
for (const kind of ['stable', 'beta', 'draft']) {
  test(`release workflow preserves an existing ${kind} release without mutations`, () => {
    const stub = `gh() {
      if [[ "$1 $2" != "release view" ]]; then echo 'Unexpected GitHub action' >&2; return 99; fi
      if [[ $# == 3 ]]; then return 0; fi
      if [[ "$*" == *isPrerelease* && "$RELEASE_KIND" == stable ]]; then echo false
      elif [[ "$RELEASE_KIND" == draft ]]; then echo false
      else echo true; fi
    }\n`;
    const result = spawnSync('bash', ['-c', stub + publish], {
      encoding: 'utf8', env: { ...process.env, RELEASE_KIND: kind },
    });
    assert.equal(result.status, kind === 'draft' ? 1 : 0, result.stderr);
    assert(!result.stderr.includes('Unexpected GitHub action'), result.stderr);
    if (kind !== 'draft') assert.match(result.stdout, /skipping publication/);
  });
}
