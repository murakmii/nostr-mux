import { Mux, Plugin, Subscription, CommandResult, EventMatcher } from './mux';
import { Event, Tag } from './event';
import { EventMessage, Relay, RelayMessageEvent, Filter, OkMessage } from './relay';

class StubPlugin extends Plugin {
  readonly filters: Filter[];
  readonly published: Event[];
  readonly received: RelayMessageEvent<EventMessage>[];

  constructor() {
    super();
    this.filters = [];
    this.published = [];
    this.received = [];
  }

  id(): string {
    return 'stub';
  }

  capturePublishedEvent(event: Event): void { this.published.push(event); }
  captureRequestedFilter(filter: Filter): void { this.filters.push(filter); }
  captureReceivedEvent(e: RelayMessageEvent<EventMessage>): void { this.received.push(e); }
}

describe('EventMatcher', () => {
  test.each([
    {
      name: 'match id',
      filter: { ids: ['ID', 'ID2'] },
      event: {
        id: 'ID',
        kind: 1,
        pubkey: 'PUBKEY',
        content: 'hello, EventMatcher',
        tags: [['e', 'ID'] as Tag],
        created_at: 123456789,
        sig: 'SIG',
      },
      expected: true,
    },
    {
      name: 'match kind',
      filter: { kinds: [0, 1, 2] },
      event: {
        id: 'ID',
        kind: 1,
        pubkey: 'PUBKEY',
        content: 'hello, EventMatcher',
        tags: [['e', 'ID'] as Tag],
        created_at: 123456789,
        sig: 'SIG',
      },
      expected: true,
    },
    {
      name: 'match pubkey',
      filter: { authors: ['PUBKEY', 'PUBKEY2'] },
      event: {
        id: 'ID',
        kind: 1,
        pubkey: 'PUBKEY',
        content: 'hello, EventMatcher',
        tags: [['e', 'ID'] as Tag],
        created_at: 123456789,
        sig: 'SIG',
      },
      expected: true,
    },
    {
      name: 'match tag',
      filter: { '#e': ['ID', 'ID2'] } as Filter,
      event: {
        id: 'ID',
        kind: 1,
        pubkey: 'PUBKEY',
        content: 'hello, EventMatcher',
        tags: [['e', 'ID'] as Tag],
        created_at: 123456789,
        sig: 'SIG',
      },
      expected: true,
    },
    {
      name: 'match since',
      filter: { since: 123456780 } as Filter,
      event: {
        id: 'ID',
        kind: 1,
        pubkey: 'PUBKEY',
        content: 'hello, EventMatcher',
        tags: [['e', 'ID'] as Tag],
        created_at: 123456789,
        sig: 'SIG',
      },
      expected: true,
    },
    {
      name: 'match until',
      filter: { until: 123456790 } as Filter,
      event: {
        id: 'ID',
        kind: 1,
        pubkey: 'PUBKEY',
        content: 'hello, EventMatcher',
        tags: [['e', 'ID'] as Tag],
        created_at: 123456789,
        sig: 'SIG',
      },
      expected: true,
    },
    {
      name: 'match all tags',
      filter: { '#e': ['ID1', 'ID2', 'ID3'], '#p': ['P1', 'P2', 'P3'] } as Filter,
      event: {
        id: 'ID',
        kind: 1,
        pubkey: 'PUBKEY',
        content: 'hello, EventMatcher',
        tags: [['e', 'ID3'] as Tag, ['p', 'P1'] as Tag],
        created_at: 123456789,
        sig: 'SIG',
      },
      expected: true,
    },
    {
      name: 'not match part of tags',
      filter: { '#e': ['ID1', 'ID2', 'ID3'], '#p': ['P1', 'P2', 'P3'] } as Filter,
      event: {
        id: 'ID',
        kind: 1,
        pubkey: 'PUBKEY',
        content: 'hello, EventMatcher',
        tags: [['e', 'ID3'] as Tag, ['p', 'P4'] as Tag],
        created_at: 123456789,
        sig: 'SIG',
      },
      expected: false,
    },
    {
      name: 'match all conditions',
      filter: { authors: ['PUBKEY'], kinds: [1] } as Filter,
      event: {
        id: 'ID',
        kind: 1,
        pubkey: 'PUBKEY',
        content: 'hello, EventMatcher',
        tags: [['e', 'ID3'] as Tag, ['p', 'P1'] as Tag],
        created_at: 123456789,
        sig: 'SIG',
      },
      expected: true,
    },
    {
      name: 'not match part of conditions',
      filter: { authors: ['PUBKEY'], kinds: [1] } as Filter,
      event: {
        id: 'ID',
        kind: 0,
        pubkey: 'PUBKEY',
        content: 'hello, EventMatcher',
        tags: [['e', 'ID3'] as Tag, ['p', 'P1'] as Tag],
        created_at: 123456789,
        sig: 'SIG',
      },
      expected: false,
    },
  ])('test($name)', ({ filter, event, expected }) => {
    expect(new EventMatcher(filter).test(event)).toBe(expected);
  });
});

