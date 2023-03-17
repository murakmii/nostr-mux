import { Tag, Event } from '../core/event';
import { buildSimpleLogger } from '../core/logger';
import { Mux } from '../core/mux';
import { Relay } from '../core/relay';
import { 
  parseRelayListEvent, 
  parseContactListEvent,
  ContactListHolder,
  RelayListHolder,
  Personalizer,
  ContactListEntry,
} from './personalizer';

test.each([
  {
    event: { kind: 1, tags: [] },
    expected: undefined,
  },
  {
    event: { kind: 10002, tags: [] },
    expected: [],
  },
  {
    event: {
      kind: 10002,
      tags: [
        ['r', 'wss://valid'],
        ['r', 'wss://valid2/', 'read'] ,
        ['r', 'wss://invalid', 'write', 'unknown'],
        ['r', 'wss://valid3', 'write'],
        ['a', 'wss://invalid2'],
      ] as Tag[]
    },
    expected: [
      { url: 'wss://valid', read: true, write: true },
      { url: 'wss://valid2', read: true, write: false },
      { url: 'wss://valid3', read: false, write: true },
    ]
  }
])('parseRelayListEvent($event)', ({ event, expected }) => {
  expect(parseRelayListEvent(event)).toEqual(expected);
});


test.each([
  {
    event: { kind: 4, tags: [] },
    expected: undefined,
  },
  {
    event: { kind: 3, tags: [] },
    expected: [],
  },
  {
    event: {
      kind: 3,
      tags: [
        ['p', 'P1'],
        ['r', 'R1'],
        ['p', 'P2', 'wss://host'],
        ['p', 'P3', '', 'pet'],
        ['e', 'E1']
      ] as Tag[],
    },
    expected: [
      { pubkey: 'P1' },
      { pubkey: 'P2', mainRelayURL: 'wss://host' },
      { pubkey: 'P3' }
    ]
  }
])('parseContactListEvent($event)', ({ event, expected }) => {
  expect(parseContactListEvent(event)).toEqual(expected);
});

describe('ContactListHolder', () => {
  test('targetKind', () => {
    expect(new ContactListHolder('P1', buildSimpleLogger(undefined)).targetKind).toEqual(3);
  });

  test('initialFilter', () => {
    expect(new ContactListHolder('P1', buildSimpleLogger(undefined)).initialFilter)
      .toEqual([{ kinds: [3], authors: ['P1'] }]);
  });

  test('recoveryFilter', () => {
    const sut = new ContactListHolder('P1', buildSimpleLogger(undefined));

    expect(sut.recoveryFilter).toEqual([{ kinds: [3], authors: ['P1'] }]);

    sut.update({
      id: 'ID',
      pubkey: 'P1',
      kind: 3,
      content: '',
      tags: [['p', 'P2'], ['p', 'P3', 'wss://host']],
      created_at: 100,
      sig: 'S1'
    });

    expect(sut.recoveryFilter).toEqual([{ kinds: [3], authors: ['P1'], since: 100 }]);
  });

  test('update', () => {
    const sut = new ContactListHolder('P1', buildSimpleLogger(undefined));

    let updated = 0;
    sut.onUpdated.listen(() => updated++);

    sut.update({
      id: 'ID',
      pubkey: 'P1',
      kind: 3,
      content: '',
      tags: [['p', 'P2'], ['p', 'P3', 'wss://host']],
      created_at: 100,
      sig: 'S1'
    });

    expect(updated).toBe(1);
    expect(sut.currentEntries).toEqual([
      { pubkey: 'P2' },
      { pubkey: 'P3', mainRelayURL: 'wss://host' }
    ]);

    // same id event does NOT update contact list
    sut.update({
      id: 'ID',
      pubkey: 'P1',
      kind: 3,
      content: '',
      tags: [],
      created_at: 100,
      sig: 'S1'
    });

    expect(updated).toBe(1);
    expect(sut.currentEntries).toEqual([
      { pubkey: 'P2' },
      { pubkey: 'P3', mainRelayURL: 'wss://host' }
    ]);

    // older event does NOT update contact list
    sut.update({
      id: 'ID2',
      pubkey: 'P1',
      kind: 3,
      content: '',
      tags: [],
      created_at: 99,
      sig: 'S1'
    });

    expect(updated).toBe(1);
    expect(sut.currentEntries).toEqual([
      { pubkey: 'P2' },
      { pubkey: 'P3', mainRelayURL: 'wss://host' }
    ]);

    // newer event updates contact list
    sut.update({
      id: 'ID2',
      pubkey: 'P1',
      kind: 3,
      content: '',
      tags: [['p', 'P4']],
      created_at: 101,
      sig: 'S1'
    });

    expect(updated).toBe(2);
    expect(sut.currentEntries).toEqual([
      { pubkey: 'P4' },
    ]);
  });
});

