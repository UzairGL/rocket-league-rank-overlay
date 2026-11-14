const test = require('node:test');
const assert = require('node:assert/strict');
const { iconPixels } = require('../src/main/trayIcon');

const pixel = (buf, size, x, y) => Array.from(buf.subarray((y * size + x) * 4, (y * size + x) * 4 + 4)); // B, G, R, A

test("l'icône fait la bonne taille en BGRA", () => {
  assert.equal(iconPixels(32).length, 32 * 32 * 4);
  assert.equal(iconPixels(16).length, 16 * 16 * 4);
});

test('le fond est transparent et le centre est coloré', () => {
  const buf = iconPixels(32);
  assert.equal(pixel(buf, 32, 0, 0)[3], 0);
  assert.equal(pixel(buf, 32, 31, 31)[3], 0);
  const mid = 16;
  const left = pixel(buf, 32, 8, mid);
  const right = pixel(buf, 32, 24, mid);
  assert.equal(left[3], 255);
  assert.equal(right[3], 255);
  assert.deepEqual(left.slice(0, 3), [0xb4, 0x5f, 0x1b]); // bleu (BGR)
  assert.deepEqual(right.slice(0, 3), [0x1f, 0x8a, 0xff]); // orange (BGR)
});
