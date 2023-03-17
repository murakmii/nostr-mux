import { 
  Filter,
  RelayEvent,
  EventMessage,
  EoseMessage,
  OkMessage,
  RelayMessageEvent,
  Relay
} from "./relay.js";

import { Event, verifyEvent } from "./event.js";

export interface PublishOptions {
  relays?: string[];
  timeout?: number;
  onResult?: (result: RelayMessageEvent<OkMessage>) => void;
  onComplete?: (results: RelayMessageEvent<OkMessage>[]) => void;
}

export interface BufferOptions {
  flushInterval: number;
  maxEventCount?: number;
}

export interface SubscriptionOptions {
  filters: [Filter, ...Filter[]];
  onEvent: (events: [RelayMessageEvent<EventMessage>, ...RelayMessageEvent<EventMessage>[]]) => void;

  id?: string;
  enableBuffer?: BufferOptions;
  eoseTimeout?: number;
  onEose?: (subID: string) => void;
  onRecovered?: (relay: Relay, isNew: boolean) => Filter[];
}

export abstract class Plugin {
  abstract id(): string;

  install(mux: Mux): void {}
  uninstall(): void {}

  capturePublishedEvent(event: Event): void {}
  captureRequestedFilter(filter: Filter): void {}
  captureReceivedEvent(e: RelayMessageEvent<EventMessage>): void {}
}

export class EventMatcher {
  private ids?: Set<string>;
  private authors?: Set<string>;
  private kinds?: Set<number>;
  private tags: { [K: string]: Set<string> };
  private since?: number;
  private until?: number;

  constructor(filter: Filter) {
    if (filter.ids) {
      this.ids = new Set(filter.ids);
    }

    if (filter.authors) {
      this.authors = new Set(filter.authors);
    }

    if (filter.kinds) {
      this.kinds = new Set(filter.kinds);
    }

    this.tags = {};
    for (const key in filter) {
      if (key.startsWith('#')) {
        const tag = key.slice(1);
        if (!this.tags[tag]) {
          this.tags[tag] = new Set();
        }

        for (const v of filter[`#${tag}`]) {
          this.tags[tag].add(v);
        }
      }
    }

    this.since = filter.since;
    this.until = filter.until;
  }

  test(event: Event): boolean {
    if (this.ids && !this.ids.has(event.id)) {
      return false;
    }

    if (this.authors && !this.authors.has(event.pubkey)) {
      return false;
    }

    if (this.kinds && !this.kinds.has(event.kind)) {
      return false;
    }

    let matchTag = true;
    for (const expectTag in this.tags) {
      if (!event.tags.find(t => t[0] === expectTag && this.tags[expectTag].has(t[1]))) {
        matchTag = false;
        break;
      }
    }

    if (!matchTag) {
      return false;
    }

    if (this.since && this.since > event.created_at) {
      return false;
    }

    if (this.until && this.until < event.created_at) {
      return false;
    }

    return true;
  }
}

const atLeastOneEvent = (events: RelayMessageEvent<EventMessage>[]): events is [RelayMessageEvent<EventMessage>, ...RelayMessageEvent<EventMessage>[]] => {
  return events.length > 0;
}

export class Subscription {
  private id: string;
  private sentFilterOnce: Set<string>;
  private eoseWaitList: Set<string>;
  private filters: Filter[];
  private eventMatchers: EventMatcher[];

  private bufferOpts: BufferOptions;
  private buffered: RelayMessageEvent<EventMessage>[];
  private bufferFlusher?: NodeJS.Timeout;

  private eventHandler: (events: [RelayMessageEvent<EventMessage>, ...RelayMessageEvent<EventMessage>[]]) => void;
  private eoseHandler: undefined | ((subID: string) => void);
  private recoveredHandler: undefined | ((relay: Relay, isNew: boolean) => Filter[]);

  constructor(id: string, initialRelays: Relay[], subOptions: SubscriptionOptions) {
    this.id = id;
    this.sentFilterOnce = new Set(initialRelays.map(r => r.url));
    this.eoseWaitList = new Set(initialRelays.map(r => r.url));
    this.filters = subOptions.filters;
    this.eventMatchers = subOptions.filters.map(f => new EventMatcher(f));

    this.bufferOpts = subOptions.enableBuffer || { flushInterval: 0 };
    this.buffered = [];
    
    this.eventHandler = subOptions.onEvent;
    this.eoseHandler = subOptions.onEose;
    this.recoveredHandler = subOptions.onRecovered;

    // If subscription started with no healthy relays, calls EOSE handler immediately.
    if (this.eoseWaitList.size === 0) {
      setTimeout(() => this.eoseHandler?.(this.id), 0);
    }
  }

  get isAfterEose(): boolean {
    return this.eoseWaitList.size === 0;
  }

  consumeEvent(e: RelayMessageEvent<EventMessage>): void {
    // When we reuse subscription id with different filter,
    // a event that does NOT match current filter could be responded
    // by high-latency relays.
    // So, we SHOULD always check whether event matches current filter.
    for (const matcher of this.eventMatchers) {
      if (matcher.test(e.received.event)) {
        this.handleEvent(e);
        break;
      }
    }
  }

