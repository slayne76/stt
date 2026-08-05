export async function refreshAssets(): Promise<void> {
  const response = await fetch('/api/assets/refresh', { method: 'POST' });
  if (!response.ok) {
    throw new Error(`Failed to refresh asset cache: HTTP ${response.status}`);
  }
}
