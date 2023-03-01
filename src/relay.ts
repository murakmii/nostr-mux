import { Emitter } from "./emitter";
import { verifyEvent, Event } from "./event";
import { LeveledLogger, Logger, LogLevel } from "./logger";

// TODO: support AUTH
export type RelayMessage = EventMessage | NoticeMessage | EoseMessage | OkMessage;

export type EventMessage = { type: 'EVENT', subscriptionID: string, event: Event };
export type NoticeMessage = { type: 'NOTICE', message: string };
export type EoseMessage = { type: 'EOSE', subscriptionID: string };
export type OkMessage = { type: 'OK', eventID: string, accepted: boolean, message: string };

export interface RelayOptions {
  logger?: Logger | number,
  connectTimeout?: number;
  watchDogInterval?: number;
  keepAliveTimeout?: number;
}

export interface RelayEvent {
  relay: Relay;
}

export interface RelayMessageEvent<T extends RelayMessage> extends RelayEvent {
  received: T;
}

export type Filter = {
  ids?: string[];
  authors?: string[];
  kinds?: number[];
  since?: number;
  until?: number;
  limit?: number;
  [K: `#${string}`]: string[];
}

export interface RequestOptions {
  eoseTimeout?: number
}

/**
 * `validateRelayMessage` function validate message from relay.
 * 
 * @param wsMessage Message received from WebSocket connected to relay
 * @returns If `wsMessage` is valid message, Then `RelayMessage`. Else `string` represents reason for invalidation.
 */
export const validateRelayMessage = async (wsMessage: MessageEvent): Promise<RelayMessage | string> => {
  let msg: unknown;
  try {
    msg = JSON.parse(wsMessage.data);
  } catch (e) {
    return `invalid json`;
  }
  
  if (!Array.isArray(msg)) {
    return `NOT array`;
  }

  if (msg.length === 0) {
    return `empty array`;
  }

  switch (msg[0]) {
    case 'EVENT':
      if (msg.length !== 3 || typeof msg[1] !== 'string') {
        return `invalid EVENT`;
      }

      const event = await verifyEvent(msg[2])
      if (typeof event === 'string') {
        return `invalid EVENT(${event})`;
      }
      return { type: 'EVENT', subscriptionID: msg[1], event };

    case 'NOTICE':
      if (msg.length !== 2 || typeof msg[1] !== 'string') {
        return `invalid NOTICE`;
      }
      return { type: 'NOTICE', message: msg[1] };

    case 'EOSE':
      if (msg.length !== 2 || typeof msg[1] !== 'string') {
        return `invalid EOSE`;
      }
      return { type: 'EOSE', subscriptionID: msg[1] };

    case 'OK':
      if (msg.length !== 4 || typeof msg[1] !== 'string' || typeof msg[2] !== 'boolean' || typeof msg[3] !== 'string') {
        return `invalid OK`;
      }
      return { type: 'OK', eventID: msg[1], accepted: msg[2], message: msg[3] };

    default:
      return `unsupported message(${msg[0]})`;
  }
};

/**
 * `Relay` implements low-level operation to communicate relay.
 */
export class Relay {
  readonly url: string;

  private log: Logger;

  private connectTimeout: number;
  private watchDogInterval: number;
  private keepAliveTimeout: number;

  private ws: WebSocket | null;
  private watchDog: NodeJS.Timeout | null;
  private keepAlivedAt: number | null;
  private subs: { [key: string]: NodeJS.Timeout | null };

  readonly onHealthy: Emitter<RelayEvent>;
  readonly onEvent: Emitter<RelayMessageEvent<EventMessage>>;
  readonly onEose: Emitter<RelayMessageEvent<EoseMessage>>;

  private handleWSOpen: () => void;
  private handleWSMessage: (e: MessageEvent) => Promise<void>;
  private handleWSClose: () => void;

  constructor(url: string, options: RelayOptions = {}) {
    this.url = url;

    if (typeof options.logger === 'undefined') {
      this.log = new LeveledLogger(console, LogLevel.supress);
    } else if (typeof options.logger === 'number') {
      this.log = new LeveledLogger(console, options.logger);
    } else {
      this.log = options.logger;
    }

    this.connectTimeout = options.connectTimeout || 2000;
    this.watchDogInterval = options.watchDogInterval || 60000;
    this.keepAliveTimeout = options.keepAliveTimeout || 60000;

    this.ws = null;
    this.watchDog = null;
    this.keepAlivedAt = null;
    this.subs = {};

    this.onHealthy = new Emitter<RelayEvent>();
    this.onEvent = new Emitter<RelayMessageEvent<EventMessage>>();
    this.onEose = new Emitter<RelayMessageEvent<EoseMessage>>();

    this.handleWSOpen = () => {
      this.log.debug(`[${this.url}] open`);

      this.keepAlived();
      this.onHealthy.emit({ relay: this });
    };

    this.handleWSClose = () => this.reset('ws close');

    this.handleWSMessage = async (e: MessageEvent): Promise<void> => {
      this.keepAlived();

      const msg = await validateRelayMessage(e);
      if (typeof msg === 'string') {
        this.log.warn(`[${this.url}] received ${msg}`, e.data);
        return;
      }

      switch (msg.type) {
        case 'EVENT':
          this.onEvent.emit({ relay: this, received: msg });
          break;

        case 'EOSE':
          this.emitEose(msg.subscriptionID);
          break;
        
        case 'OK':
        case 'NOTICE':
          this.log.info(`[${this.url}] received ${msg.type}, but it is NOT supported yet`, msg);
          break;
      }
    }
  }

