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