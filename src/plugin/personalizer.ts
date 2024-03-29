import { Emitter, SimpleEmitter } from "../core/emitter.js";
import { Event, Tag } from "../core/event.js";
import { Mux, Plugin } from "../core/mux.js";
import { normalizeWsURL } from "../core/utils.js";
import { buildSimpleLogger, Logger, LogLevel } from "../core/logger.js";
import { 
  Filter,
  RelayOptions, 
  RelayPermission,
  Relay, 
} from "../core/relay.js";

const logPrefix = '[nostr-mux:plugin:Personalizer]';

const contactListKind = 3;
const relayListKind = 10002;

const subID = '__personalizer';

interface RelayListEntry extends RelayPermission {
  url: string;
}

export interface ContactListEntry {
  pubkey: string;
  mainRelayURL?: string;
}

/**
 * Options for Personalizer plugin
 */
export interface PersonalizerOptions {
  logger?: Logger | LogLevel;

  /**
   * flushInterval to subscribe user data
   */
  flushInterval?: number;

  /**
   * Configuration for Contact List(NIP-02)
   */
  contactList: ContactListOptions;

  /**
   * Configuration for Relay List(NIP-65)
   */
  relayList: RelayListOptions;

  cacheReplaceableEvent?: number[];
}

export interface ContactListOptions {
  /**
   * If this is set `true`, Contact List(NIP-02) function is enabled.
   * Contact List is subscribed automatically and you can read it from `contactListEntries` property of Personalizer.
   * Also, `onUpdatedContactList` is emitted when Contact List is updated.
   */
  enable: boolean;
}

export interface RelayListOptions {
  /**
   * If this is set `true`, Relay List(NIP-65) function is enabled.
   * Relay List is subscribed automatically and applis it to mux relay list.
   */
  enable: boolean;

  /**
   * Configuration for relay that is added automatically by Relay List.
   * However, `read` and `write` configurations are overridden by Relay List configuration.
   */
  relayOptionsTemplate?: RelayOptions;
}

interface TagsOnlyEvent {
  kind: number;
  tags: Tag[];
}

export const parseRelayListEvent = (e: TagsOnlyEvent): RelayListEntry[] | undefined => {
  if (e.kind !== relayListKind) {
    return undefined;
  }

  const entries: RelayListEntry[] = [];
  for (const tag of e.tags) {
    if (tag[0] !== 'r' || tag.length < 2 || tag.length > 3) {
      continue;
    }

    const url = normalizeWsURL(tag[1]);
    if (!url) {
      continue;
    }

    switch (tag.length) {
      case 2:
        entries.push({ url, read: true, write: true });
        break;

      case 3:
        entries.push({ url, read: tag[2] === 'read', write: tag[2] === 'write' });
        break;

      default:
        continue;
    }
  }

  return entries;
}

export const parseContactListEvent = (e: TagsOnlyEvent): ContactListEntry[] | undefined => {
  if (e.kind !== contactListKind) {
    return undefined
  }

  const entries: ContactListEntry[] = [];
  for (const tag of e.tags) {
    if (tag[0] === 'p') {
      const entry: ContactListEntry = { pubkey: tag[1] };
      if (tag[2] && tag[2].length > 0) {
        entry.mainRelayURL = tag[2];
      }

      entries.push(entry);
    }
  }

  return entries;
};

abstract class ReplaceableEventHolder {
  readonly pubkey: string;
  private kind: number;
  private least?: Event;
  readonly onUpdated: Emitter<Event>;

  constructor(pubkey: string, kind: number) {
    this.pubkey = pubkey;
    this.kind = kind;

    this.onUpdated = new SimpleEmitter();
  }

  get leastEvent(): Event | undefined {
    return this.least;
  } 

  get targetKind(): number {
    return this.kind;
  }

  get initialFilter(): [Filter, ...Filter[]] {
    return [
      {
        kinds: [this.kind],
        authors: [this.pubkey]
      }
    ];
  }

  get recoveryFilter(): Filter[] {
    const filter = this.initialFilter;
    if (this.least) {
      filter[0].since = this.least.created_at;
    }

    return filter;
  }

  update(event: Event) {
    if (this.least && (this.least.id === event.id || this.least.created_at > event.created_at)) {
      return;
    }

    if (this.accept(event)) {
      this.least = event;
      this.onUpdated.emit(event);
    }
  }

  abstract accept(event: Event): boolean;
}

export class GenericReplaceableEventHolder extends ReplaceableEventHolder {
  accept() {
    return true;
  }
}

export class ContactListHolder extends ReplaceableEventHolder {
  private log: Logger;
  private entries: ContactListEntry[];

  constructor(pubkey: string, log: Logger) {
    super(pubkey, contactListKind);

    this.log = log;
    this.entries = [];
  }

  get currentEntries(): ContactListEntry[] {
    return this.entries;
  }

  accept(event: Event) {
    const parsed = parseContactListEvent(event);
    if (!parsed) {
      return false;
    }

    this.entries = parsed;
    this.log.debug(`${logPrefix} contact list updated: ${this.entries.length} entries`);

    return true;
  }
}

export class RelayListHolder extends ReplaceableEventHolder {
  private log: Logger;
  private mux: Mux;
  private relayOptsTpl: RelayOptions;

  constructor(pubkey: string, log: Logger, mux: Mux, relayOptsTpl: RelayOptions) {
    super(pubkey, relayListKind);

    this.log = log;
    this.mux = mux;
    this.relayOptsTpl = relayOptsTpl;
  }

