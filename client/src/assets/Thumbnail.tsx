import { useState } from 'react';
import { Box } from '@mui/material';
import { getAssetUrl } from './getAssetUrl';
import type { DatacoreAsset } from '../types/asset';

export interface ThumbnailProps {
  asset: DatacoreAsset | undefined;
  alt: string;
}

function Thumbnail({ asset, alt }: ThumbnailProps) {
  const [failed, setFailed] = useState(false);
  const url = getAssetUrl(asset);

  if (!url || failed) {
    return <Box sx={{ width: 40, height: 40, bgcolor: 'action.hover', borderRadius: 1 }} />;
  }

  return (
    <Box
      component="img"
      src={url}
      alt={alt}
      onError={() => setFailed(true)}
      loading="lazy"
      decoding="async"
      sx={{ width: 40, height: 40, borderRadius: 1, objectFit: 'cover' }}
    />
  );
}

export default Thumbnail;
