import { useState } from 'react';
import { Box } from '@mui/material';
import { getAssetUrl } from './getAssetUrl';
import type { DatacoreAsset } from '../types/asset';

export interface ThumbnailProps {
  asset?: DatacoreAsset;
  url?: string;
  // When set, renders the image inset inside a colored circular badge
  // instead of the default 40x40 square — for icon art that's white/light
  // on a transparent background (invisible against a light page
  // background otherwise), e.g. Polestar icons.
  circleBackgroundColor?: string;
}

function Thumbnail({ asset, url: urlProp, circleBackgroundColor }: ThumbnailProps) {
  const [failed, setFailed] = useState(false);
  const url = urlProp || getAssetUrl(asset);

  if (!url || failed) {
    return <Box sx={{ width: 40, height: 40, bgcolor: 'action.hover', borderRadius: 1 }} />;
  }

  if (circleBackgroundColor) {
    return (
      <Box
        sx={{
          width: 40,
          height: 40,
          borderRadius: '50%',
          bgcolor: circleBackgroundColor,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <Box
          component="img"
          src={url}
          alt=""
          onError={() => setFailed(true)}
          loading="lazy"
          decoding="async"
          sx={{ width: 26, height: 26, objectFit: 'contain' }}
        />
      </Box>
    );
  }

  return (
    <Box
      component="img"
      src={url}
      alt=""
      onError={() => setFailed(true)}
      loading="lazy"
      decoding="async"
      sx={{ width: 40, height: 40, borderRadius: 1, objectFit: 'cover' }}
    />
  );
}

export default Thumbnail;
