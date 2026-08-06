import { Box } from "lucide-react";
import { useState } from "react";

type Props = {
  src: string | null | undefined;
  alt: string;
  className?: string;
  onNaturalSize?: (width: number, height: number) => void;
};

export function ItemImage({ src, alt, className = "", onNaturalSize }: Props) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <span className={`image-placeholder ${className}`} role="img" aria-label={`${alt} 暂无图片`}>
        <Box aria-hidden="true" />
        <small>暂无可靠实图</small>
      </span>
    );
  }
  return (
    <img
      className={className}
      src={src}
      alt={alt}
      loading="lazy"
      onLoad={(event) => onNaturalSize?.(event.currentTarget.naturalWidth, event.currentTarget.naturalHeight)}
      onError={() => setFailed(true)}
    />
  );
}
