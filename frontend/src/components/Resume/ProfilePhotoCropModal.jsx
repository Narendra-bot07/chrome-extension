import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, X, ZoomIn, Trash2, Camera, Check, Move } from 'lucide-react';

export default function ProfilePhotoCropModal({
  isOpen,
  imageSrc,
  onClose,
  onApply,
  onDelete,
  onChangePhoto
}) {
  const [zoom, setZoom] = useState(1.0);
  const [posX, setPosX] = useState(0);
  const [posY, setPosY] = useState(0);
  const [imgSize, setImgSize] = useState({ width: 208, height: 208 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const posRef = useRef({ x: 0, y: 0 });
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (isOpen && imageSrc) {
      setZoom(1.0);
      setPosX(0);
      setPosY(0);
      posRef.current = { x: 0, y: 0 };
      const img = new Image();
      if (!imageSrc.startsWith('data:')) {
        img.crossOrigin = 'anonymous';
      }
      img.onload = () => {
        // Base cover scale so image fills the 208px viewport circle with 0 gaps
        const baseScale = Math.max(208 / img.width, 208 / img.height);
        setImgSize({
          width: img.width * baseScale,
          height: img.height * baseScale
        });
      };
      img.src = imageSrc;
    }
  }, [isOpen, imageSrc]);

  if (!isOpen || !imageSrc) return null;

  // Mouse / Touch drag handlers
  const handleMouseDown = (e) => {
    setIsDragging(true);
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    dragStartRef.current = { x: clientX - posRef.current.x, y: clientY - posRef.current.y };
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const newX = clientX - dragStartRef.current.x;
    const newY = clientY - dragStartRef.current.y;
    // Bounded drag range
    const maxOffset = 180 * zoom;
    const clampedX = Math.max(-maxOffset, Math.min(maxOffset, newX));
    const clampedY = Math.max(-maxOffset, Math.min(maxOffset, newY));
    setPosX(clampedX);
    setPosY(clampedY);
    posRef.current = { x: clampedX, y: clampedY };
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Generate high-resolution cropped canvas Data URL matching 208px viewport exactly
  const handleApply = () => {
    try {
      const img = new Image();
      if (!imageSrc.startsWith('data:')) {
        img.crossOrigin = 'anonymous';
      }
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            onApply(imageSrc, { posX, posY, zoom });
            return;
          }

          const outputSize = 600; // 600x600 HD crop resolution
          canvas.width = outputSize;
          canvas.height = outputSize;

          // Compute exact base cover scale for 208px viewport
          const baseScale = Math.max(208 / img.width, 208 / img.height);
          const baseWidth = img.width * baseScale;
          const baseHeight = img.height * baseScale;

          // Scale factor between 208px modal circle and 600px canvas
          const scaleRatio = outputSize / 208;
          const drawWidth = baseWidth * zoom * scaleRatio;
          const drawHeight = baseHeight * zoom * scaleRatio;

          const drawX = (outputSize - drawWidth) / 2 + posX * scaleRatio;
          const drawY = (outputSize - drawHeight) / 2 + posY * scaleRatio;

          ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);
          const croppedDataUrl = canvas.toDataURL('image/jpeg', 0.95);
          onApply(croppedDataUrl, { posX, posY, zoom });
        } catch (err) {
          console.error("Error cropping image on canvas:", err);
          onApply(imageSrc, { posX, posY, zoom });
        }
      };
      img.onerror = () => {
        onApply(imageSrc, { posX, posY, zoom });
      };
      img.src = imageSrc;
    } catch (e) {
      onApply(imageSrc, { posX, posY, zoom });
    }
  };

  // TailorRender.tsx (the only caller) renders this as a plain nested
  // element inside ResumePreview.tsx's CSS `transform: scale(...)` zoom
  // wrapper -- a `transform` on any ancestor redefines the containing block
  // for `position: fixed` descendants (a CSS spec quirk), so without a
  // portal this modal was trapped inside that scaled/scrollable preview
  // container instead of actually covering the viewport, appearing pushed
  // down and requiring the user to scroll to see it. Portal straight to
  // document.body to escape that ancestor entirely, like every other
  // full-screen modal in this app already does.
  return createPortal(
    <div className="fixed inset-0 z-[99999] bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200 select-none">
      <div className="w-full max-w-lg bg-zinc-950 border border-zinc-800 rounded-3xl text-white shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-zinc-800/80 flex items-center justify-between bg-zinc-900/50">
          <div className="flex items-center gap-3">
            <button 
              type="button"
              onClick={onClose} 
              className="p-1.5 rounded-full hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
            >
              <ArrowLeft size={18} />
            </button>
            <h3 className="font-bold text-base tracking-tight text-zinc-100">Profile photo</h3>
          </div>
          <button 
            type="button"
            onClick={onClose} 
            className="p-1.5 rounded-full hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Reposition & Crop Stage */}
        <div 
          className="relative h-80 bg-zinc-900/90 flex items-center justify-center overflow-hidden cursor-grab active:cursor-grabbing"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onTouchStart={handleMouseDown}
          onTouchMove={handleMouseMove}
          onTouchEnd={handleMouseUp}
        >
          {/* Target Image */}
          <img 
            src={imageSrc} 
            alt="Crop preview" 
            className="max-none pointer-events-none transition-transform duration-75 select-none"
            style={{
              width: `${imgSize.width}px`,
              height: `${imgSize.height}px`,
              transform: `translate(${posX}px, ${posY}px) scale(${zoom})`
            }}
          />

          {/* Dark Overlay Mask with Circular Cutout Frame */}
          <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
            {/* Cutout Ring */}
            <div className="w-52 h-52 rounded-full border-2 border-white/90 shadow-[0_0_0_9999px_rgba(9,9,11,0.75)] relative overflow-hidden flex items-center justify-center">
              {/* 3x3 Grid Overlay */}
              <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none opacity-30">
                <div className="border-r border-b border-white"></div>
                <div className="border-r border-b border-white"></div>
                <div className="border-b border-white"></div>
                <div className="border-r border-b border-white"></div>
                <div className="border-r border-b border-white"></div>
                <div className="border-b border-white"></div>
                <div className="border-r border-white"></div>
                <div className="border-r border-white"></div>
                <div></div>
              </div>
            </div>
            {/* Subtitle Directive */}
            <span className="absolute bottom-4 text-xs font-semibold text-zinc-300 bg-zinc-900/80 px-3 py-1 rounded-full border border-zinc-700/60 flex items-center gap-1.5 shadow-md">
              <Move size={12} className="text-indigo-400" />
              Drag to reposition photo
            </span>
          </div>
        </div>

        {/* Sliders & Adjustments */}
        <div className="p-6 space-y-5 bg-zinc-950">
          <div className="flex items-center gap-4">
            <ZoomIn size={18} className="text-zinc-400 shrink-0" />
            <input 
              type="range"
              min="1.0"
              max="3.0"
              step="0.05"
              value={zoom}
              onChange={(e) => setZoom(parseFloat(e.target.value))}
              className="w-full accent-[#00bda5] bg-zinc-800 h-1.5 rounded-lg appearance-none cursor-pointer"
            />
            <span className="text-xs font-bold text-zinc-400 w-10 text-right font-mono">
              {Math.round(zoom * 100)}%
            </span>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center gap-2">
              {onDelete && (
                <button
                  type="button"
                  onClick={onDelete}
                  className="p-2.5 rounded-xl bg-zinc-900 hover:bg-rose-950/40 text-zinc-400 hover:text-rose-400 border border-zinc-800 hover:border-rose-900/50 transition-colors flex items-center gap-2 text-xs font-bold"
                  title="Remove photo"
                >
                  <Trash2 size={16} />
                  <span>Delete</span>
                </button>
              )}
              {onChangePhoto && (
                <>
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    accept="image/*" 
                    className="hidden" 
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) onChangePhoto(file);
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="p-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 transition-colors flex items-center gap-2 text-xs font-bold"
                  >
                    <Camera size={16} />
                    <span>Change</span>
                  </button>
                </>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 font-bold text-xs transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleApply}
                className="px-5 py-2.5 rounded-xl bg-[#00bda5] hover:bg-[#00a894] text-white font-extrabold text-xs transition-colors shadow-lg shadow-emerald-950/40 flex items-center gap-1.5"
              >
                <Check size={16} />
                <span>Apply</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
