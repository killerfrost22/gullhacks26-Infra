import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { PHOTO_MAX_INPUT_BYTES, PhotoError, preparePhoto, sniffImageType } from './photo';

const ascii = (text: string) => [...text].map((char) => char.charCodeAt(0));

function ftyp(major: string, compatible: string[]): Uint8Array<ArrayBuffer> {
  const size = 16 + compatible.length * 4;
  return new Uint8Array([0, 0, 0, size, ...ascii('ftyp'), ...ascii(major), 0, 0, 0, 0, ...compatible.flatMap(ascii)]);
}

describe('sniffImageType', () => {
  test('recognizes JPEG, PNG, and WebP by their magic bytes', () => {
    assert.equal(sniffImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0, 0])), 'jpeg');
    assert.equal(sniffImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13])), 'png');
    assert.equal(sniffImageType(new Uint8Array([...ascii('RIFF'), 1, 2, 3, 4, ...ascii('WEBPVP8 ')])), 'webp');
  });

  test('flags HEIC and HEIF brands', () => {
    assert.equal(sniffImageType(ftyp('heic', ['mif1', 'heic'])), 'heic');
    assert.equal(sniffImageType(ftyp('mif1', ['heix'])), 'heic');
  });

  test('AVIF, video, and garbage are not accepted', () => {
    assert.equal(sniffImageType(ftyp('avif', ['mif1', 'miaf'])), null);
    assert.equal(sniffImageType(ftyp('mif1', ['avif'])), null);
    assert.equal(sniffImageType(ftyp('isom', ['mp41'])), null);
    assert.equal(sniffImageType(new TextEncoder().encode('%PDF-1.7 hello')), null);
    assert.equal(sniffImageType(new Uint8Array([0xff, 0xd8])), null);
    assert.equal(sniffImageType(new Uint8Array()), null);
  });
});

describe('preparePhoto', () => {
  test('refuses files over 15 MB before reading them', async () => {
    const file = new File([new Uint8Array(PHOTO_MAX_INPUT_BYTES + 1)], 'big.jpg', { type: 'image/jpeg' });
    await assert.rejects(preparePhoto(file), (error) => error instanceof PhotoError && error.code === 'TOO_LARGE');
  });

  test('rejects HEIC and non-images by content, not by name', async () => {
    const heic = new File([ftyp('heic', ['mif1'])], 'photo.jpg', { type: 'image/jpeg' });
    await assert.rejects(preparePhoto(heic), (error) => error instanceof PhotoError && error.code === 'HEIC');
    const text = new File(['not an image at all'], 'photo.jpg', { type: 'image/jpeg' });
    await assert.rejects(preparePhoto(text), (error) => error instanceof PhotoError && error.code === 'UNSUPPORTED');
  });
});