describe('Subscription', () => {
  test('constructor', async () => {
    let eose = false;
    new Subscription('my-sub', [], {
      filters: [{ kinds: [1] }],
      onEvent: () => {},
      onEose: () => eose = true
    });

    await new Promise(r => setTimeout(r, 100));

    expect(eose).toBe(true);
  });

  test('consumeEvent', () => {
    const events: Event[] = [];
    const relay = new Relay('wss://host', { watchDogInterval: 0 });
    const sut = new Subscription('my-sub', [], {
      filters: [{ kinds: [0] }, { kinds: [1] }],
      onEvent: m => events.push(m.received.event),
    });

    const event1 = {
      id: 'EID1',
      kind: 1,
      pubkey: 'MYPUB',
      content: 'hello',
      tags: [],
      created_at: 123456789,
      sig: 'SIG'
    };

    const event2 = {
      id: 'EID2',
      kind: 42,
      pubkey: 'MYPUB',
      content: 'hello',
      tags: [],
      created_at: 123456789,
      sig: 'SIG'
    };
    
    sut.consumeEvent({ relay, received: { type: 'EVENT', subscriptionID: 'my-sub', event: event1 }});
    sut.consumeEvent({ relay, received: { type: 'EVENT', subscriptionID: 'my-sub', event: event2 }});

    expect(events).toEqual([event1]);
  });

  test('consumeEose', () => {
    let callEose = 0;
    const relay1 = new Relay('wss://host1', { watchDogInterval: 0 });
    const relay2 = new Relay('wss://host2', { watchDogInterval: 0 });
    const sut = new Subscription('my-sub', [relay1, relay2], {
      filters: [{ kinds: [1] }],
      onEvent: () => {},
      onEose: () => callEose++
    });

    sut.consumeEose(relay1.url);
    expect(callEose).toBe(0);
    expect(sut.isAfterEose).toBe(false);

    sut.consumeEose(relay2.url);
    expect(callEose).toBe(1);
    expect(sut.isAfterEose).toBe(true);

    sut.consumeEose(relay2.url);
    expect(callEose).toBe(1);
  });

  test('recoveryFilters', () => {
    const relay1 = new Relay('wss://host1', { watchDogInterval: 0 });
    const relay2 = new Relay('wss://host2', { watchDogInterval: 0 });
    const sut = new Subscription('my-sub', [relay1], {
      filters: [{ kinds: [1] }],
      onEvent: () => {},
    });

    const forRelay1 = sut.recoveryFilters(relay1);
    expect(forRelay1.length).toBe(1);
    expect(forRelay1[0].kinds).toEqual([1]);
    expect(forRelay1[0].since).toBeGreaterThan(1);

    expect(sut.recoveryFilters(relay2)).toEqual([{ kinds: [1] }]);
  });

  test('recoveryFilters with recoveredHandler', () => {
    const onRecovered = jest.fn((relay: Relay) => [{ '#r': [relay.url] }]);
    const relay1 = new Relay('wss://host1', { watchDogInterval: 0 });
    const relay2 = new Relay('wss://host2', { watchDogInterval: 0 });
    const sut = new Subscription('my-sub', [relay1], {
      filters: [{ kinds: [1] }],
      onEvent: () => {},
      onRecovered
    });

    expect(sut.recoveryFilters(relay1)).toEqual([{ '#r': ['wss://host1'] }]);
    expect(sut.recoveryFilters(relay2)).toEqual([{ '#r': ['wss://host2'] }]);
    expect(sut.recoveryFilters(relay2)).toEqual([{ '#r': ['wss://host2'] }]);

    // @ts-ignore
    expect(onRecovered.mock.calls).toEqual([
      [relay1, false],
      [relay2, true],
      [relay2, false],
    ])
  });
});