  accept(event: Event) {
    const parsed = parseRelayListEvent(event);
    if (!parsed || parsed.length === 0) {
      return false;
    }

    let added = 0, removed = 0, changed = 0;

    const alreadyAdded = new Map(this.mux.allRelays.map(r => [r.url, r]));
    for (const entry of parsed) {
      const already = alreadyAdded.get(entry.url);

      if (already) {
        changed++;
        already.updatePermission(entry);
        alreadyAdded.delete(entry.url);
      } else {
        added++;
        this.mux.addRelay(new Relay(entry.url, { 
          ...this.relayOptsTpl, 
          logger: this.log,
          read: entry.read, 
          write: entry.write,
        }));
      }
    }

    alreadyAdded.forEach((_, url) => {
      removed++;
      this.mux.removeRelay(url);
    });

    if (added > 0 || removed > 0 || changed > 0) {
      this.log.debug(`${logPrefix} relay list updated: added=${added}, removed=${removed}, changed=${changed}`);
    }

    return true;
  }
}

const atLeastOneFilter = (filters: Filter[]): filters is [Filter, ...Filter[]] => {
  return filters.length > 0;
}

/**
 * `Personalizer` plugin loads and applis data of user that is specified pubkey
 */
export class Personalizer extends Plugin {
  private pubkey: string;
  private mux?: Mux;
  private log: Logger;
  private flushInterval: number;

  private contactListOpts: ContactListOptions;
  private contactList?: ContactListHolder;
  private relayListOpts: RelayListOptions;
  private relayList?: RelayListHolder;
  private genericHolders: GenericReplaceableEventHolder[];

  readonly onUpdatedContactList: Emitter<ContactListEntry[]>
  readonly onUpdatedReplaceableEvent: Emitter<Event>

  constructor(pubkey: string, options: PersonalizerOptions) {
    super();

    this.pubkey = pubkey;
    this.log = buildSimpleLogger(options.logger);
    this.flushInterval = options.flushInterval || 2000;

    this.contactListOpts = options.contactList;
    this.relayListOpts = options.relayList;
    this.genericHolders = (options.cacheReplaceableEvent || []).map(kind => (
      new GenericReplaceableEventHolder(this.pubkey, kind)
    ));

    this.onUpdatedContactList = new SimpleEmitter();
    this.onUpdatedReplaceableEvent = new SimpleEmitter();

    if (this.contactListOpts.enable && this.genericHolders.find(h => h.targetKind === contactListKind)) {
      throw new Error(`${logPrefix} contactList and cacheReplaceableEvent are conflicted`);
    }

    if (this.relayListOpts.enable && this.genericHolders.find(h => h.targetKind === relayListKind)) {
      throw new Error(`${logPrefix} relayList and cacheReplaceableEvent are conflicted`);
    }
  }

  get contactListEntries(): ContactListEntry[] {
    return this.contactList?.currentEntries || [];
  }

  getCachedReplaceableEvent(kind: number): Event | undefined {
    return this.genericHolders.find(h => h.targetKind === kind)?.leastEvent;
  }

  id(): string {
    return `personalize_${this.pubkey}`;
  }

  install(mux: Mux) {
    this.mux = mux;

    const holders: ReplaceableEventHolder[] = [...this.genericHolders];
    for (const holder of holders) {
      holder.onUpdated.listen(event => this.onUpdatedReplaceableEvent.emit(event));
    }

    if (this.contactListOpts.enable) {
      this.contactList = new ContactListHolder(this.pubkey, this.log);
      this.contactList.onUpdated.listen(() => this.onUpdatedContactList.emit(this.contactList?.currentEntries || []));
      holders.push(this.contactList);
    }

    if (this.relayListOpts.enable) {
      this.relayList = new RelayListHolder(this.pubkey, this.log, mux, this.relayListOpts.relayOptionsTemplate || {});
      holders.push(this.relayList);
    }

    const filters = holders.map(h => h.initialFilter).flat();
    if (!atLeastOneFilter(filters)) {
      this.log.warn(`${logPrefix} is disabled all functions`);
      return;
    }

    this.mux.subscribe({
      id: subID,
      filters,
      onEvent: (messages) => {
        const orderByLatest = [...messages].sort((a, b) => b.received.event.created_at - a.received.event.created_at);
        
        for (const holder of holders) {
          const latest = orderByLatest.find(e => e.received.event.kind === holder.targetKind);
          if (latest) {
            holder.update(latest.received.event);
          }
        }
      },
      enableBuffer: {
        flushInterval: this.flushInterval,
      },
      onRecovered: () => holders.map(h => h.recoveryFilter).flat()
    });
  }

  uninstall() {
    this.mux?.unSubscribe(subID);

    this.contactList?.onUpdated.reset();

    this.contactList = undefined;
    this.relayList = undefined;
    this.genericHolders = (this.genericHolders || []).map(holder => (
      new GenericReplaceableEventHolder(this.pubkey, holder.targetKind)
    ));
  }

  capturePublishedEvent(event: Event): void {
    switch (event.kind) {
      case contactListKind:
        this.contactList?.update(event);
        break;

      case relayListKind:
        this.relayList?.update(event);
        break;

      default:
        this.genericHolders.find(h => h.targetKind === event.kind)?.update(event);
        break;
    }
  }
}
