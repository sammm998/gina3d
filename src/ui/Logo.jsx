import { useState } from 'react';
import { PATHS } from '../config/storeConfig.js';

/**
 * Visar varumärkets logotyp från /assets/ginatricot-logo.svg.
 * Saknas filen visas en neutral platshållare.
 */
export default function Logo({ className = '', alt = 'Gina Tricot' }) {
  const [src, setSrc] = useState(PATHS.logo);
  return (
    <img
      className={`logo ${className}`}
      src={src}
      alt={alt}
      draggable={false}
      onError={() => src !== PATHS.logoFallback && setSrc(PATHS.logoFallback)}
    />
  );
}