test('CommandResult', () => {
  const relay1 = new Relay('wss://host1', { watchDogInterval: 0 });
  const relay2 = new Relay('wss://host2', { watchDogInterval: 0 });

  let results: RelayMessageEvent<OkMessage>[] = [];
  let complete: RelayMessageEvent<OkMessage>[] | null = null;

  const sut = new CommandResult([relay1, relay2], {
    onResult: (r) => results.push(r),
    onComplete: (r) => complete = r,
  });

  expect(sut.hasCompleted).toBe(false);

  sut.consumeResult({ relay: relay1, received: { type: 'OK', eventID: 'E1', accepted: true, message: 'M1' } });

  expect(sut.hasCompleted).toBe(false);
  expect(results).toEqual([{ relay: relay1, received: { type: 'OK', eventID: 'E1', accepted: true, message: 'M1' } }]);
  expect(complete).toBe(null);

  sut.consumeResult({ relay: relay2, received: { type: 'OK', eventID: 'E2', accepted: false, message: 'M2' } });

  expect(sut.hasCompleted).toBe(true);

  expect(results).toEqual([
    { relay: relay1, received: { type: 'OK', eventID: 'E1', accepted: true, message: 'M1' } },
    { relay: relay2, received: { type: 'OK', eventID: 'E2', accepted: false, message: 'M2' } },
  ]);

  expect(complete).toEqual([
    { relay: relay1, received: { type: 'OK', eventID: 'E1', accepted: true, message: 'M1' } },
    { relay: relay2, received: { type: 'OK', eventID: 'E2', accepted: false, message: 'M2' } },
  ]);
});

