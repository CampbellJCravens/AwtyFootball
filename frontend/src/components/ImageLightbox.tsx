interface ImageLightboxProps {
  src: string;
  alt: string;
  onClose: () => void;
}

export default function ImageLightbox({ src, alt, onClose }: ImageLightboxProps) {
  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70" />
      <img
        src={src}
        alt={alt}
        className="relative z-10 max-w-[85vw] max-h-[85vh] rounded-2xl object-cover"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}
