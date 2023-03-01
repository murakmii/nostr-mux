# nostr-mux

Connection management for Nostr client.

## For single relay

```js
import { Relay } from 'nostr-mux';

const relay = new Relay('wss://example.com', {
  connectTimeout: 2000,
  watchDogInterval: 60000,
  keepAliveTimeout: 60000,
});

relay.onHealthy.listen(e => {
  console.log(`connected! ${e.relay.url}`);
});

relay.onEvent.listen(e => {
  console.log(`received event: ${e.received.event}`);
});

relay.onEose.listen(e => {
  console.log(`received EOSE on subscription: ${e.received.subscriptionID}`);
});
```

## For multiple relays

TODO