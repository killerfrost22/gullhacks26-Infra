import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadConfig } from './config.js';

function load(env: NodeJS.ProcessEnv) {
  const warnings: string[] = [];
  const config = loadConfig(env, (message) => warnings.push(message));
  return { config, warnings };
}

test('defaults match .env.example when nothing is set', () => {
  const { config, warnings } = load({});
  assert.equal(config.host, '127.0.0.1');
  assert.equal(config.port, 8787);
  assert.equal(config.trustProxy, false);
  assert.equal(config.researchRateLimit, 5);
  assert.equal(config.captchaSecret, null);
  assert.match(config.distDir.replaceAll('\\', '/'), /\/dist$/);
  assert.deepEqual(warnings, []);
});

test('TRUST_PROXY: blank or false trusts nothing, true trusts every hop, a number is a hop count', () => {
  for (const [raw, expected] of [
    [undefined, false],
    ['', false],
    ['false', false],
    ['FALSE', false],
    ['true', true],
    ['1', 1],
    [' 2 ', 2],
    ['0', false],
  ] as const) {
    const { config, warnings } = load({ TRUST_PROXY: raw });
    assert.equal(config.trustProxy, expected, `TRUST_PROXY=${String(raw)}`);
    assert.deepEqual(warnings, []);
  }
});

test('TRUST_PROXY: anything else is ignored with a warning, never trusted', () => {
  for (const raw of ['yes', 'loopback', '10.0.0.1', '-1', '1.5']) {
    const { config, warnings } = load({ TRUST_PROXY: raw });
    assert.equal(config.trustProxy, false, `TRUST_PROXY=${raw}`);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /TRUST_PROXY/);
  }
});

test('RESEARCH_RATE_LIMIT must be a positive whole number', () => {
  assert.equal(load({ RESEARCH_RATE_LIMIT: '50' }).config.researchRateLimit, 50);
  for (const raw of ['0', '-3', 'lots', '2.5']) {
    const { config, warnings } = load({ RESEARCH_RATE_LIMIT: raw });
    assert.equal(config.researchRateLimit, 5, `RESEARCH_RATE_LIMIT=${raw}`);
    assert.equal(warnings.length, 1);
  }
});

test('HOST, PORT, and CAPTCHA_SECRET are read; a blank secret means a random one', () => {
  const { config } = load({ HOST: '0.0.0.0', PORT: '8791', CAPTCHA_SECRET: '  s3cret  ' });
  assert.equal(config.host, '0.0.0.0');
  assert.equal(config.port, 8791);
  assert.equal(config.captchaSecret, 's3cret');
  assert.equal(load({ CAPTCHA_SECRET: '   ' }).config.captchaSecret, null);
  const bad = load({ PORT: 'eighty' });
  assert.equal(bad.config.port, 8787);
  assert.equal(bad.warnings.length, 1);
});
