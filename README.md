# nostr-mux

Multiplexed connections management for Nostr client.

```js
import { Mux, Relay } from 'nostr-mux';

// Instantiate connection for relay.
const relay1 = new Relay('wss://relay.snort.social');
const relay2 = new Relay('wss://relay.damus.io');

const mux = new Mux();

// Multiplexe them.
mux.addRelay(relay1);
mux.addRelay(relay2);

// Subscribe
mux.waitRelayBecomesHealthy(1, 3000)
  .then(ok => {
    if (!ok) {
      console.error('no healthy relays');
      return;
    }

    mux.subscribe({
      filters: [
        { kinds: [1] }
      ],

      onEvent: (e) => {
        console.log(`received event(from: ${e.relay.url})`, e.received.event);
      },

      onEose: (subID) => {
        console.log(`subscription(id: ${subID}) EOSE`);
      },

      onRecovered: (relay) => {
        console.log(`relay(${relay.url}) was added or recovered. It joins subscription`);

        return [
          { kinds: [1], since: Math.floor(Date.now() / 1000) }
        ]
      },
    })  
  });

// Whenever, we can add or remove relay.
mux.removeRelay(relay2.url);

// Get events at once
new Promise(resolve => {
  const events = [];

  mux.waitRelayBecomesHealthy(1, 3000)
    .then(ok => {
      if (!ok) {
        console.error('no healthy relays');
        return;
      }

      mux.subscribe({
        filters: [
          { kinds: [1], limit: 100 }
        ],

        onEvent: (e) => events.push(e.received.event),

        onEose: (subID) => {
          mux.unSubscribe(subID);
          resolve(events);
        },
      })  
    });
});

// Publish event
mux.publish(
  {
    id: '...',
    pubkey: '...',
    created_at: Math.floor(Date.now() / 1000),
    kind: 1,
    tags: [],
    content: 'hello!',
    sig: '...',
  },
  {
    onResult: (results) => {
      const accepted = results.filter(r => r.received.accepted).length;
      console.log(`event published and accepted on ${accepted}/${results.length} relays`);
    },
  }
);
```
