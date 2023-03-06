import { Mux } from '../core/mux';
import { EventMessage, Relay, RelayMessageEvent } from '../core/relay';
import { 
  LRUCache, 
  parseProfile,
  Profile,
  AutoProfileSubscriber,
} from './auto_profile_subscriber';

describe('LRUCache', () => {
  test('get, put, has, peek', () => {
    const sut = new LRUCache<string, number>(3, true);

    sut.put('A', 1);
    sut.put('B', 2);
    sut.put('C', 3);

    // 'C' is least entry
    expect(sut.get('A')).toBe(1);
    expect(sut.get('B')).toBe(2);

    // evict 'C'
    sut.put('D', 4);

    // 'A' is least entry
    expect(sut.size).toBe(3);
    expect(sut.get('A')).toBe(1);
    expect(sut.get('B')).toBe(2);
    expect(sut.get('C')).toBe(undefined);
    expect(sut.get('D')).toBe(4);

    expect(sut.has('A')).toBe(true);
    expect(sut.has('B')).toBe(true);
    expect(sut.has('C')).toBe(false);
    expect(sut.has('D')).toBe(true);

    sut.put('E', 5);

    expect(sut.size).toBe(3);
    expect(sut.get('A')).toBe(undefined);
    expect(sut.get('B')).toBe(2);
    expect(sut.get('D')).toBe(4);
    expect(sut.get('E')).toBe(5);
  });

  test('evict', () => {
    const sut = new LRUCache<string, number>(3, false);

    sut.put('A', 1);
    sut.put('B', 2);
    sut.put('C', 3);
    sut.put('D', 4);
    sut.put('E', 5);
    
    expect(sut.size).toBe(5);

    // 'B' and 'D' are least entries.
    sut.get('A');
    sut.get('C');

    sut.evict();

    expect(sut.size).toBe(3);
    expect(sut.get('A')).toEqual(1);
    expect(sut.get('C')).toEqual(3);
    expect(sut.get('E')).toEqual(5);
  });
});

const buildParseProfileInput = (kind: number, content: string): RelayMessageEvent<EventMessage> => {
  return {
    relay: new Relay('wss://host'),
    received: {
      type: 'EVENT',
      subscriptionID: 'my-sub',
      event: {
        kind,
        content,
        id: 'ID', 
        pubkey: 'PUBKEY', 
        created_at: 123456789,
        tags: [], 
        sig: 'SIG',
      }
    }
  };
}

test.each([
  {
    name: 'full',
    message: buildParseProfileInput(0, '{"name":"nostr","about":"this is jest","picture":"https://pic","nip05":"https://nip05","other":"foo"}'),
    expected: {
      name: 'nostr',
      about: 'this is jest',
      picture: 'https://pic',
      nip05: 'https://nip05',
      createdAt: 123456789,
      relayURL: 'wss://host'
    },
  },
  {
    name: 'name is not string',
    message: buildParseProfileInput(0, '{"name":123,"about":"this is jest","picture":"https://pic","nip05":"https://nip05","other":"foo"}'),
    expected: {
      about: 'this is jest',
      picture: 'https://pic',
      nip05: 'https://nip05',
      createdAt: 123456789,
      relayURL: 'wss://host'
    },
  },
  {
    name: 'name is empty',
    message: buildParseProfileInput(0, '{"name":"","about":"this is jest","picture":"https://pic","nip05":"https://nip05","other":"foo"}'),
    expected: {
      about: 'this is jest',
      picture: 'https://pic',
      nip05: 'https://nip05',
      createdAt: 123456789,
      relayURL: 'wss://host'
    },
  },
  {
    name: 'about is not string',
    message: buildParseProfileInput(0, '{"name":"nostr","about":123,"picture":"https://pic","nip05":"https://nip05","other":"foo"}'),
    expected: {
      name: "nostr",
      picture: 'https://pic',
      nip05: 'https://nip05',
      createdAt: 123456789,
      relayURL: 'wss://host'
    },
  },
  {
    name: 'about is empty',
    message: buildParseProfileInput(0, '{"name":"nostr","about":"","picture":"https://pic","nip05":"https://nip05","other":"foo"}'),
    expected: {
      name: "nostr",
      picture: 'https://pic',
      nip05: 'https://nip05',
      createdAt: 123456789,
      relayURL: 'wss://host'
    },
  },
  {
    name: 'picture is not string',
    message: buildParseProfileInput(0, '{"name":"nostr","about":"this is jest","picture":123,"nip05":"https://nip05","other":"foo"}'),
    expected: {
      name: "nostr",
      about: 'this is jest',
      nip05: 'https://nip05',
      createdAt: 123456789,
      relayURL: 'wss://host'
    },
  },
  {
    name: 'picture is empty',
    message: buildParseProfileInput(0, '{"name":"nostr","about":"this is jest","picture":"","nip05":"https://nip05","other":"foo"}'),
    expected: {
      name: "nostr",
      about: 'this is jest',
      nip05: 'https://nip05',
      createdAt: 123456789,
      relayURL: 'wss://host'
    },
  },
  {
    name: 'nip05 is not string',
    message: buildParseProfileInput(0, '{"name":"nostr","about":"this is jest","picture":"https://pic","nip05":123,"other":"foo"}'),
    expected: {
      name: 'nostr',
      about: 'this is jest',
      picture: 'https://pic',
      createdAt: 123456789,
      relayURL: 'wss://host'
    },
  },
  {
    name: 'nip05 is empty',
    message: buildParseProfileInput(0, '{"name":"nostr","about":"this is jest","picture":"https://pic","nip05":"","other":"foo"}'),
    expected: {
      name: 'nostr',
      about: 'this is jest',
      picture: 'https://pic',
      createdAt: 123456789,
      relayURL: 'wss://host'
    },
  },
  {
    name: 'no property',
    message: buildParseProfileInput(0, '{}'),
    expected: {
      createdAt: 123456789,
      relayURL: 'wss://host'
    },
  },
  {
    name: 'array',
    message: buildParseProfileInput(0, '[]'),
    expected: undefined,
  },
  {
    name: 'not object',
    message: buildParseProfileInput(0, '"bar"'),
    expected: undefined,
  },
  {
    name: 'broken json',
    message: buildParseProfileInput(0, '{'),
    expected: undefined,
  }
])('parseProfile($name)', ({ message, expected }) => {
  expect(parseProfile(message)).toEqual(expected);
});

