import { Mux } from './mux';
import { EventMessage, Relay, RelayMessageEvent, Filter } from './relay';

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

  test('subscribe', async () => {
    const relay1 = new Relay('wss://host1', { watchDogInterval: 0 });
    const relay2 = new Relay('wss://host2', { watchDogInterval: 0 });
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

  test('subscribe and auto recovery', async () => {
    const relay = new Relay('wss://host', { watchDogInterval: 0 });
    const sut = new Mux();

    sut.addRelay(relay);

    sut.subscribe({
      filters: [{ kinds: [1] }],
      onEvent: (e: RelayMessageEvent<EventMessage>) => {},
    });

    await new Promise(r => setTimeout(r, 10));

    // @ts-ignore
    relay.ws.readyState = 1;
    // @ts-ignore
    relay.ws.dispatch('open', null);

    // @ts-ignore
    expect(relay.ws.sent.length).toEqual(1);
    // @ts-ignore
    expect(relay.ws.sent[0]).toMatch(/\["REQ","__sub:1",\{"kinds":\[1\],"since":\d+\}\]/);
  });

  test('subscribe and auto recovery', async () => {
    const relay = new Relay('wss://host', { watchDogInterval: 0 });
    const sut = new Mux();

    sut.addRelay(relay);

    sut.subscribe({
      filters: [{ kinds: [1], until: 10 }],
      onEvent: (e: RelayMessageEvent<EventMessage>) => {},
    });

    await new Promise(r => setTimeout(r, 10));

    // @ts-ignore
    relay.ws.readyState = 1;
    // @ts-ignore
    relay.ws.dispatch('open', null);

    // @ts-ignore
    expect(relay.ws.sent).toEqual([]);
  });
});
