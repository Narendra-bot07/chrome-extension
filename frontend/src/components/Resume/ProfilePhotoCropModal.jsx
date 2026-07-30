import React, { useState, useRef, useEffect } from 'react';
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
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const posRef = useRef({ x: 0, y: 0 });
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setZoom(1.0);
      setPosX(0);
      setPosY(0);
      posRef.current = { x: 0, y: 0 };
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
    // Bound drag range
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

  // Generate high-resolution cropped canvas Data URL
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

          const size = 600; // 600x600 HD avatar resolution
          canvas.width = size;
          canvas.height = size;

          // Draw circular mask for crisp clean output
          ctx.beginPath();
          ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
          ctx.closePath();
          ctx.clip();

          const minDim = Math.min(img.width, img.height);
          const drawWidth = (img.width / minDim) * size * zoom;
          const drawHeight = (img.height / minDim) * size * zoom;

          // Convert modal displacement (208px circle) to canvas resolution (600px circle)
          const scaleFactor = size / 208;
          const drawX = (size - drawWidth) / 2 + posX * scaleFactor;
          const drawY = (size - drawHeight) / 2 + posY * scaleFactor;

          ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);
          const croppedDataUrl = canvas.toDataURL('image/png', 0.95);
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

  return (
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
            className="max-none pointer-events-none transition-transform duration-75"
            style={{
              transform: `translate(${posX}px, ${posY}px) scale(${zoom})`,
              maxHeight: '260px',
              objectFit: 'contain'
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
        <div className="p-6 bg-zinc-950 border-t border-zinc-800/80 flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1 flex flex-col gap-1.5">
              <div className="flex justify-between text-xs font-medium text-zinc-400">
                <span className="flex items-center gap-1.5 text-zinc-200 font-semibold">
                  <ZoomIn size={13} className="text-indigo-400" /> Zoom
                </span>
                <span className="font-mono text-zinc-300">{Math.round(zoom * 100)}%</span>
              </div>
              <input 
                type="range" 
                min="1.0" 
                max="2.5" 
                step="0.02" 
                value={zoom} 
                onChange={(e) => setZoom(Number(e.target.value))}
                className="w-full h-1.5 bg-zinc-800 rounded-lg accent-indigo-500 cursor-pointer" 
              />
            </div>
          </div>

          {/* Action Footer */}
          <div className="pt-3 border-t border-zinc-800/80 flex items-center justify-between">
            {onDelete ? (
              <button 
                type="button"
                onClick={onDelete}
                className="text-xs font-semibold text-rose-400 hover:text-rose-300 flex items-center gap-1.5 px-3 py-2 rounded-xl hover:bg-rose-500/10 transition-colors"
              >
                <Trash2 size={14} /> Delete photo
              </button>
            ) : <div />}

            <div className="flex items-center gap-2.5">
              {onChangePhoto && (
                <>
                  <button 
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="text-xs font-semibold text-zinc-300 hover:text-white border border-zinc-700 hover:border-zinc-500 bg-zinc-900 px-4 py-2 rounded-xl transition-all flex items-center gap-1.5"
                  >
                    <Camera size={14} /> Change photo
                  </button>
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    accept="image/*" 
                    className="hidden" 
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file && onChangePhoto) onChangePhoto(file);
                    }}
                  />
                </>
              )}
              <button 
                type="button"
                onClick={handleApply}
                className="text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 px-6 py-2.5 rounded-xl shadow-lg shadow-indigo-600/30 hover:shadow-indigo-500/40 transition-all flex items-center gap-1.5"
              >
                <Check size={14} /> Apply
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
