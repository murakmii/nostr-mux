import { Logger } from './logger';
import { validateRelayMessage, Relay, OkMessage } from './relay';

interface StubWebSocket {
  readyState: number;
  sent: string[];
  closed: boolean;

  dispatch(type: string, event: any): void;
}

class StubLogger implements Logger {
  logs: string[];

  constructor() {
    this.logs = [];
  }

  debug(message: string, ...data: any): void {
    this.logs.push(message);
  }

  info(message: string, ...data: any): void {
    this.logs.push(message);
  }

  warn(message: string, ...data: any): void {
    this.logs.push(message);
  }

  error(message: string, ...data: any): void {
    this.logs.push(message);
  }

  clear() {
    this.logs = [];
  }
}

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

describe('Relay', () => {
  test('connect', async () => {
    const logger = new StubLogger();
    const sut = new Relay('wss://localhost', {
      logger,
      connectTimeout: 100,
      watchDogInterval: 0,
    });

    let healthy: string|null = null;
    sut.onHealthy.listen(e => healthy = e.relay.url);

    sut.connect();

    // @ts-ignore
    const ws = sut.ws as StubWebSocket
    ws.dispatch('open', null);
    ws.readyState = 1;

    await new Promise(r => setTimeout(r, 200));

    expect(sut.isHealthy).toBe(true);
    expect(healthy).toEqual('wss://localhost');
    expect(logger.logs).toEqual([
      '[wss://localhost] reset by before connect',
      '[wss://localhost] open',
    ])

    // @ts-ignore
    expect(sut.keepAlivedAt).toBeGreaterThan(0);

    sut.terminate();
  })

  test('connect and timeout', async () => {
    const logger = new StubLogger();
    const sut = new Relay('wss://localhost', {
      logger,
      connectTimeout: 100,
      watchDogInterval: 0,
    });

    sut.connect();

    await new Promise(r => setTimeout(r, 200));

    // @ts-ignore
    expect(sut.ws).toBe(null);
    expect(logger.logs).toEqual([
      '[wss://localhost] reset by before connect',
      '[wss://localhost] connection timed out',
      '[wss://localhost] reset by timeout'
    ])

    sut.terminate();
  });

  test('handle EVENT', async () => {
    const logger = new StubLogger();
    const sut = new Relay('wss://localhost', { logger, watchDogInterval: 0 });

    let content: string|null = null;
    sut.onEvent.listen(e => content = e.received.event.content);

    sut.connect();

    // @ts-ignore
    const ws = sut.ws as StubWebSocket
    ws.readyState = 1;
    ws.dispatch('open', null);

    sut.request('my-sub', [{ kinds: [1] }], { eoseTimeout: 10000 });
    ws.dispatch('message', {
      data: JSON.stringify([
        'EVENT',
        'my-sub',
        {
          id: '75a1b3c28b7082e0c74c43f2f1d917217c9fd8d73017688c8ac4c70bb2966b56',
          pubkey: 'fc137c5bb32f96849dff141bdf94c9e9426eeae0ecc1d2e67aa69bf8d04b2f1e',
          created_at: 1677297041,
          kind: 1,
          tags: [],
          content: 'hello, jest',
          sig: '3451d8cfb61324ca23ee2b093058e79ab8b271acce7a2456a560ee36a517e13f90ae92f44d69f14ce75b8414a9ceeb7e781054ca9414a50052e07bf19ea24cdf',
        }
      ]),
    });

    await new Promise(r => setTimeout(r, 10));

    expect(content).toBe('hello, jest');

    sut.terminate();
  });

  test('handle EOSE', async () => {
    const logger = new StubLogger();
    const sut = new Relay('wss://localhost', { logger, watchDogInterval: 0 });

    let eose: string|null = null;
    sut.onEose.listen(e => eose = e.received.subscriptionID);

    sut.connect();

    // @ts-ignore
    const ws = sut.ws as StubWebSocket
    ws.readyState = 1;
    ws.dispatch('open', null);

    sut.request('my-sub', [{ kinds: [1] }], { eoseTimeout: 10000 });
    ws.dispatch('message', { data: '["EOSE","my-sub"]' });

    await new Promise(r => setTimeout(r, 10));

    expect(eose).toBe('my-sub');

    sut.terminate();
  });

  test('publish', () => {
    const logger = new StubLogger();
    const sut = new Relay('wss://localhost', { logger, watchDogInterval: 0 });

    sut.connect();

    // @ts-ignore
    const ws = sut.ws as StubWebSocket
    ws.readyState = 1;
    ws.dispatch('open', null);
    
    const event = {
      id: '75a1b3c28b7082e0c74c43f2f1d917217c9fd8d73017688c8ac4c70bb2966b56',
      pubkey: 'fc137c5bb32f96849dff141bdf94c9e9426eeae0ecc1d2e67aa69bf8d04b2f1e',
      created_at: 1677297041,
      kind: 1,
      tags: [],
      content: 'hello, jest',
      sig: '3451d8cfb61324ca23ee2b093058e79ab8b271acce7a2456a560ee36a517e13f90ae92f44d69f14ce75b8414a9ceeb7e781054ca9414a50052e07bf19ea24cdf',
    };

    sut.publish(event);

    // @ts-ignore
    expect((sut.ws as StubWebSocket).sent).toEqual([
      JSON.stringify(['EVENT', event])
    ]);

    // @ts-ignore
    expect(sut.cmds['75a1b3c28b7082e0c74c43f2f1d917217c9fd8d73017688c8ac4c70bb2966b56']).not.toBe(undefined);

    sut.terminate();
  });

  test('publish and timeout', async () => {
    const logger = new StubLogger();
    const sut = new Relay('wss://localhost', { logger, watchDogInterval: 0 });

    let result: OkMessage | null = null;
    sut.onResult.listen(e => result = e.received);

    sut.connect();

    // @ts-ignore
    const ws = sut.ws as StubWebSocket
    ws.readyState = 1;
    ws.dispatch('open', null);
    
    const event = {
      id: '75a1b3c28b7082e0c74c43f2f1d917217c9fd8d73017688c8ac4c70bb2966b56',
      pubkey: 'fc137c5bb32f96849dff141bdf94c9e9426eeae0ecc1d2e67aa69bf8d04b2f1e',
      created_at: 1677297041,
      kind: 1,
      tags: [],
      content: 'hello, jest',
      sig: '3451d8cfb61324ca23ee2b093058e79ab8b271acce7a2456a560ee36a517e13f90ae92f44d69f14ce75b8414a9ceeb7e781054ca9414a50052e07bf19ea24cdf',
    };

    sut.publish(event, 100);

    await new Promise(r => setTimeout(r, 200));

    expect(result).toEqual({ 
      type: 'OK',
      eventID: '75a1b3c28b7082e0c74c43f2f1d917217c9fd8d73017688c8ac4c70bb2966b56',
      accepted: false,
      message: 'error: client timeout',
    });

    // @ts-ignore
    expect(sut.cmds).toEqual({});

    sut.terminate();
  });

  test('request', () => {
    const logger = new StubLogger();
    const sut = new Relay('wss://localhost', { logger, watchDogInterval: 0 });

    sut.connect();

    // @ts-ignore
    const ws = sut.ws as StubWebSocket
    ws.readyState = 1;
    ws.dispatch('open', null);
    
    sut.request('my-sub', [{ kinds: [1] }]);

    // @ts-ignore
    expect((sut.ws as StubWebSocket).sent).toEqual([
      '["REQ","my-sub",{"kinds":[1]}]'
    ]);

    // @ts-ignore
    expect(sut.subs['my-sub']).not.toBe(undefined);

    sut.terminate();
  });

  test('request and EOSE timeout', async () => {
    const logger = new StubLogger();
    const sut = new Relay('wss://localhost', { logger, watchDogInterval: 0 });

    let eose: string|null = null;
    sut.onEose.listen(e => eose = e.received.subscriptionID);

    sut.connect();

    // @ts-ignore
    const ws = sut.ws as StubWebSocket
    ws.readyState = 1;
    ws.dispatch('open', null);
    
    sut.request('my-sub', [{ kinds: [1] }], { eoseTimeout: 100 });

    await new Promise(r => setTimeout(r, 200));

    expect(eose).toBe('my-sub');

    sut.terminate();
  });

  test('request and EOSE by reset', async () => {
    const logger = new StubLogger();
    const sut = new Relay('wss://localhost', { logger, watchDogInterval: 0 });

    let eose: string|null = null;
    sut.onEose.listen(e => eose = e.received.subscriptionID);

    sut.connect();

    // @ts-ignore
    const ws = sut.ws as StubWebSocket
    ws.readyState = 1;
    ws.dispatch('open', null);
    
    sut.request('my-sub', [{ kinds: [1] }], { eoseTimeout: 10000 });
    
    // @ts-ignore
    (sut.ws as StubWebSocket).dispatch('close', null);

    expect(eose).toBe('my-sub');

    sut.terminate();
  });

  test('close', async () => {
    const logger = new StubLogger();
    const sut = new Relay('wss://localhost', { logger, watchDogInterval: 0 });

    let eose: string|null = null;
    sut.onEose.listen(e => eose = e.received.subscriptionID);

    sut.connect();

    // @ts-ignore
    const ws = sut.ws as StubWebSocket
    ws.readyState = 1;
    ws.dispatch('open', null);
    
    sut.request('my-sub', [{ kinds: [1] }], { eoseTimeout: 100 });
    sut.close('my-sub');

    await new Promise(r => setTimeout(r, 200));

    // @ts-ignore
    expect((sut.ws as StubWebSocket).sent).toEqual([
      '["REQ","my-sub",{"kinds":[1]}]',
      '["CLOSE","my-sub"]',
    ]);

    // EOSE does not emit(close function cancels EOSE timer)
    expect(eose).toBe(null);
    
    sut.terminate();
  });

  test('WatchDog', async () => {
    const logger = new StubLogger();
    const sut = new Relay('wss://localhost', { logger, watchDogInterval: 1000 });

    sut.connect();

    // @ts-ignore
    const ws = sut.ws as StubWebSocket
    ws.readyState = 1;
    ws.dispatch('open', null);
    
    // @ts-ignore
    sut.keepAlivedAt = 0;

    await new Promise(r => setTimeout(r, 1500));

    expect(logger.logs).toEqual([
      '[wss://localhost] reset by before connect',
      '[wss://localhost] open',
      '[wss://localhost] reset by watchdog',
      '[wss://localhost] reconnect by watchdog',
      '[wss://localhost] reset by before connect'
    ]);

    sut.terminate();
  });

  test('terminate', async () => {
    const logger = new StubLogger();
    const sut = new Relay('wss://localhost', { logger, watchDogInterval: 60000 });

    let result: OkMessage | null = null;
    sut.onResult.listen(e => result = e.received);

    let eose: string|null = null;
    sut.onEose.listen(e => eose = e.received.subscriptionID);

    sut.connect();

    // @ts-ignore
    const ws = sut.ws as StubWebSocket
    ws.readyState = 1;
    ws.dispatch('open', null);

    sut.publish({
      id: '75a1b3c28b7082e0c74c43f2f1d917217c9fd8d73017688c8ac4c70bb2966b56',
      pubkey: 'fc137c5bb32f96849dff141bdf94c9e9426eeae0ecc1d2e67aa69bf8d04b2f1e',
      created_at: 1677297041,
      kind: 1,
      tags: [],
      content: 'hello, jest',
      sig: '3451d8cfb61324ca23ee2b093058e79ab8b271acce7a2456a560ee36a517e13f90ae92f44d69f14ce75b8414a9ceeb7e781054ca9414a50052e07bf19ea24cdf',
    }, 60000);

    sut.request('my-sub', [{ kinds: [1] }], { eoseTimeout: 60000 });

    sut.terminate();

    expect(result).toEqual({ 
      type: 'OK',
      eventID: '75a1b3c28b7082e0c74c43f2f1d917217c9fd8d73017688c8ac4c70bb2966b56',
      accepted: false,
      message: 'error: client reset',
    });
    
    expect(eose).toBe('my-sub');

    // @ts-ignore
    expect(sut.ws).toBe(null);

    // @ts-ignore
    expect(sut.subs).toEqual({});

      // @ts-ignore
    expect(sut.cmds).toEqual({});
  });
});