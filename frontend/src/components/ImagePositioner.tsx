import { useState, useRef, useEffect } from 'react';

interface ImagePositionerProps {
  imageSrc: string;
  size?: number;
  onPositionChange?: (x: number, y: number) => void;
}

export default function ImagePositioner({ imageSrc, size = 200, onPositionChange }: ImagePositionerProps) {
  const [position, setPosition] = useState({ x: 50, y: 50 }); // Percentage values (50% = center)
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0, startPosition: { x: 50, y: 50 } });
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Reset position when image changes
    setPosition({ x: 50, y: 50 });
  }, [imageSrc]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!containerRef.current) return;
    e.preventDefault();
    setIsDragging(true);
    const rect = containerRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    setDragStart({ 
      x: e.clientX - centerX,
      y: e.clientY - centerY,
      startPosition: { ...position }
    });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !containerRef.current) return;
    e.preventDefault();
    updatePosition(e.clientX, e.clientY);
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (!containerRef.current) return;
    e.preventDefault();
    const touch = e.touches[0];
    setIsDragging(true);
    const rect = containerRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    setDragStart({ 
      x: touch.clientX - centerX,
      y: touch.clientY - centerY,
      startPosition: { ...position }
    });
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || !containerRef.current) return;
    e.preventDefault();
    const touch = e.touches[0];
    updatePosition(touch.clientX, touch.clientY);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const updatePosition = (clientX: number, clientY: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    const deltaX = clientX - centerX - dragStart.x;
    const deltaY = clientY - centerY - dragStart.y;
    
    // Convert pixel movement to percentage (limit to reasonable range)
    const radius = rect.width / 2;
    const percentX = Math.max(0, Math.min(100, dragStart.startPosition.x + (deltaX / radius) * 50));
    const percentY = Math.max(0, Math.min(100, dragStart.startPosition.y + (deltaY / radius) * 50));
    
    const newPosition = { x: percentX, y: percentY };
    setPosition(newPosition);
    if (onPositionChange) {
      onPositionChange(newPosition.x, newPosition.y);
    }
  };

  useEffect(() => {
    if (isDragging) {
      const handleGlobalMouseMove = (e: MouseEvent) => {
        e.preventDefault();
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        
        const deltaX = e.clientX - centerX - dragStart.x;
        const deltaY = e.clientY - centerY - dragStart.y;
        
        const radius = rect.width / 2;
        const percentX = Math.max(0, Math.min(100, dragStart.startPosition.x + (deltaX / radius) * 50));
        const percentY = Math.max(0, Math.min(100, dragStart.startPosition.y + (deltaY / radius) * 50));
        
        const newPosition = { x: percentX, y: percentY };
        setPosition(newPosition);
        if (onPositionChange) {
          onPositionChange(newPosition.x, newPosition.y);
        }
      };

      const handleGlobalMouseUp = (e: MouseEvent) => {
        e.preventDefault();
        setIsDragging(false);
      };

      const handleGlobalTouchMove = (e: TouchEvent) => {
        e.preventDefault();
        if (!containerRef.current || e.touches.length === 0) return;
        const touch = e.touches[0];
        const rect = containerRef.current.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        
        const deltaX = touch.clientX - centerX - dragStart.x;
        const deltaY = touch.clientY - centerY - dragStart.y;
        
        const radius = rect.width / 2;
        const percentX = Math.max(0, Math.min(100, dragStart.startPosition.x + (deltaX / radius) * 50));
        const percentY = Math.max(0, Math.min(100, dragStart.startPosition.y + (deltaY / radius) * 50));
        
        const newPosition = { x: percentX, y: percentY };
        setPosition(newPosition);
        if (onPositionChange) {
          onPositionChange(newPosition.x, newPosition.y);
        }
      };

      const handleGlobalTouchEnd = (e: TouchEvent) => {
        e.preventDefault();
        setIsDragging(false);
      };

      window.addEventListener('mousemove', handleGlobalMouseMove);
      window.addEventListener('mouseup', handleGlobalMouseUp);
      window.addEventListener('touchmove', handleGlobalTouchMove, { passive: false });
      window.addEventListener('touchend', handleGlobalTouchEnd);

      return () => {
        window.removeEventListener('mousemove', handleGlobalMouseMove);
        window.removeEventListener('mouseup', handleGlobalMouseUp);
        window.removeEventListener('touchmove', handleGlobalTouchMove);
        window.removeEventListener('touchend', handleGlobalTouchEnd);
      };
    }
  }, [isDragging, dragStart, onPositionChange]);

  return (
    <div className="flex flex-col items-center">
      <div
        ref={containerRef}
        className="relative rounded-full overflow-hidden border-2 border-gray-600 cursor-move touch-none"
        style={{ width: size, height: size }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <img
          src={imageSrc}
          alt="Preview"
          className="w-full h-full object-cover"
          style={{
            objectPosition: `${position.x}% ${position.y}%`,
            pointerEvents: 'none',
          }}
          draggable={false}
        />
        {isDragging && (
          <div className="absolute inset-0 border-2 border-blue-500 border-dashed rounded-full pointer-events-none" />
        )}
      </div>
      <p className="text-xs text-gray-400 mt-2">Drag to reposition image</p>
    </div>
  );
}

