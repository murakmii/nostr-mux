import { Plugin, Mux } from "../core/mux.js";
import { Event } from '../core/event.js';
import { EventMessage, RelayMessageEvent, Filter } from "../core/relay.js";

export type AutoProfileSubscriberOptions<T> = {
  parser: ProfileParser<T>;

  collectPubkeyFromEvent?: (event: Event, relayURL?: string) => string[];
  collectPubkeyFromFilter?: (filter: Filter) => string[];

  cacheCapacity?: number;
  autoEvict?: boolean;
  tickInterval?: number;
  timeout?: number;
}

export type Profile<T> = {
  properties: T;
  createdAt: number;
  relayURL: string;
}

export type GenericProfile = {
  name?: string;
  displayName?: string;
  about?: string;
  picture?: string;
  nip05?: string;
}

export type UnknownProfile = { [K: string]: any };

export type ProfileParser<T> = (conetnt: UnknownProfile) => T | undefined;

export const parseGenericProfile: ProfileParser<GenericProfile> = (content) => {
  const profile: GenericProfile = {};
  const { name, display_name, about, picture, nip05 } = content;

  if (typeof name === 'string' && name.length > 0) {
    profile.name = name;
  }

  if (typeof display_name === 'string' && display_name.length > 0) {
    profile.displayName = display_name;
  }

  if (typeof about === 'string' && about.length > 0) {
    profile.about = about;
  }

  if (typeof picture === 'string' && picture.length > 0) {
    profile.picture = picture;
  }

  if (typeof nip05 === 'string' && nip05.length > 0) {
    profile.nip05 = nip05;
  }

  return profile;
}

export interface Cache<K, V> {
  get size(): number;
  get(key: K): V | undefined;
  put(key: K, value: V): void;
  has(key: K): boolean;
  evict(): void;
  clear(): void;
}

export class LRUCache<K, V> implements Cache<K, V> {
  private cache: Map<K, V>;
  private capacity: number;
  private autoEvict: boolean;

  constructor(capacity: number, autoEvict: boolean) {
    this.cache = new Map();
    this.capacity = capacity;
    this.autoEvict = autoEvict;
  }

  get size(): number {
    return this.cache.size;
  }

  get(key: K): V | undefined {
    const v = this.cache.get(key);
    if (typeof v === 'undefined') {
      return undefined;
    }

    this.cache.delete(key);
    this.cache.set(key, v);

    return v;
  }

  put(key: K, value: V) {
    this.cache.delete(key);
    if (this.autoEvict && this.cache.size >= this.capacity) {
      this.cache.delete(this.cache.keys().next().value);
    }

    this.cache.set(key, value);
  }

  has(key: K): boolean {
    return this.cache.has(key);
  }

  evict(): void {
    let evictCount = this.cache.size - this.capacity;
    if (evictCount < 1) {
      return;
    }

    const evictKeys: K[] = [];
    const iter = this.cache.keys();
    while (evictCount-- > 0) {
      evictKeys.push(iter.next().value);
    }

    for (const k of evictKeys) {
      this.cache.delete(k);
    }
  }

  clear() {
    this.cache.clear();
  }
}

export const parseProfile = <T>(e: RelayMessageEvent<EventMessage>, parser: ProfileParser<T>): Profile<T> | undefined => {
  const event = e.received.event;
  if (event.kind !== 0) {
    return undefined;
  }

  let parsed: any;
  try {
    parsed = JSON.parse(event.content);
  } catch {
    return undefined;
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return undefined;
  }

  const properties = parser(parsed);
  if (!properties) {
    return undefined;
  }

  return { properties, createdAt: event.created_at, relayURL: e.relay.url };
};

const autoProfileSubscriberSubID = '__profile';

type ProfileCacheEntry<T> = { foundProfile?: Profile<T> };

/**
 * AutoProfileSubscriber is plugin that subscribes profiles automatically.
 * When profile was subscribed, `onSubscribed` is emitted and profile is cached in `cache` property.
 */
export class AutoProfileSubscriber<T> extends Plugin {
  private mux?: Mux;
  private parser: ProfileParser<T>;
  private tickInterval: number;
  private timeout: number;
  private pubkeyBacklog: Set<string>;
  private waitingPromises: { [K: string]: ((result: Profile<T> | undefined) => void)[] };

  private collectPubkeyFromFilter?: (filter: Filter) => string[];
  private collectPubkeyFromEvent?: (event: Event, relayURL?: string) => string[];

  private ticker: () => void;
  private activeTicker?: NodeJS.Timeout;

  private cache: Cache<string, ProfileCacheEntry<T>>;

