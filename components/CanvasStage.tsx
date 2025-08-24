'use client';

import { useRef } from 'react';

export default function CanvasStage({
  canvasRef,
  hasImage,
  busy,
  onPick,
}: {
  canvasRef: React.RefObject<HTMLCanvasElement>;
  hasImage: boolean;
  busy: boolean;
  onPick: (f: File | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerPick = () => !busy && inputRef.current?.click();

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    if (busy) return;
    const file = e.dataTransfer.files?.[0] ?? null;
    if (file) onPick(file);
  }
  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
  }

  return (
    <section className='stage' onDrop={onDrop} onDragOver={onDragOver}>
      <canvas
        ref={canvasRef}
        className={`canvas ${!hasImage ? 'empty' : ''}`}
      />
      <input
        ref={inputRef}
        type='file'
        accept='image/*'
        onChange={e => onPick(e.target.files?.[0] ?? null)}
        style={{ display: 'none' }}
      />
    </section>
  );
}
