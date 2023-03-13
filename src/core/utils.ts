import { bech32 } from '@scure/base';
import { utils } from '@noble/secp256k1';

export const normalizeWsURL = (url: string): string | undefined => {
  const parsed = (() => {
    try {
      return new URL(url);
    } catch {
      return undefined;
    }
  })();

  if (!parsed || (parsed.protocol !== 'ws:' && parsed.protocol !== 'wss:')) {
    return undefined;
  }

  let normalized = parsed.origin; // DOES NOT support userinfo
  if (parsed.pathname !== '/') {
    normalized += parsed.pathname;
  }

  parsed.searchParams.sort();
  const sp = parsed.searchParams.toString();
  if (sp.length > 0) {
    normalized += '?' + sp;
  }

  return normalized;
};

export type Bech32IDPrefix = 'npub' | 'nsec' | 'note';
export type Bech32ID = {
  prefix: Bech32IDPrefix;
  hexID: string;
}

/**
 * 'decodeBech32ID' function decodes id that is formatted bech32(NIP-19).
 * 
 * @remarks
 * This function does NOT support 'Shareable identifiers with extra metadata' (e.g. 'nprofile', 'nevent', etc...)
 * 
 * @param bech32ID e.g. 'npub1....'
 * @returns
 */
export const decodeBech32ID = (bech32ID: string): Bech32ID | undefined => {
  try {
    const { prefix, bytes } = bech32.decodeToBytes(bech32ID);
    if (prefix !== 'npub' && prefix !== 'nsec' && prefix !== 'note') {
      return undefined;
    }

    return { prefix, hexID: utils.bytesToHex(bytes) };
  } catch {
    // bech32.decodeToBytes throws error if passed bach32 is invalid.
    // https://github.com/paulmillr/scure-base/blob/3c70323e5dad95a9395c61cf9c21983a0d2c826e/index.ts#L429
    return undefined;
  }
};

export const encodeBech32ID =(prefix: Bech32IDPrefix, hexID: string): string | undefined => {
  try {
    return bech32.encode(prefix, bech32.toWords(utils.hexToBytes(hexID)));
  } catch {
    // utils.hexToBytes and bech32.encode throws error if passed hexID is invalid.
    // https://github.com/paulmillr/noble-secp256k1/blob/dddf55b9ac93e441874f183a3fbb31e5d5e97424/index.ts#L803
    // https://github.com/paulmillr/scure-base/blob/3c70323e5dad95a9395c61cf9c21983a0d2c826e/index.ts#L406
    return undefined;
  }
}