describe('RelayListHolder', () => {
  test('targetKind', () => {
    expect(new RelayListHolder('P1', buildSimpleLogger(undefined), new Mux(), {}).targetKind).toEqual(10002);
  });

  test('initialFilter', () => {
    expect(new RelayListHolder('P1', buildSimpleLogger(undefined), new Mux(), {}).recoveryFilter)
      .toEqual([{ kinds: [10002], authors: ['P1'] }]);
  });

  test('recoveryFilter', () => {
    const sut = new RelayListHolder('P1', buildSimpleLogger(undefined), new Mux(), { watchDogInterval: 0 });

    expect(sut.recoveryFilter).toEqual([{ kinds: [10002], authors: ['P1'] }]);

    sut.update({
      id: 'ID2',
      pubkey: 'P1',
      kind: 10002,
      content: '',
      tags: [['r', 'wss://host']],
      created_at: 100,
      sig: 'S1'
    });

    expect(sut.recoveryFilter).toEqual([{ kinds: [10002], authors: ['P1'], since: 100 }]);
  });

  test('update', () => {
    const relay1 = new Relay('wss://relay1', { watchDogInterval: 0 });
    const relay2 = new Relay('wss://relay2', { watchDogInterval: 0 });
    const relay3 = new Relay('wss://relay3', { watchDogInterval: 0 });

    const mux = new Mux();
    mux.addRelay(relay1);
    mux.addRelay(relay2);
    mux.addRelay(relay3);

    const sut = new RelayListHolder('P1', buildSimpleLogger(undefined), mux, { watchDogInterval: 0 });

    sut.update({
      id: 'ID2',
      pubkey: 'P1',
      kind: 10002,
      content: '',
      tags: [
        ['r', 'wss://relay3'],
        ['r', 'wss://relay2', 'read'],
        ['r', 'wss://relay4'],
        ['r', 'wss://relay5', 'write'],
      ],
      created_at: 100,
      sig: 'S1'
    });

    const relays = mux.allRelays.sort((a, b) => a.url.localeCompare(b.url));

    expect(relays.length).toBe(4);
    expect(relays[0].url).toEqual('wss://relay2');
    expect(relays[0].isReadable).toBe(true)
    expect(relays[0].isWritable).toBe(false);

    expect(relays[1].url).toEqual('wss://relay3');
    expect(relays[1].isReadable).toBe(true)
    expect(relays[1].isWritable).toBe(true);

    expect(relays[2].url).toEqual('wss://relay4');
    expect(relays[2].isReadable).toBe(true)
    expect(relays[2].isWritable).toBe(true);

    expect(relays[3].url).toEqual('wss://relay5');
    expect(relays[3].isReadable).toBe(false)
    expect(relays[3].isWritable).toBe(true);
  });
});

