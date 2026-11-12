/** Return an array from either a plain-list or common paginated API response. */
export function unwrapArrayResponse(payload, resourceKey) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return null;

  const candidates = [
    payload[resourceKey],
    payload.items,
    payload.results,
    payload.data,
    payload.data?.[resourceKey],
    payload.data?.items,
    payload.data?.results,
  ];

  return candidates.find(Array.isArray) || null;
}

export function requireArrayResponse(payload, resourceKey) {
  const items = unwrapArrayResponse(payload, resourceKey);
  if (items) return items;
  throw new Error(`Unexpected ${resourceKey} response from the server.`);
}