  consumeEose(senderRelayURL: string): void {
    if (!this.eoseWaitList.has(senderRelayURL)) {
      return;
    }

    this.eoseWaitList.delete(senderRelayURL);
    if (this.isAfterEose) {
      this.flushBuffered(); // We SHOULD maintain EVENT and EOSE ordering.
      this.eoseHandler?.(this.id);
    }
  }

  recoveryFilters(relay: Relay): Filter[] {
    const isNew = !this.sentFilterOnce.has(relay.url);
    this.sentFilterOnce.add(relay.url);
    
    if (this.recoveredHandler) {
      return this.recoveredHandler(relay, isNew);
    }

    if (isNew) {
      return this.filters
    } else {
      return this.filters
        .map(f => this.buildRecoveryFilter(f))
        .filter((f): f is NonNullable<typeof f> => f !== null);
    }
  }

  unSubscribe() {
    this.flushBuffered();
  }

  private buildRecoveryFilter(filter: Filter): Filter | null {
    const now = Math.floor(new Date().getTime() / 1000);
    const newFilter: Filter = { ...filter };

    if (newFilter.until && newFilter.until < now) {
      return null;
    }

    if (!newFilter.since || newFilter.since < now) {
      newFilter.since = now;
    } 

    return newFilter;
  }

  private handleEvent(e: RelayMessageEvent<EventMessage>) {
    if (this.bufferOpts.flushInterval === 0) {
      this.eventHandler([e]);
      return;
    }

    this.buffered.push(e);
    if (typeof this.bufferOpts.maxEventCount === 'number' && this.buffered.length >= this.bufferOpts.maxEventCount) {
      this.flushBuffered();
      return;
    }

    if (!this.bufferFlusher) {
      this.bufferFlusher = setTimeout(() => this.flushBuffered(), this.bufferOpts.flushInterval);
    }
  }

  private flushBuffered() {
    if (this.bufferFlusher) {
      clearTimeout(this.bufferFlusher);
      this.bufferFlusher = undefined;
    }

    if (!atLeastOneEvent(this.buffered)) {
      return;
    }    

    this.eventHandler(this.buffered);
    this.buffered = [];
  }
}

export class CommandResult {
  private waitList: Set<string>;
  private results: RelayMessageEvent<OkMessage>[];
  private onResult?: (result: RelayMessageEvent<OkMessage>) => void;
  private onComplete?: (results: RelayMessageEvent<OkMessage>[]) => void;

  constructor(waitList: Relay[], options: PublishOptions) {
    this.waitList = new Set(waitList.map(r => r.url));
    this.results = [];
    this.onResult = options.onResult;
    this.onComplete = options.onComplete;
  }

  get hasCompleted(): boolean {
    return this.waitList.size === 0;
  }

  consumeResult(e: RelayMessageEvent<OkMessage>) {
    if (!this.waitList.has(e.relay.url)) {
      return;
    }

    this.waitList.delete(e.relay.url);
    this.results.push(e);

    this.onResult?.(e);
    
    if (this.hasCompleted && this.onComplete) {
      this.onComplete(this.results);
    }
  }
}

/**
 * `Mux` class multiplexes multiple `Relay`s
 */
export class Mux {
  private relays: { [K: string]: Relay };
  private subs: { [K: string]: Subscription }
  private subIDSeq: number;
  private cmds: { [K: string]: CommandResult };
  private healthyWatchers: Set<(() => void)>;
  private plugins: { [K: string]: Plugin };

  private handleRelayHealthy: (e: RelayEvent) => void;
  private handleRelayEvent: (e: RelayMessageEvent<EventMessage>) => void;
  private handleRelayEose: (e: RelayMessageEvent<EoseMessage>) => void;
  private handleRelayResult: (e: RelayMessageEvent<OkMessage>) => void;

  constructor() {
    this.relays = {};
    this.subs = {};
    this.subIDSeq = 1;
    this.cmds = {};
    this.healthyWatchers = new Set<(() => void)>();
    this.plugins = {};

    this.handleRelayEvent = (e: RelayMessageEvent<EventMessage>): void => {
      for (const pid in this.plugins) {
        this.plugins[pid].captureReceivedEvent(e);
      }

      this.subs[e.received.subscriptionID]?.consumeEvent(e);
    };

    this.handleRelayEose = (e: RelayMessageEvent<EoseMessage>): void => {
      this.subs[e.received.subscriptionID]?.consumeEose(e.relay.url);
    };

    this.handleRelayResult = (e: RelayMessageEvent<OkMessage>): void => {
      const cmd = this.cmds[e.received.eventID];
      if (!cmd) {
        return;
      }

      cmd.consumeResult(e);
      if (cmd.hasCompleted) {
        delete this.cmds[e.received.eventID];
      }
    };

    this.handleRelayHealthy = (e: RelayEvent): void => {
      // For `waitRelayBecomesHealthy`.
      for (const watcher of this.healthyWatchers) {
        watcher();
      }

      if (!e.relay.isReadable) {
        return;
      }

      // Start subscription that is already started on other relays.
      for (const subID in this.subs) {
        const recoveryFilters = this.subs[subID].recoveryFilters(e.relay);
        if (recoveryFilters.length > 0) {
          e.relay.request(subID, recoveryFilters);
        }
      }
    }
  }