describe('Mux', () => {
  test('addRelay', () => {
    const relay = new Relay('wss://localhost', { watchDogInterval: 0 });
    const sut = new Mux();

    sut.addRelay(relay);

    // @ts-ignore
    expect(relay.onHealthy.listeners).toEqual([sut.handleRelayHealthy]);

    // @ts-ignore
    expect(relay.onEvent.listeners).toEqual([sut.handleRelayEvent]);

    // @ts-ignore
    expect(relay.onEose.listeners).toEqual([sut.handleRelayEose]);

    // @ts-ignore
    expect(relay.ws).not.toBe(null);

    // @ts-ignore
    expect(sut.relays[relay.url]).toBe(relay);
  });

  test('removeRelay', () => {
    const relay = new Relay('wss://localhost', { watchDogInterval: 0 });
    const sut = new Mux();

    sut.addRelay(relay);
    sut.removeRelay('wss://localhost');

    // @ts-ignore
    expect(relay.onHealthy.listeners).toEqual([]);

    // @ts-ignore
    expect(relay.onEvent.listeners).toEqual([]);

    // @ts-ignore
    expect(relay.onEose.listeners).toEqual([]);

    // @ts-ignore
    expect(relay.ws).toBe(null);

    // @ts-ignore
    expect(sut.relays).toEqual({});
  });

  test('waitRelayBecomesHealthy', async () => {
    const relay = new Relay('wss://localhost', { watchDogInterval: 0 });
    const sut = new Mux();

    sut.addRelay(relay);

    await new Promise(r => setTimeout(r, 100));

    expect(sut.healthyRelays.length).toBe(0);

    let result: boolean | null = null;
    sut.waitRelayBecomesHealthy(1, 3000).then(r => result = r);

    await new Promise(r => setTimeout(r, 100));

    // @ts-ignore
    relay.ws.readyState = 1;
    // @ts-ignore
    relay.ws.dispatch('open', null);

    await new Promise(r => setTimeout(r, 10));

    expect(result).toBe(true);
    expect(sut.healthyRelays.length).toBe(1);
  });

  test('waitRelayBecomesHealthy(timeout)', async () => {
    const sut = new Mux();
    expect(await sut.waitRelayBecomesHealthy(1, 100)).toBe(false);
  });

  test('publish', async () => {
    const relay1 = new Relay('wss://host-1', { watchDogInterval: 0 });
    const relay2 = new Relay('wss://host-2', { watchDogInterval: 0 });
    const relay3 = new Relay('wss://host-3', { write: false, watchDogInterval: 0 });
    const relay4 = new Relay('wss://host-4', { watchDogInterval: 0 });
    const sut = new Mux();

    sut.addRelay(relay1);
    sut.addRelay(relay2);
    sut.addRelay(relay3);
    sut.addRelay(relay4);

    // @ts-ignore
    relay1.ws.readyState = 1;
    // @ts-ignore
    relay1.ws.dispatch('open', null);

    // relay2 is NOT connected

    // @ts-ignore
    relay3.ws.readyState = 1;
    // @ts-ignore
    relay3.ws.dispatch('open', null);

    // @ts-ignore
    relay4.ws.readyState = 1;
    // @ts-ignore
    relay4.ws.dispatch('open', null);

    let results: RelayMessageEvent<OkMessage>[] = [];
    let completeResults: RelayMessageEvent<OkMessage>[] | null = null;
    sut.publish(
      {
        id: '75a1b3c28b7082e0c74c43f2f1d917217c9fd8d73017688c8ac4c70bb2966b56',
        pubkey: 'fc137c5bb32f96849dff141bdf94c9e9426eeae0ecc1d2e67aa69bf8d04b2f1e',
        created_at: 1677297041,
        kind: 1,
        tags: [],
        content: 'hello, jest',
        sig: '3451d8cfb61324ca23ee2b093058e79ab8b271acce7a2456a560ee36a517e13f90ae92f44d69f14ce75b8414a9ceeb7e781054ca9414a50052e07bf19ea24cdf',
      },
      {
        onResult: (e) => results.push(e),
        onComplete: (r) => completeResults = r,
      }
    );

    await new Promise(r => setTimeout(r, 100));

    // @ts-ignore
    expect(sut.cmds['75a1b3c28b7082e0c74c43f2f1d917217c9fd8d73017688c8ac4c70bb2966b56']).not.toBe(undefined);

    // @ts-ignore
    relay1.ws.dispatch('message', { data: '["OK","75a1b3c28b7082e0c74c43f2f1d917217c9fd8d73017688c8ac4c70bb2966b56",true,"good"]' });

    // @ts-ignore
    relay4.ws.dispatch('message', { data: '["OK","75a1b3c28b7082e0c74c43f2f1d917217c9fd8d73017688c8ac4c70bb2966b56",false,"error: NOT good"]' });

    await new Promise(r => setTimeout(r, 100));

    expect(results).toEqual([
      { relay: relay2, received: { type: 'OK', eventID: '75a1b3c28b7082e0c74c43f2f1d917217c9fd8d73017688c8ac4c70bb2966b56', accepted: false, message: 'error: client timeout' } },
      { relay: relay1, received: { type: 'OK', eventID: '75a1b3c28b7082e0c74c43f2f1d917217c9fd8d73017688c8ac4c70bb2966b56', accepted: true, message: 'good' } },
      { relay: relay4, received: { type: 'OK', eventID: '75a1b3c28b7082e0c74c43f2f1d917217c9fd8d73017688c8ac4c70bb2966b56', accepted: false, message: 'error: NOT good' } },
    ]);

    expect(completeResults).toEqual([
      { relay: relay2, received: { type: 'OK', eventID: '75a1b3c28b7082e0c74c43f2f1d917217c9fd8d73017688c8ac4c70bb2966b56', accepted: false, message: 'error: client timeout' } },
      { relay: relay1, received: { type: 'OK', eventID: '75a1b3c28b7082e0c74c43f2f1d917217c9fd8d73017688c8ac4c70bb2966b56', accepted: true, message: 'good' } },
      { relay: relay4, received: { type: 'OK', eventID: '75a1b3c28b7082e0c74c43f2f1d917217c9fd8d73017688c8ac4c70bb2966b56', accepted: false, message: 'error: NOT good' } },
    ]);
    
    // @ts-ignore
    expect(sut.cmds).toEqual({});
  });

  test('publish(specify relay)', async () => {
    const relay1 = new Relay('wss://host-1', { watchDogInterval: 0 });
    const relay2 = new Relay('wss://host-2', { watchDogInterval: 0 });
    const sut = new Mux();

    sut.addRelay(relay1);
    sut.addRelay(relay2);

    // @ts-ignore
    relay1.ws.readyState = 1;
    // @ts-ignore
    relay1.ws.dispatch('open', null);

    // @ts-ignore
    relay2.ws.readyState = 1;
    // @ts-ignore
    relay2.ws.dispatch('open', null);

    sut.publish(
      {
        id: '75a1b3c28b7082e0c74c43f2f1d917217c9fd8d73017688c8ac4c70bb2966b56',
        pubkey: 'fc137c5bb32f96849dff141bdf94c9e9426eeae0ecc1d2e67aa69bf8d04b2f1e',
        created_at: 1677297041,
        kind: 1,
        tags: [],
        content: 'hello, jest',
        sig: '3451d8cfb61324ca23ee2b093058e79ab8b271acce7a2456a560ee36a517e13f90ae92f44d69f14ce75b8414a9ceeb7e781054ca9414a50052e07bf19ea24cdf',
      },
      {
        relays: ['wss://host-2']
      }
    );

    await new Promise(r => setTimeout(r, 10));

    // @ts-ignore
    expect(relay1.ws.sent.length).toBe(0);

    // @ts-ignore
    expect(relay2.ws.sent.length).toBe(1);
  });

  test('subscribe', async () => {
    const relay1 = new Relay('wss://host1', { watchDogInterval: 0 });
    const relay2 = new Relay('wss://host2', { watchDogInterval: 0 });
    const relay3 = new Relay('wss://host3', { read: false, watchDogInterval: 0 });
    const sut = new Mux();

    sut.addRelay(relay1);
    sut.addRelay(relay2);
    sut.addRelay(relay3);

    for (const relay of sut.allRelays) {
      // @ts-ignore
      relay.ws.readyState = 1;
      // @ts-ignore
      relay.ws.dispatch('open', null);
    }

    let eoseSubIDs: string[] = [];
    let contents: string[] = [];

    const subID = sut.subscribe({
      filters: [{ kinds: [1] }],
      onEvent: (e: RelayMessageEvent<EventMessage>) => contents.push(e.received.event.content),
      onEose: (eoseSubID: string) => eoseSubIDs.push(eoseSubID),
    });

    // @ts-ignore
    relay1.ws.dispatch('message', { data: '["EOSE","__sub:1"]' });
    // @ts-ignore
    relay2.ws.dispatch('message', { data: '["EOSE","__sub:1"]' });

    // @ts-ignore
    relay1.ws.dispatch('message', {
      data: JSON.stringify([
        'EVENT',
        '__sub:1',
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

    expect(subID).toBe('__sub:1');
    expect(eoseSubIDs).toEqual(['__sub:1']);
    expect(contents).toEqual(['hello, jest']);

    sut.unSubscribe(subID);

    // @ts-ignore
    expect(relay1.ws.sent).toEqual(['["REQ","__sub:1",{"kinds":[1]}]', '["CLOSE","__sub:1"]']);
    // @ts-ignore
    expect(relay2.ws.sent).toEqual(['["REQ","__sub:1",{"kinds":[1]}]', '["CLOSE","__sub:1"]']);
    // @ts-ignore
    expect(relay3.ws.sent).toEqual([]);
  });

  test('subscribe and recovery', async () => {
    const relay = new Relay('wss://host', { watchDogInterval: 0 });
    const sut = new Mux();

    sut.addRelay(relay);

    sut.subscribe({
      filters: [{ kinds: [1] }],
      onEvent: (e: RelayMessageEvent<EventMessage>) => {},
      onRecovered: (relay: Relay): Filter[] => [{ kinds: [2] }]
    });

    await new Promise(r => setTimeout(r, 10));

    // @ts-ignore
    relay.ws.readyState = 1;
    // @ts-ignore
    relay.ws.dispatch('open', null);

    // @ts-ignore
    expect(relay.ws.sent).toEqual(['["REQ","__sub:1",{"kinds":[2]}]']);
  });

  test('subscribe and no recovery', async () => {
    const relay = new Relay('wss://host', { watchDogInterval: 0 });
    const sut = new Mux();

    sut.addRelay(relay);

    sut.subscribe({
      filters: [{ kinds: [1] }],
      onEvent: (e: RelayMessageEvent<EventMessage>) => {},
      onRecovered: () => [],
    });

    await new Promise(r => setTimeout(r, 10));

    // @ts-ignore
    relay.ws.readyState = 1;
    // @ts-ignore
    relay.ws.dispatch('open', null);

    await new Promise(r => setTimeout(r, 100));

    // @ts-ignore
    expect(relay.ws.sent).toEqual([]);
  });

  test('plugin support', async () => {
    const relay = new Relay('wss://host', { watchDogInterval: 0 });
    const sut = new Mux();
    const plugin = new StubPlugin();

    sut.installPlugin(plugin);
    sut.addRelay(relay);

    // @ts-ignore
    relay.ws.readyState = 1;
    // @ts-ignore
    relay.ws.dispatch('open', null);

    sut.subscribe({
      id: 'my-sub',
      filters: [{ kinds: [1] }],
      onEvent: () => {},
      eoseTimeout: 0,
    });

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
    relay.ws.dispatch('message', {
      data: JSON.stringify(['EVENT', 'my-sub', event]),
    });

    await new Promise(r => setTimeout(r, 100));

    expect(plugin.filters).toEqual([{ kinds: [1] }]);
    expect(plugin.published).toEqual([event]);
    expect(plugin.received).toEqual([{
      relay,
      received: {
        type: 'EVENT',
        subscriptionID: 'my-sub',
        event,
      }
    }]);
  });
});