describe('AutoProfileSubscriber', () => {
  test('capturePublishedEvent', () => {
    const sut = new AutoProfileSubscriber({
      collectPubkeyFromEvent: (e, relayURL) => {
        return [e.pubkey];
      },
    });

    sut.capturePublishedEvent({
      id: 'THISISID',
      kind: 1,
      pubkey: 'PUBKEY',
      content: '',
      created_at: 123456789,
      tags: [],
      sig: 'SIG',
    });

    // @ts-ignore
    expect(sut.pubkeyBacklog).toEqual(new Set(['PUBKEY']));

    sut.uninstall();
  });

  test('captureReceivedEvent', () => {
    const sut = new AutoProfileSubscriber({
      collectPubkeyFromEvent: (e, relayURL) => {
        return [`${e.pubkey}-${relayURL}`];
      },
    });

    sut.captureReceivedEvent({
      relay: new Relay('wss://host'),
      received: {
        type: 'EVENT',
        subscriptionID: 'my-sub',
        event: {
          id: 'THISISID',
          kind: 1,
          pubkey: 'PUBKEY',
          content: '',
          created_at: 123456789,
          tags: [],
          sig: 'SIG',
        }
      }
    });

    // @ts-ignore
    expect(sut.pubkeyBacklog).toEqual(new Set(['PUBKEY-wss://host']));

    sut.uninstall();
  });

  test('captureRequestedFilter', () => {
    const sut = new AutoProfileSubscriber({
      collectPubkeyFromFilter: (filter) => {
        return [filter.authors?.pop() || 'N/A'];
      },
    });

    sut.captureRequestedFilter({ authors: ['PUBKEY'] });

    // @ts-ignore
    expect(sut.pubkeyBacklog).toEqual(new Set(['PUBKEY']));

    sut.uninstall();
  });

  test('subscribe by ticker', async () => {
    const relay = new Relay('wss://host', { watchDogInterval: 0 });
    const mux = new Mux();

    mux.addRelay(relay);

    // @ts-ignore
    relay.ws.readyState = 1;
    // @ts-ignore
    relay.ws.dispatch('open', null);

    const sut = new AutoProfileSubscriber({
      collectPubkeyFromFilter: () => { return []; },
      tickInterval: 10,
      timeout: 2000,
    });

    mux.installPlugin(sut);

    
    // run ticker after 10ms
    let profileForPUBKEY: Profile | undefined;
    sut.get('PUBKEY').then(result => profileForPUBKEY = result);  

    sut.get('PUBKEY2'); // before run ticker, push to backlog

    await new Promise(r => setTimeout(r, 1000)); // ticker is running

    sut.get('PUBKEY3'); // push to backlog while ticker is running

    // emit for first ticker
    relay.onEvent.emit({
      relay,
      received: {
        type: 'EVENT',
        subscriptionID: '__profile',
        event: {
          kind: 0,
          content: '{"name":"nostr","about":"this is jest","picture":"https://pic","nip05":"https://nip05"}',
          id: 'ID', 
          pubkey: 'PUBKEY', 
          created_at: 123456789,
          tags: [], 
          sig: 'SIG',
        }
      }
    });

    await new Promise(r => setTimeout(r, 5000));

    expect(profileForPUBKEY).toEqual({
      name: 'nostr',
      about: 'this is jest',
      picture: 'https://pic',
      nip05: 'https://nip05',
      createdAt: 123456789,
      relayURL: 'wss://host',
    });

    // @ts-ignore
    expect(sut.cache.get('PUBKEY')).toEqual({
      foundProfile: {
        name: 'nostr',
        about: 'this is jest',
        picture: 'https://pic',
        nip05: 'https://nip05',
        createdAt: 123456789,
        relayURL: 'wss://host',
      }
    });

    // @ts-ignore
    expect(relay.ws.sent).toEqual([
      '["REQ","__profile",{"kinds":[0],"authors":["PUBKEY","PUBKEY2"]}]',
      '["CLOSE","__profile"]',
      '["REQ","__profile",{"kinds":[0],"authors":["PUBKEY3"]}]', // first ticker calls immediately next ticker for 'PUBKEY3' in backlog
      '["CLOSE","__profile"]',
    ]);
  }, 10000);
});
