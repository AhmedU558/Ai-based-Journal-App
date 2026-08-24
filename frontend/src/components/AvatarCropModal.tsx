import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ZoomIn } from 'lucide-react';
import { useModalA11y } from '@/lib/useModalA11y';

interface AvatarCropModalProps {
  file: File;
  onCancel: () => void;
  onCropped: (blob: Blob) => void;
}

const VIEWPORT_SIZE = 280; // px, on-screen circular crop frame
const OUTPUT_SIZE = 512; // px, exported square avatar

// A small hand-rolled drag-to-pan + zoom-to-scale cropper (no new dependency
// for what's a fairly contained interaction) - lets the user reposition a
// photo behind a fixed circular frame before it's uploaded, matching the
// familiar Facebook/Twitter avatar-picker pattern instead of uploading
// whatever crop the original photo happened to have.
export default function AvatarCropModal({ file, onCancel, onCropped }: AvatarCropModalProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, offsetX: 0, offsetY: 0 });
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setImageUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // This component is only ever mounted while open (the parent conditionally
  // renders it, unlike the other modals which take an isOpen prop) - always
  // true here, since mounted IS the open state.
  const panelRef = useModalA11y(true, onCancel);

  const handleImageLoad = () => {
    if (!imgRef.current) return;
    const { naturalWidth, naturalHeight } = imgRef.current;
    setNaturalSize({ width: naturalWidth, height: naturalHeight });
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  };

  // The base (zoom=1) display scale fills the circular viewport on its
  // shorter edge, so the image always fully covers the crop frame no matter
  // its original aspect ratio - the same baseline Facebook's cropper uses.
  const baseScale = naturalSize.width && naturalSize.height
    ? VIEWPORT_SIZE / Math.min(naturalSize.width, naturalSize.height)
    : 1;
  const displayScale = baseScale * zoom;
  const displayWidth = naturalSize.width * displayScale;
  const displayHeight = naturalSize.height * displayScale;

  const clampOffset = (x: number, y: number) => {
    const maxX = Math.max(0, (displayWidth - VIEWPORT_SIZE) / 2);
    const maxY = Math.max(0, (displayHeight - VIEWPORT_SIZE) / 2);
    return {
      x: Math.min(maxX, Math.max(-maxX, x)),
      y: Math.min(maxY, Math.max(-maxY, y)),
    };
  };

  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    setDragging(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY, offsetX: offset.x, offsetY: offset.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    setOffset(clampOffset(dragStartRef.current.offsetX + dx, dragStartRef.current.offsetY + dy));
  };

  const handlePointerUp = () => setDragging(false);

  const handleZoomChange = (nextZoom: number) => {
    setZoom(nextZoom);
    setOffset((prev) => clampOffset(prev.x, prev.y));
  };

  const handleConfirm = () => {
    if (!imgRef.current || !naturalSize.width) return;
    const canvas = document.createElement('canvas');
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Map the visible viewport window back into source-image pixel space:
    // the image's top-left on-screen sits at (VIEWPORT_SIZE/2 - displayWidth/2
    // + offset.x, ...same for y), so the viewport's own top-left corner in
    // image-space is the negative of that, scaled back down by displayScale.
    const viewportLeftInImage = (displayWidth / 2 - VIEWPORT_SIZE / 2 - offset.x) / displayScale;
    const viewportTopInImage = (displayHeight / 2 - VIEWPORT_SIZE / 2 - offset.y) / displayScale;
    const cropSizeInImage = VIEWPORT_SIZE / displayScale;

    ctx.beginPath();
    ctx.arc(OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();

    ctx.drawImage(
      imgRef.current,
      viewportLeftInImage,
      viewportTopInImage,
      cropSizeInImage,
      cropSizeInImage,
      0,
      0,
      OUTPUT_SIZE,
      OUTPUT_SIZE
    );

    canvas.toBlob(
      (blob) => {
        if (blob) onCropped(blob);
      },
      'image/png',
      0.92
    );
  };

  return (
    <AnimatePresence>
      <div
        onClick={onCancel}
        className="fixed inset-0 bg-black/70 backdrop-blur-[6px] z-[10000] flex items-center justify-center p-6"
      >
        <motion.div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label="Move and scale avatar"
          tabIndex={-1}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          onClick={(e) => e.stopPropagation()}
          className="glass-panel w-full max-w-[420px] p-6 flex flex-col gap-5 outline-none"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-[1.05rem] font-bold">Move and Scale</h3>
            <button onClick={onCancel} className="bg-transparent border-0 text-[var(--text-muted)] cursor-pointer" aria-label="Close">
              <X size={20} />
            </button>
          </div>

          <div
            className="relative mx-auto overflow-hidden rounded-full bg-black/40 cursor-grab active:cursor-grabbing touch-none"
            style={{ width: VIEWPORT_SIZE, height: VIEWPORT_SIZE }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
          >
            {imageUrl && (
              /* eslint-disable-next-line jsx-a11y/alt-text */
              <img
                ref={imgRef}
                src={imageUrl}
                onLoad={handleImageLoad}
                draggable={false}
                alt="Selected avatar, drag to reposition"
                className="absolute top-1/2 left-1/2 select-none pointer-events-none"
                style={{
                  width: displayWidth || undefined,
                  height: displayHeight || undefined,
                  transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
                }}
              />
            )}
          </div>

          <div className="flex items-center gap-3">
            <ZoomIn size={16} className="text-[var(--text-muted)] shrink-0" />
            <input
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={(e) => handleZoomChange(Number(e.target.value))}
              className="w-full accent-[#818cf8]"
            />
          </div>

          <div className="flex gap-3">
            <button type="button" onClick={onCancel} className="btn-secondary flex-1 justify-center">
              Cancel
            </button>
            <button type="button" onClick={handleConfirm} className="btn-primary flex-1 justify-center">
              Use Photo
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
