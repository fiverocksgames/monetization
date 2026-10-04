import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const policy = JSON.parse(
  readFileSync(new URL('../../../config/public-mock-assets.json', import.meta.url), 'utf8')
);

test('canonical public mock asset policy pins the verified binary and stable destination', () => {
  assert.equal(policy.schemaVersion, 1);
  assert.equal(policy.assetId, 'h5-dev-mock-rewarded-v1');
  assert.equal(policy.purpose, 'development-only-mock-ad');
  assert.equal(policy.sourcePath, 'lab/h5-ads/assets/mock/h5-dev-mock-rewarded-v1.mp4');
  assert.equal(policy.sourceOriginalFilename, '265552.mp4');
  assert.equal(policy.sourceSize, 1474966);
  assert.equal(
    policy.sha256,
    '415a558abb5208a7c253de7570482555df2eb2ffcec3ecf614cdbac98da8c9ca'
  );
  assert.equal(policy.publicRepository, 'fiverocksgames/monetization');
  assert.equal(policy.publicPath, 'assets/mock/h5-dev-mock-rewarded-v1.mp4');
  assert.equal(
    policy.canonicalUrl,
    'https://fiverocksgames.github.io/monetization/assets/mock/h5-dev-mock-rewarded-v1.mp4'
  );
  assert.ok(['blocked-pending-rights', 'approved'].includes(policy.publicationStatus));
});

test('canonical public mock asset cannot be approved without durable HTTPS rights evidence', () => {
  if (policy.publicationStatus === 'approved') {
    assert.equal(typeof policy.rightsBasisRef, 'string');
    assert.match(policy.rightsBasisRef, /^https:\/\/\S+$/);
  } else {
    assert.equal(policy.publicationStatus, 'blocked-pending-rights');
    assert.equal(policy.rightsBasisRef, null);
  }
});
