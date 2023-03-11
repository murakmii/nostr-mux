import { normalizeWsURL } from './utils';

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

