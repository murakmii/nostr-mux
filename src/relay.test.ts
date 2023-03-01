import { validateRelayMessage } from './relay';

test.each([
    { message: '{', expected: 'invalid json' },
    { message: '"not array"', expected: 'NOT array' },
    { message: '[]', expected: 'empty array' },
    { message: '["NOTICE","msg"]', expected: { type: 'NOTICE', message: 'msg' } },
    { message: '["NOTICE"]', expected: 'invalid NOTICE' },
    { message: '["NOTICE","msg","msg2"]', expected: 'invalid NOTICE' },
    { message: '["NOTICE",123]', expected: 'invalid NOTICE' },
    { message: '["EOSE","sub"]', expected: { type: 'EOSE', subscriptionID: 'sub' } },
    { message: '["EOSE"]', expected: 'invalid EOSE' },
    { message: '["EOSE","sub","sub2"]', expected: 'invalid EOSE' },
    { message: '["EOSE",123]', expected: 'invalid EOSE' },
    { message: '["OK","m1",true,"m2"]', expected: { type: 'OK', eventID: 'm1', accepted: true, message: 'm2' } },
    { message: '["OK","m1",false,"m2"]', expected: { type: 'OK', eventID: 'm1', accepted: false, message: 'm2' } },
    { message: '["OK"]', expected: 'invalid OK' },
    { message: '["OK","m1"]', expected: 'invalid OK' },
    { message: '["OK","m1",true]', expected: 'invalid OK' },
    { message: '["OK","m1",true,"m2","m3"]', expected: 'invalid OK' },
    { message: '["OK",123,true,"m2"]', expected: 'invalid OK' },
    { message: '["OK","m1",123,"m2"]', expected: 'invalid OK' },
    { message: '["OK","m1",true,123]', expected: 'invalid OK' },
    { message: '["NEWSPEC"]', expected: 'unsupported message(NEWSPEC)' },
    { message: '["EVENT"]', expected: 'invalid EVENT' },
    { message: '["EVENT",123,"event"]', expected: 'invalid EVENT' },
    {
      message: JSON.stringify([
        'EVENT',
        'sub',
        {
          id: '75a1b3c28b7082e0c74c43f2f1d917217c9fd8d73017688c8ac4c70bb2966b56',
          pubkey: 'fc137c5bb32f96849dff141bdf94c9e9426eeae0ecc1d2e67aa69bf8d04b2f1e',
          created_at: 1677297041,
          kind: 1,
          tags: [],
          content: 'mismatch signature',
          sig: '3451d8cfb61324ca23ee2b093058e79ab8b271acce7a2456a560ee36a517e13f90ae92f44d69f14ce75b8414a9ceeb7e781054ca9414a50052e07bf19ea24cdf',
        },
      ]),
      expected: 'invalid EVENT(failed to verify event: id property is invalid)',
    },
    {
      message: JSON.stringify([
        'EVENT',
        'sub',
        {
          id: '75a1b3c28b7082e0c74c43f2f1d917217c9fd8d73017688c8ac4c70bb2966b56',
          pubkey: 'fc137c5bb32f96849dff141bdf94c9e9426eeae0ecc1d2e67aa69bf8d04b2f1e',
          created_at: 1677297041,
          kind: 1,
          tags: [],
          content: 'hello, jest',
          sig: '3451d8cfb61324ca23ee2b093058e79ab8b271acce7a2456a560ee36a517e13f90ae92f44d69f14ce75b8414a9ceeb7e781054ca9414a50052e07bf19ea24cdf',
        },
      ]),
      expected: {
          type: 'EVENT',
          subscriptionID: 'sub',
          event: {
            id: '75a1b3c28b7082e0c74c43f2f1d917217c9fd8d73017688c8ac4c70bb2966b56',
            pubkey: 'fc137c5bb32f96849dff141bdf94c9e9426eeae0ecc1d2e67aa69bf8d04b2f1e',
            created_at: 1677297041,
            kind: 1,
            tags: [],
            content: 'hello, jest',
            sig: '3451d8cfb61324ca23ee2b093058e79ab8b271acce7a2456a560ee36a517e13f90ae92f44d69f14ce75b8414a9ceeb7e781054ca9414a50052e07bf19ea24cdf',
          }
      },
    },
  
  ])('validateRelayMessage($message)', async ({ message, expected }) => {
    const event = new MessageEvent('message', { data: message });
    expect(await validateRelayMessage(event)).toEqual(expected);
  });
