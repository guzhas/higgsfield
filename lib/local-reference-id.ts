// Shared with browser validation; no filesystem or secret access here.
export const localAssetUrl = (assetId: string) => `studio-asset:${assetId}`;
export const isLocalAssetUrl = (url: string) => /^studio-asset:[0-9a-f-]{36}$/i.test(url);
