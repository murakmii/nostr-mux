import { normalizeWsURL, decodeBech32ID, encodeBech32ID, Bech32IDPrefix } from './utils';

test.each([
  { url: 'ws://host', expected: 'ws://host' },
  { url: 'wss://host', expected: 'wss://host' },
  { url: 'wss://host/?', expected: 'wss://host' },
  { url: 'wss://host/foo/', expected: 'wss://host/foo/' },
  { url: 'wss://host/foo/bar?c=d&a=b', expected: 'wss://host/foo/bar?a=b&c=d' },

  { url: '?', expected: undefined },
  { url: 'http://host', expected: undefined },
])('normalizwWsURL($url)', ({ url, expected }: { url: string, expected: string | undefined }) => {
  expect(normalizeWsURL(url)).toEqual(expected);
});

test.each([
  { bech32: '', expected: undefined },
  { bech32: 'qqqqqqqqqqq', expected: undefined },
  { bech32: 'こんにちは', expected: undefined },
  { 
    bech32: 'npub1rpqr4ygerl4357lsn02c8cm8qq4tv55tapnmmnslld37prkcprzs0flhga', 
    expected: {
      hexID: '18403a91191feb1a7bf09bd583e367002ab6528be867bdce1ffb63e08ed808c5',
      prefix: 'npub',
    }
  }
])('decodeBech32ID($bech32)', ({ bech32, expected }) => {
  expect(decodeBech32ID(bech32)).toEqual(expected);
});

test.each([
  {
    prefix: 'npub' as Bech32IDPrefix,
    hexID: 'xx',
    expected: undefined
  },
  {
    prefix: 'npub' as Bech32IDPrefix,
    hexID: 'こんにちは',
    expected: undefined
  },
  {
    prefix: 'npub' as Bech32IDPrefix,
    hexID: '18403a91191feb1a7bf09bd583e367002ab6528be867bdce1ffb63e08ed808c5',
    expected: 'npub1rpqr4ygerl4357lsn02c8cm8qq4tv55tapnmmnslld37prkcprzs0flhga'
  },
])('encodeBech32ID($prefix, $hexID)', ({ prefix, hexID, expected }) => {
  expect(encodeBech32ID(prefix, hexID)).toEqual(expected);
});
