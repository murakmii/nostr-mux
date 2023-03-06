import { Event, Tag } from "../core/event.js";
import { Mux, Plugin } from "../core/mux.js";
import { buildSimpleLogger, Logger, LogLevel } from "../core/logger.js";
import { 
  RelayMessageEvent, 
  EventMessage, 
  Filter,
  RelayOptions, 
  RelayPermission,
  Relay, 
} from "../core/relay.js";

const relayListKind = 10002;
const subID = '__relay_list';

interface RelayListEvent {
  kind: number;
  tags: Tag[];
  created_at: number;
}

interface RelayListEntry extends RelayPermission {
  url: string;
}

export interface AutoRelayListOptions {
  logger?: Logger | LogLevel;
  pubkey?: string;
  initialLoadTimeout?: number;
  relayOptionsTemplate?: RelayOptions;
}

export const parseEvent = (e: RelayListEvent): RelayListEntry[] | null => {
  if (e.kind !== relayListKind) {
    return null;
  }

  const entries: RelayListEntry[] = [];
  for (const tag of e.tags) {
    if (tag[0] !== 'r' || tag.length < 2 || tag.length > 3) {
      continue;
    }

    switch (tag.length) {
      case 2:
        entries.push({ url: tag[1], read: true, write: true });
        break;

      case 3:
        entries.push({ url: tag[1], read: tag[2] === 'read', write: tag[2] === 'write' });
        break;

      default:
        continue;
    }
  }

  return entries;
}

export class AutoRelayList extends Plugin {
  private mux: Mux | null = null;
  private log: Logger;
  private pubkey: string | null;
  private eoseTimeout: number;
  private fallbackRelays: string[];
  private lastEvent: RelayListEvent | null = null;
  private relayOptsTpl: RelayOptions; 

  constructor(options: AutoRelayListOptions = {}) {
    super();
    this.log = buildSimpleLogger(options.logger);
    this.pubkey = options.pubkey || null;
    this.eoseTimeout = options.initialLoadTimeout || 2000;
    this.fallbackRelays = [];
    this.relayOptsTpl = options.relayOptionsTemplate || {};
  }

  id(): string {
    return 'auto_relay_list';
  }

  install(mux: Mux): void {
    this.mux = mux;

    this.fallbackRelays = this.mux.allRelays.map(r => r.url);
    if (this.fallbackRelays.length === 0) {
      throw new Error('[nostr-mux:plugin:AutoRelayList] requires default relays on Mux');
    }

    this.startSubscription();
  }

  uninstall(): void {
    this.mux?.unSubscribe(subID);
  }

  capturePublishedEvent(event: Event): void {
    if (event.kind !== relayListKind) {
      return;
    }

    if (this.pubkey === null) {
      this.log.warn('[nostr-mux:plugin:AutoRelayList] ignore published event(configured pubkey is null)');
    }

    if (this.pubkey !== event.pubkey) {
      return;
    }

    this.applyRelayList(event);
  }

  updatePubkey(pubkey: string | null) {
    if (this.pubkey === pubkey) {
      return;
    }

    this.pubkey = pubkey;

    if (this.mux) {
      this.mux.unSubscribe(subID);
      this.startSubscription();
    }
  }

  private startSubscription() {
    this.lastEvent = null;

    const pubkey = this.pubkey;
    if (!pubkey) {
      this.applyRelayList(this.fallbackRelayListEvent);
      return;
    }

    const filters: [Filter, ...Filter[]] = [{ kinds: [relayListKind], authors: [pubkey] }];
    let beforeEose = true;
    let event: RelayListEvent | null = null;

    this.mux?.subscribe({
      id: subID,
      filters,
      onEvent: (e: RelayMessageEvent<EventMessage>) => {
        if (e.received.event.pubkey !== pubkey) {
          return;
        }

        if (beforeEose) {
          if (!event || event.created_at > e.received.event.created_at) {
            event = e.received.event;
          }
        } else {
          this.applyRelayList(e.received.event);
        }
      },
      onEose: () => {
        beforeEose = false;
        this.applyRelayList(event || this.fallbackRelayListEvent);
      },
      eoseTimeout: this.eoseTimeout,
      onRecovered: (_: Relay): Filter[] => filters,
    });
  }

  private get fallbackRelayListEvent(): RelayListEvent {
    return {
      kind: relayListKind,
      tags: this.fallbackRelays.map(r => this.pubkey ? ['r', r] : ['r', r, 'read']),
      created_at: Math.ceil(Date.now() / 1000),
    };
  }

  private applyRelayList(event: RelayListEvent): void {
    if (this.lastEvent && this.lastEvent.created_at > event.created_at) {
      return;
    }

    const entries = parseEvent(event);
    if (entries === null || entries.length === 0) {
      return;
    }

    this.lastEvent = event;

    const current = new Map(this.mux?.allRelays.map(r => [r.url, r]));
    for (const entry of entries) {
      const exist = current.get(entry.url);

      if (exist) {
       exist.updatePermission(entry);
       current.delete(entry.url);
      } else {
        this.mux?.addRelay(new Relay(entry.url, { 
          ...this.relayOptsTpl, 
          logger: this.log,
          read: entry.read, 
          write: entry.write,
        }));
      }
    }

    current.forEach((_, url) => this.mux?.removeRelay(url));

    this.log.debug('[nostr-mux:plugin:AutoRelayList]: applied relay list', entries);
  }
}