  constructor(options: AutoProfileSubscriberOptions<T>) {
    super();
    this.parser = options.parser;

    if (!options.collectPubkeyFromEvent && !options.collectPubkeyFromFilter) {
      throw new Error("AutoProfileSubscriber's options is NOT set collector function");
    }

    this.cache = new LRUCache(
      options.cacheCapacity || 1000, 
      typeof options.autoEvict === 'boolean' ? options.autoEvict : false,
    );

    this.tickInterval = options.tickInterval || 1000;
    this.timeout = options.timeout || 5000;
    this.pubkeyBacklog = new Set();
    this.waitingPromises = {};

    this.collectPubkeyFromFilter = options.collectPubkeyFromFilter;
    this.collectPubkeyFromEvent = options.collectPubkeyFromEvent;

    this.ticker = (): void => {
      const filter: Filter = { kinds: [0], authors: [] };
      const results: { [K: string]: ProfileCacheEntry<T> } = {};
      for (const pubkey of this.pubkeyBacklog) {
        if (this.cache.has(pubkey)) {
          this.resolveWaitingPromises(pubkey, this.cache.get(pubkey)?.foundProfile);
          continue;
        }

        results[pubkey] = { foundProfile: undefined };
        filter.authors?.push(pubkey);
      }

      this.pubkeyBacklog.clear(); // To accept pubkey while ticker is running.

      if (filter.authors?.length === 0) {
        this.finishTicker();
        return;
      }

      this.mux?.subscribe({
        id: autoProfileSubscriberSubID,
        filters: [filter],
        onEvent: events => {
          for (const e of events) {
            const pubkey = e.received.event.pubkey;
            const received = parseProfile(e, this.parser);
            if (!received) {
              return;
            }

            const exist = results[pubkey].foundProfile;
            if (!exist || exist.createdAt < received.createdAt) {
              results[pubkey].foundProfile = received;
            }
          }
        },
        onEose: () => {
          this.mux?.unSubscribe(autoProfileSubscriberSubID);

          for (const pubkey in results) {
            this.cache.put(pubkey, results[pubkey]);
            this.resolveWaitingPromises(pubkey, results[pubkey].foundProfile);
          }

          this.finishTicker();
        },
        eoseTimeout: this.timeout,
      });
    };
  }

  id(): string {
    return 'auto_profile_subscriber';
  }

  install(mux: Mux) {
    this.mux = mux;
  }

  uninstall(): void {
    if (this.activeTicker) {
      clearTimeout(this.activeTicker);
      this.activeTicker = undefined;
    }

    this.mux?.unSubscribe(autoProfileSubscriberSubID);
    this.mux = undefined;

    this.cache.clear();
    this.pubkeyBacklog.clear();

    for (const pubkey in this.waitingPromises) {
      for (const resolve of this.waitingPromises[pubkey]) {
        resolve(undefined);
      }
    }

    this.waitingPromises = {};
  }

  capturePublishedEvent(event: Event) {
    const collected = this.collectPubkeyFromEvent?.(event, undefined) || [];
    for (const pubkey of collected) {
      this.enqueueBacklog(pubkey);
    }
  }

  captureRequestedFilter(filter: Filter) {
    const collected = this.collectPubkeyFromFilter?.(filter) || [];
    for (const pubkey of collected) {
      this.enqueueBacklog(pubkey);
    }
  }

  captureReceivedEvent(e: RelayMessageEvent<EventMessage>) {
    const collected = this.collectPubkeyFromEvent?.(e.received.event, e.relay.url) || [];
    for (const pubkey of collected) {
      this.enqueueBacklog(pubkey);
    }
  }

  get(pubkey: string): Promise<Profile<T> | undefined> {
    if (!this.mux) {
      throw new Error('AutoProfileSubscriber is NOT installed');
    }

    if (this.cache.has(pubkey)) {
      return Promise.resolve(this.cache.get(pubkey)?.foundProfile);
    }

    this.enqueueBacklog(pubkey);

    return new Promise(r => {
      if (!this.waitingPromises[pubkey]) {
        this.waitingPromises[pubkey] = [];
      }
      this.waitingPromises[pubkey].push(r);
    });
  }

  evictCache() {
    this.cache.evict();
  }

  clearCache() {
    this.cache.clear();
  }

  private enqueueBacklog(pubkey: string): void {
    if (this.cache.has(pubkey) || this.pubkeyBacklog.has(pubkey)) {
      return;
    }

    this.pubkeyBacklog.add(pubkey);

    if (!this.activeTicker) {
      this.activeTicker = setTimeout(this.ticker, this.tickInterval);
    }
  }

  private resolveWaitingPromises(pubkey: string, result: Profile<T> | undefined) {
    const resolves = this.waitingPromises[pubkey];
    if (!resolves) {
      return;
    }

    for (const r of resolves) {
      r(result);
    }

    delete this.waitingPromises[pubkey];
  }

  private finishTicker() {
    // If pubkey was pushed to backlog while ticker is running, we run next ticker immediately.
    this.activeTicker = this.pubkeyBacklog.size > 0 ? setTimeout(this.ticker, 0) : undefined;
  }
}
