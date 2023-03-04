import { validateEvent, generateID, verifyEvent } from './event';

test.each([
  {
    event: 'not object',
    expected: 'event is NOT object',
  },
  {
    event: [],
    expected: 'event is NOT object',
  },
  {
    event: { id: 123 },
    expected: 'id property is invalid',
  },
  {
    event: { id: 'abc' },
    expected: 'id property is invalid',
  },
  {
    event: { id: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdeF' },
    expected: 'id property is invalid',
  },
  {
    event: { 
      id: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      pubkey: 123,
    },
    expected: 'pubkey property is invalid',
  },
  {
    event: { 
      id: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      pubkey: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdeF',
    },
    expected: 'pubkey property is invalid',
  },
  {
    event: { 
      id: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      pubkey: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      created_at: '123',
    },
    expected: 'created_at property is invalid',
  },
  {
    event: { 
      id: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      pubkey: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      created_at: 12345678,
      kind: 'k',
    },
    expected: 'kind property is invalid',
  },
  {
    event: { 
      id: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      pubkey: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      created_at: 12345678,
      kind: 1.1,
    },
    expected: 'kind property is invalid',
  },
  {
    event: { 
      id: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      pubkey: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      created_at: 12345678,
      kind: 1,
      tags: 'tags'
    },
    expected: 'tags property is invalid',
  },
  {
    event: { 
      id: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      pubkey: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      created_at: 12345678,
      kind: 1,
      tags: [[]]
    },
    expected: 'tags property is invalid',
  },
  {
    event: { 
      id: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      pubkey: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      created_at: 12345678,
      kind: 1,
      tags: [['r']]
    },
    expected: 'tags property is invalid',
  },
  {
    event: { 
      id: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      pubkey: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      created_at: 12345678,
      kind: 1,
      tags: [[123]]
    },
    expected: 'tags property is invalid',
  },
  {
    event: { 
      id: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      pubkey: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      created_at: 12345678,
      kind: 1,
      tags: [[123]]
    },
    expected: 'tags property is invalid',
  },
  {
    event: { 
      id: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      pubkey: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      created_at: 12345678,
      kind: 1,
      tags: [['e', 123]]
    },
    expected: 'tags property is invalid',
  },
  {
    event: { 
      id: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      pubkey: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      created_at: 12345678,
      kind: 1,
      tags: [['e', '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdeF']]
    },
    expected: 'tags property is invalid',
  },
  {
    event: { 
      id: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      pubkey: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      created_at: 12345678,
      kind: 1,
      tags: [['e', '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'], ['p', 123]]
    },
    expected: 'tags property is invalid',
  },
  {
    event: { 
      id: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      pubkey: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      created_at: 12345678,
      kind: 1,
      tags: [['e', '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'], ['p', '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdeF']]
    },
    expected: 'tags property is invalid',
  },
  {
    event: { 
      id: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      pubkey: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      created_at: 12345678,
      kind: 1,
      tags: [['e', '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'], ['p', '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'], ['r', 'http://dummy']],
      content: 123,
    },
    expected: 'content property is invalid',
  },
  {
    event: { 
      id: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      pubkey: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      created_at: 12345678,
      kind: 1,
      tags: [['e', '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'], ['p', '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'], ['r', 'http://dummy']],
      content: "hello",
      sig: 123,
    },
    expected: 'sig property is invalid',
  },
  {
    event: { 
      id: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      pubkey: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      created_at: 12345678,
      kind: 1,
      tags: [['e', '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'], ['p', '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'], ['r', 'http://dummy']],
      content: "hello",
      sig: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdeF',
    },
    expected: 'sig property is invalid',
  },
  {
    event: { 
      id: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      pubkey: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      created_at: 12345678,
      kind: 1,
      tags: [['e', '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'], ['p', '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'], ['r', 'http://dummy']],
      content: "hello",
      sig: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    },
    expected: { 
      id: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      pubkey: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      created_at: 12345678,
      kind: 1,
      tags: [['e', '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'], ['p', '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'], ['r', 'http://dummy']],
      content: "hello",
      sig: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    },
  },
])('validateEvent($event)', ({ event, expected }) => {
  expect(validateEvent(event)).toEqual(expected);
});

test('generateID', async () => {
  const got = await generateID({
    pubkey: 'fc137c5bb32f96849dff141bdf94c9e9426eeae0ecc1d2e67aa69bf8d04b2f1e',
    created_at: 1677297041,
    kind: 1,
    tags: [],
    content: 'hello, jest',
  });

  expect(got).toBe('75a1b3c28b7082e0c74c43f2f1d917217c9fd8d73017688c8ac4c70bb2966b56');
});

test.each([
  {
    event: 'unknown',
    expected: 'failed to verify event: event is NOT object',
  },
  {
    event: {
      id: 'badbadbadb7082e0c74c43f2f1d917217c9fd8d73017688c8ac4c70bb2966b56',
      pubkey: 'fc137c5bb32f96849dff141bdf94c9e9426eeae0ecc1d2e67aa69bf8d04b2f1e',
      created_at: 1677297041,
      kind: 1,
      tags: [],
      content: 'hello, jest',
      sig: '3451d8cfb61324ca23ee2b093058e79ab8b271acce7a2456a560ee36a517e13f90ae92f44d69f14ce75b8414a9ceeb7e781054ca9414a50052e07bf19ea24cdf',
    },
    expected: 'failed to verify event: id property is invalid',
  },
  {
    event: {
      id: '75a1b3c28b7082e0c74c43f2f1d917217c9fd8d73017688c8ac4c70bb2966b56',
      pubkey: 'fc137c5bb32f96849dff141bdf94c9e9426eeae0ecc1d2e67aa69bf8d04b2f1e',
      created_at: 1677297041,
      kind: 1,
      tags: [],
      content: 'hello, jest',
      sig: '3451d8cfb61324ca23ee2b093058e79ab8b271acce7a2456a560ee36a517e13f90ae92f44d69f14ce75b8414a9ceeb7e781054ca9414a50052e07bf19ea24cdf',
    },
    expected: {
      id: '75a1b3c28b7082e0c74c43f2f1d917217c9fd8d73017688c8ac4c70bb2966b56',
      pubkey: 'fc137c5bb32f96849dff141bdf94c9e9426eeae0ecc1d2e67aa69bf8d04b2f1e',
      created_at: 1677297041,
      kind: 1,
      tags: [],
      content: 'hello, jest',
      sig: '3451d8cfb61324ca23ee2b093058e79ab8b271acce7a2456a560ee36a517e13f90ae92f44d69f14ce75b8414a9ceeb7e781054ca9414a50052e07bf19ea24cdf',
    },
  },  
])('verifyEvent($event)', async ({ event, expected }) => {
  expect(await verifyEvent(event)).toEqual(expected);
});
