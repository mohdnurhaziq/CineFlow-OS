"use client";

import { useEffect, useState } from "react";
import type { PhotoSize } from "@/lib/prints/orientation";

/**
 * A photo's natural pixel size, read by loading it. Until a new photo has loaded, `size` keeps the
 * previous photo's size (null before the first one) so the preview doesn't flip while loading, and
 * `ready` is false. `known` (e.g. the stored resolution) is used as is, without loading anything.
 */
export function usePhotoSize(url: string | null | undefined, known?: PhotoSize | null): { size: PhotoSize | null; ready: boolean } {
  const [loaded, setLoaded] = useState<(PhotoSize & { url: string }) | null>(null);
  const skip = !!known || !url;

  useEffect(() => {
    if (skip || !url) return;
    let live = true;
    const img = new Image();
    img.onload = () => {
      if (live && img.naturalWidth > 0 && img.naturalHeight > 0) {
        setLoaded({ url, width: img.naturalWidth, height: img.naturalHeight });
      }
    };
    img.src = url;
    return () => {
      live = false;
    };
  }, [url, skip]);

  if (known) return { size: known, ready: true };
  return { size: loaded ? { width: loaded.width, height: loaded.height } : null, ready: !!url && loaded?.url === url };
}