  get allRelays(): Relay[] {
    return Object.values(this.relays);
  }

  get healthyRelays(): Relay[] {
    return this.allRelays.filter(r => r.isHealthy);
  }

  installPlugin(plugin: Plugin) {
    this.plugins[plugin.id()] = plugin;
    plugin.install(this);
  }

  uninstallPlugin(pluginID: string) {
    if (!this.plugins[pluginID]) {
      return;
    }

    this.plugins[pluginID].uninstall();
    delete this.plugins[pluginID];
  }

  /**
   * `addRelay` method adds `relay` to multiplexed relays set.
   * This method calls automatically `connect` method of relay is added.
   * 
   * @param relay
   */
  addRelay(relay: Relay): void {
    if (this.relays[relay.url]) {
      return;
    }

    relay.onHealthy.listen(this.handleRelayHealthy);
    relay.onEvent.listen(this.handleRelayEvent);
    relay.onEose.listen(this.handleRelayEose);
    relay.onResult.listen(this.handleRelayResult);
    relay.connect();

    this.relays[relay.url] = relay;
  }

  /**
   * `removeRelay` method removes `relay` from multiplexed relays set.
   * This method calls automatically `terminate` method of relay is removed.
   * 
   * @param url 
   */
  removeRelay(url: string): void {
    const relay = this.relays[url];
    if (!relay) {
      return;
    }
    delete this.relays[url];

    relay.terminate();
    relay.onHealthy.stop(this.handleRelayHealthy);
    relay.onEvent.stop(this.handleRelayEvent);
    relay.onEose.stop(this.handleRelayEose);
    relay.onResult.stop(this.handleRelayResult);
  }

  /**
   * `waitRelayBecomesHealthy` method waits until becoming healthy relays count will be greater than or equal to `n`.
   * 
   * @param n 
   * @param timeout 
   * @returns Promise if healthy relays count becomes greater than or equal to `n` before timeout, resolves `true`, else resolves `false`.
   */
  waitRelayBecomesHealthy(n: number, timeout: number): Promise<boolean> {
    if (this.healthyRelays.length >= n) {
      return Promise.resolve(true);
    }
    
    return new Promise<boolean>(resolve => {
      let timer: NodeJS.Timeout, watcher: () => void;

      timer = setTimeout(() => {
        this.healthyWatchers.delete(watcher);
        resolve(false);
      }, timeout);

      watcher = () => {
        if (this.healthyRelays.length < n) {
          return;
        }

        this.healthyWatchers.delete(watcher);
        clearTimeout(timer);
        resolve(true);
      };

      this.healthyWatchers.add(watcher);
    });
  }

  /**
   * `publish` method publishes event relays.
   * This method verifies event before publishing.
   * 
   * @param event Event will be published
   * @param options 
   */
  publish(event: Event, options: PublishOptions = {}) {
    const targets = this.allRelays.filter(r => {
      return r.isWritable && (!options.relays || options.relays.find(fr => fr === r.url));
    });

    if (targets.length === 0) {
      throw new Error('No relays for publishing');
    }

    verifyEvent(event)
      .then(result => {
        if (typeof result === 'string') {
          throw new Error(`failed to publish event: ${result}`);
        }

        this.cmds[event.id] = new CommandResult(targets, options);
        for (const relay of targets) {
          relay.publish(event, options.timeout || 5000)
        }

        for (const pid in this.plugins) {
          this.plugins[pid].capturePublishedEvent(event);
        }
      })
      .catch(e => { throw e });
  }

  /**
   * Start subscription
   * 
   * @param options 
   * @returns Started subscription id
   */
  subscribe(options: SubscriptionOptions): string {
    const subID = options.id || `__sub:${this.subIDSeq++}`;
    if (this.subs[subID]) {
      throw new Error(`Subscription ID("${subID}") has been used`);
    }

    const initialRelays = this.healthyRelays.filter(r => r.isReadable);
    this.subs[subID] = new Subscription(subID, initialRelays, options);

    for (const filter of options.filters) {
      for (const pid in this.plugins) {
        this.plugins[pid].captureRequestedFilter(filter);
      }
    }

    for (const relay of initialRelays) {
      relay.request(subID, options.filters, { eoseTimeout: options.eoseTimeout });
    }

    return subID;
  }

  /**
   * Stop subscription.
   * 
   * @param subID 
   */
  unSubscribe(subID: string): void {
    for (const relay of this.allRelays) {
      relay.close(subID);
    }

    if (this.subs[subID]) {
      this.subs[subID].unSubscribe();
      delete this.subs[subID];
    }
  }
}
