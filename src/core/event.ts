import { schnorr, utils } from '@noble/secp256k1';

export type Tag = [string, string, ...string[]];

export interface IncompleteEvent {
  pubkey: string;
  created_at: number;
  kind: number;
  tags: Tag[];
  content: string;
}

/**
 * `Event` represents event on Nostr
 * 
 * @see {@link https://github.com/nostr-protocol/nips/blob/master/01.md}
 */
export interface Event extends IncompleteEvent {
  id: string;
  sig: string;
}

const hex32Bytes = /^[0-9abcdef]{64}$/;
const hex64Bytes = /^[0-9abcdef]{128}$/;
const utf8Encoder = new TextEncoder();

/**
 * `validateEvent` function check validity of event.
 * This function does NOT check signature. If you want to check it, You MUST call `verifyEvent` function.
 * 
 * @param mayBeEvent 
 * @returns If `tainted` is valid event, Then `Event`. Else `string` represents reason for invalidation.
 */
export const validateEvent = (mayBeEvent: unknown): Event | string => {
  if (typeof mayBeEvent !== 'object' || mayBeEvent == null || Array.isArray(mayBeEvent)) {
    return 'event is NOT object';
  }

  const { id, pubkey, created_at, kind, tags, content, sig } = mayBeEvent as Record<keyof Event, unknown>;

  if (typeof id !== 'string' || !hex32Bytes.test(id)) {
    return 'id property is invalid';
  }

  if (typeof pubkey !== 'string' || !hex32Bytes.test(pubkey)) {
    return 'pubkey property is invalid';
  }

  if (typeof created_at !== 'number' || !Number.isInteger(created_at)) {
    return 'created_at property is invalid';
  }

  if (typeof kind !== 'number' || !Number.isInteger(kind)) {
    return 'kind property is invalid';
  }

  if (!validateTags(tags)) {
    return 'tags property is invalid';
  }

  if (typeof content !== 'string') {
    return 'content property is invalid';
  }

  if (typeof sig !== 'string' || !hex64Bytes.test(sig)) {
    return 'sig property is invalid';
  }

  return { id, pubkey, created_at, kind, tags, content, sig };
}

const validateTags = (taintedTags: unknown): taintedTags is Tag[] => {
  if (!Array.isArray(taintedTags)) {
    return false;
  }

  for (const taintedTag of taintedTags) {
    if (!Array.isArray(taintedTag) || taintedTag.length < 2) {
      return false;
    }

    for (const e of taintedTag) {
      if (typeof e !== 'string') {
        return false;
      }
    }

    if ((taintedTag[0] === 'e' || taintedTag[0] === 'p') && !hex32Bytes.test(taintedTag[1])) {
      return false;
    }
  }

  return true;
}

/**
 * `generateID` function generate id for `event`.
 * 
 * @param event
 * @returns Generated id.
 */
export const generateID = async (event: IncompleteEvent): Promise<string> => {
  const encoded = utf8Encoder.encode(JSON.stringify([
    0,
    event.pubkey,
    event.created_at,
    event.kind,
    event.tags,
    event.content,
  ]));

  return utils.bytesToHex(await utils.sha256(new Uint8Array(encoded)));
};

/**
 * `verifyEvent` function validate event and check signature of it.
 * Returned event is could be trusted.
 * 
 * @param mayBeEvent 
 * @returns If `tainted` is valid event, Then `Event`. Else `string` represents reason for invalidation.
 */
export const verifyEvent = async (mayBeEvent: unknown): Promise<Event | string> => {
  const event = validateEvent(mayBeEvent);
  if (typeof event === 'string') {
    return `failed to verify event: ${event}`;
  }

  if (event.id !== await generateID(event)) {
    return 'failed to verify event: id property is invalid';
  }

  if (!await schnorr.verify(event.sig, event.id, event.pubkey)) {
    return 'failed to verify event: sig property is invalid';
  }

  return event
}