  get isHealthy(): boolean {
    return !!(this.ws && this.ws.readyState === 1);
  }

  get mayBeDead(): boolean {
    return !this.keepAlivedAt || new Date().getTime() - this.keepAlivedAt > this.keepAliveTimeout;
  }
  
  /**
   * `connect` function connects to relay.
   * This function also start WatchDog.
   * WatchDog checks WebSocket periodically and reconnects if necessary.
   */
  connect(): void {
    if (this.ws) {
      return;
    }

    this.startWatchDog();
    this.reset('before connect');

    this.ws = new WebSocket(this.url);

    const connTimeout = setTimeout(() => {
      if (!this.ws || this.ws.readyState !== 0) {
        return;
      }

      this.log.warn(`[${this.url}] connection timed out`);
      this.reset('timeout');
    }, this.connectTimeout);

    this.ws.addEventListener('open', this.handleWSOpen);
    this.ws.addEventListener('open', () => clearTimeout(connTimeout));

    this.ws.addEventListener('message', this.handleWSMessage);

    this.ws.addEventListener('close', this.handleWSClose);
    this.ws.addEventListener('close', () => clearTimeout(connTimeout));

    this.ws.addEventListener('error', e => {
      this.log.error(`[${this.url}] WebScoket error`);
      clearTimeout(connTimeout);

      if (e.target instanceof WebSocket) {
        e.target.close();
      }
    });
  }

  /**
   * `request` function sends REQ message to relay and starts subscription.
   * 
   * @param subID Subscription ID
   * @param filters 
   * @param options 
   */
  request(subID: string, filters: Filter[], options: RequestOptions = {}): void {
    if (subID in this.subs) {
      return;
    }

    if (!this.isHealthy) {
      throw new Error(`relay(${this.url}) is NOT healthy`);
    }

    this.log.debug(`[${this.url}] send request: ${subID}`, filters);
    this.ws?.send(JSON.stringify(['REQ', subID, ...filters]));

    this.subs[subID] = setTimeout(() => this.emitEose(subID), options.eoseTimeout || 5000);
  }

  /**
   * `close` function sends CLOSE message to relay and stops subscription.
   * 
   * @param subID Subscription ID
   */
  close(subID: string): void {
    if (!(subID in this.subs) || this.ws === null) {
      return;
    }

    const timer = this.subs[subID];
    if (timer) {
      clearTimeout(timer);
    }
    delete this.subs[subID];

    this.log.debug(`[${this.url}] close subscription: ${subID}`);
    this.ws.send(JSON.stringify(['CLOSE', subID]));
  }

  /**
   * `terminate` function closes WebSocket and stops WatchDog.
   */
  terminate() {
    if (this.watchDog) {
      clearInterval(this.watchDog);
    }
    this.reset('close');
  }

  private startWatchDog() {
    if (this.watchDog) {
      clearInterval(this.watchDog);
    }

    this.watchDog = setInterval(() => {
      if (this.ws && this.mayBeDead) {
        this.reset('watchdog');
      }

      if (this.ws === null) {
        this.log.debug(`[${this.url}] reconnect by watchdog`);
        this.connect();
      }
    }, this.watchDogInterval);
  }

  /**
   * `reset` function closes WebSocket and reset state.
   * However, WatchDog still alive and it tries reconnecting later.
   * If we want to COMPLETELY kill connection to relay, we MUST call `terminate` function.
   * 
   * @param reason For logging
   */
  private reset(reason: string): void {
    this.log.debug(`[${this.url}] reset by ${reason}`);

    if (this.ws) {
      this.ws.removeEventListener('open', this.handleWSOpen);
      this.ws.removeEventListener('message', this.handleWSMessage);
      this.ws.removeEventListener('close', this.handleWSClose);
      this.ws.close();
      this.ws = null;
    }

    // We guarantee emitting EOSE.
    //
    // If listeners of emitter recursively calls `reset`, it occurs infinite loop.
    // To prevent it, we firstly clear state(`subs`) and lastly emits.
    const subIDs = Object.keys(this.subs);

    this.subs = {};
    this.keepAlivedAt = null;

    for (const subID of subIDs) {
      this.emitEose(subID);
    }
  }

  private keepAlived(): void {
    this.keepAlivedAt = new Date().getTime();
  }

  private emitEose(subID: string): void {
    const eoseTimer = this.subs[subID];
    if (!eoseTimer) {
      return;
    }

    clearTimeout(eoseTimer);
    this.onEose.emit({ relay: this, received: { type: 'EOSE', subscriptionID: subID } });
    this.subs[subID] = null;
  }
}
