import { UpstreamError } from './errors';

const ASSET_UPSTREAM_BASE = 'https://assets.datacore.app';

export async function fetchAsset(filename: string): Promise<Buffer | null> {
  let response: Response;
  try {
    response = await fetch(`${ASSET_UPSTREAM_BASE}/${filename}`);
  } catch (cause) {
    throw new UpstreamError(`Network error fetching asset: ${(cause as Error).message}`);
  }

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new UpstreamError(`Asset host returned HTTP ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
