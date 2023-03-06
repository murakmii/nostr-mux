import { Event } from '../core/event';
import { Mux } from '../core/mux';
import { Relay } from '../core/relay';
import { parseEvent, AutoRelayList } from './auto_relay_list';

test.each([
  {
    event: { kind: 1 },
    expected: null,
  },
  {
    event: {
      kind: 10002,
      tags: [
        ['r', 'wss://valid'],
        ['r', 'wss://valid2', 'read'],
        ['r', 'wss://valid3', 'write'],
        ['r'],
        ['r', 'wss://invalid', 'write', 'unknown'],
        ['a', 'wss://invalid2'],
      ]
    },
    expected: [
      { url: 'wss://valid', read: true, write: true },
      { url: 'wss://valid2', read: true, write: false },
      { url: 'wss://valid3', read: false, write: true },
    ]
  }
])('parseEvent($event)', ({ event, expected }) => {
  expect(parseEvent(event as Event)).toEqual(expected);
});

describe('AutoRelayList', () => {
  test('install', async () => {
    const mux = new Mux();
    const sut = new AutoRelayList({
      pubkey: 'my-pubkey',
      initialLoadTimeout: 10,
      relayOptionsTemplate: {
        watchDogInterval: 0,
      }
    });
    const relay1 = new Relay('wss://host1', { watchDogInterval: 0 });
    const relay2 = new Relay('wss://host2', { watchDogInterval: 0 });

    mux.addRelay(relay1);
    mux.addRelay(relay2);

    mux.installPlugin(sut);

    relay1.onEvent.emit({
      relay: relay1,
      received: {
        type: 'EVENT',
        subscriptionID: '__relay_list',
        event: {
          id: 'stubid',
          kind: 10002,
          pubkey: 'my-pubkey',
          content: '',
          tags: [
            ['r', 'wss://relay1a'],
            ['r', 'wss://relay1b', 'read'],
            ['r', 'wss://relay1c', 'write'],
          ],
          created_at: Math.ceil(Date.now() / 1000),
          sig: 'stubsig',
        }
      }
    });

    await new Promise(r => setTimeout(r, 100));

    const relays = mux.allRelays.sort((a, b) => a.url.localeCompare(b.url));

    expect(relays.length).toBe(3);

    expect(relays[0].url).toBe('wss://relay1a');
    expect(relays[0].isReadable).toBe(true);
    expect(relays[0].isWritable).toBe(true);

    expect(relays[1].url).toBe('wss://relay1b');
    expect(relays[1].isReadable).toBe(true);
    expect(relays[1].isWritable).toBe(false);

    expect(relays[2].url).toBe('wss://relay1c');
    expect(relays[2].isReadable).toBe(false);
    expect(relays[2].isWritable).toBe(true);
  });

  test('fallbackRelayListEvent', () => {
    const sut = new AutoRelayList();

    // @ts-ignore
    sut.fallbackRelays = ['wss://host1', 'wss://host2'];

    // @ts-ignore
    let event = sut.fallbackRelayListEvent;
    
    expect(event.kind).toBe(10002);
    expect(event.tags).toEqual([
      ['r', 'wss://host1', 'read'],
      ['r', 'wss://host2', 'read'],
    ]);

    // @ts-ignore
    sut.pubkey = 'pubkey';

    // @ts-ignore
    event = sut.fallbackRelayListEvent;
    
    expect(event.kind).toBe(10002);
    expect(event.tags).toEqual([
      ['r', 'wss://host1'],
      ['r', 'wss://host2'],
    ]);
  });

  test('applyRelayList', () => {
    const mux = new Mux();
    
    mux.addRelay(new Relay('wss://host1', { watchDogInterval: 0 }));
    mux.addRelay(new Relay('wss://host2', { watchDogInterval: 0, read: true, write: false }));

    const sut = new AutoRelayList({ relayOptionsTemplate: { watchDogInterval: 0 } });

    // @ts-ignore
    sut.mux = mux;

    // @ts-ignore
    sut.applyRelayList({
      kind: 10002,
      tags: [
        ['r', 'wss://host2', 'write'],
        ['r', 'wss://host3'],
      ],
      created_at: Math.ceil(Date.now() / 1000),
    });

    const afterRelays = mux.allRelays.sort((a, b) => a.url.localeCompare(b.url));

    expect(afterRelays.length).toBe(2);

    expect(afterRelays[0].url).toBe('wss://host2');
    expect(afterRelays[0].isReadable).toBe(false);
    expect(afterRelays[0].isWritable).toBe(true);

    expect(afterRelays[1].url).toBe('wss://host3');
    expect(afterRelays[1].isReadable).toBe(true);
    expect(afterRelays[1].isWritable).toBe(true);
  })
});