describe('Personalizer', () => {
  test('install and uninstall', async () => {
    const relay = new Relay('wss://relay', { watchDogInterval: 0 });

    const mux = new Mux();
    mux.addRelay(relay);

    // @ts-ignore
    relay.ws.readyState = 1;
    // @ts-ignore
    relay.ws.dispatch('open', null);

    const sut = new Personalizer('P1', {
      flushInterval: 100,
      contactList: { enable: true },
      relayList: { enable: true },
      cacheReplaceableEvent: [19999],
    });

    const updatedContactList: ContactListEntry[][] = [];
    sut.onUpdatedContactList.listen(entries => updatedContactList.push(entries));

    const updatedReplaceable: Event[] = [];
    sut.onUpdatedReplaceableEvent.listen(event => updatedReplaceable.push(event));

    mux.installPlugin(sut);

    // @ts-ignore
    expect(relay.ws.sent).toEqual([
       // REQ by initial filter
      '["REQ","__personalizer",{"kinds":[19999],"authors":["P1"]},{"kinds":[3],"authors":["P1"]},{"kinds":[10002],"authors":["P1"]}]'
    ]);

    relay.onEvent.emit({ 
      relay, 
      received: { 
        type: 'EVENT', 
        subscriptionID: '__personalize',
        event: {
          id: 'ID1', kind: 3, pubkey: 'P1', content: '', created_at: 10, sig: 'S1',
          tags: [['p', 'OLDER_K3']]
        }
      }
    });

    relay.onEvent.emit({ 
      relay, 
      received: { 
        type: 'EVENT', 
        subscriptionID: '__personalizer',
        event: {
          id: 'ID2', kind: 3, pubkey: 'P1', content: '', created_at: 20, sig: 'S2',
          tags: [['p', 'NEWER_K3']]
        }
      }
    });

    relay.onEvent.emit({ 
      relay, 
      received: { 
        type: 'EVENT', 
        subscriptionID: '__personalizer',
        event: {
          id: 'ID3', kind: 10002, pubkey: 'P1', content: '', created_at: 15, sig: 'S3',
          tags: [['r', 'wss://older']]
        }
      }
    });

    relay.onEvent.emit({ 
      relay, 
      received: { 
        type: 'EVENT', 
        subscriptionID: '__personalizer',
        event: {
          id: 'ID4', kind: 10002, pubkey: 'P1', content: '', created_at: 25, sig: 'S4',
          tags: [['r', 'wss://newer']]
        }
      }
    });

    relay.onEvent.emit({ 
      relay, 
      received: { 
        type: 'EVENT', 
        subscriptionID: '__personalizer',
        event: {
          id: 'ID5', kind: 19999, pubkey: 'P1', content: 'OLDER', created_at: 100, sig: 'S5', tags: []
        }
      }
    });

    relay.onEvent.emit({ 
      relay, 
      received: { 
        type: 'EVENT', 
        subscriptionID: '__personalizer',
        event: {
          id: 'ID6', kind: 19999, pubkey: 'P1', content: 'NEWER', created_at: 200, sig: 'S6', tags: []
        }
      }
    });

    await new Promise(r => setTimeout(r, 200));

    expect(updatedContactList).toEqual([[{ pubkey: 'NEWER_K3' }]]);
    expect(sut.contactListEntries).toEqual([{ pubkey: 'NEWER_K3' }]);

    expect(updatedReplaceable).toEqual([{
      id: 'ID6', kind: 19999, pubkey: 'P1', content: 'NEWER', created_at: 200, sig: 'S6', tags: [],
    }]);
    expect(sut.getCachedReplaceableEvent(19999)).toEqual({
      id: 'ID6', kind: 19999, pubkey: 'P1', content: 'NEWER', created_at: 200, sig: 'S6', tags: [],
    });

    expect(mux.allRelays.length).toEqual(1);
    expect(mux.allRelays[0].url).toEqual('wss://newer');

    // @ts-ignore
    mux.allRelays[0].ws.readyState = 1;
    // @ts-ignore
    mux.allRelays[0].ws.dispatch('open', null);

    // @ts-ignore
    expect(mux.allRelays[0].ws.sent).toEqual([
      // REQ by recovery filter
      '["REQ","__personalizer",{"kinds":[19999],"authors":["P1"],"since":200},{"kinds":[3],"authors":["P1"],"since":20},{"kinds":[10002],"authors":["P1"],"since":25}]'
    ]);

    mux.uninstallPlugin(sut.id());

    expect(sut.contactListEntries).toEqual([]);
    expect(sut.getCachedReplaceableEvent(19999)).toEqual(undefined);
  });

  test('capturePublishedEvent', () => {
    const relay = new Relay('wss://relay', { watchDogInterval: 0 });

    const mux = new Mux();
    mux.addRelay(relay);

    // @ts-ignore
    relay.ws.readyState = 1;
    // @ts-ignore
    relay.ws.dispatch('open', null);

    const sut = new Personalizer('P1', {
      flushInterval: 100,
      contactList: { enable: true },
      relayList: { enable: true },
      cacheReplaceableEvent: [19999],
    });

    mux.installPlugin(sut);

    sut.capturePublishedEvent({
      id: 'ID1', kind: 3, pubkey: 'P1', content: '', created_at: 10, sig: 'S1',
      tags: [['p', 'FOLLOWEE']]
    });

    expect(sut.contactListEntries).toEqual([{ pubkey: 'FOLLOWEE' }]);

    sut.capturePublishedEvent({
      id: 'ID2', kind: 10002, pubkey: 'P1', content: '', created_at: 15, sig: 'S2',
      tags: [['r', 'wss://updated']]
    });

    expect(mux.allRelays.length).toBe(1);
    expect(mux.allRelays[0].url).toEqual('wss://updated');

    sut.capturePublishedEvent({
      id: 'ID3', kind: 19999, pubkey: 'P1', content: '19999!', created_at: 100, sig: 'S3', tags: []
    });

    expect(sut.getCachedReplaceableEvent(19999)).toEqual({
      id: 'ID3', kind: 19999, pubkey: 'P1', content: '19999!', created_at: 100, sig: 'S3', tags: [],
    });
  });
});
