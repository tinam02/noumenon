'use client';

import { useEffect, useRef, useState } from 'react';
import * as faceapi from 'face-api.js';

type Box = { x: number; y: number; width: number; height: number };
type Mode = 'blur' | 'pixelate' | 'box';

export default function Page() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const boxesRef = useRef<Box[] | null>(null);

  const [modelsReady, setModelsReady] = useState(false);
  const [busy, setBusy] = useState(false);

  const [mode, setMode] = useState<Mode>('blur');
  const [blurPx, setBlurPx] = useState(12);
  const [pixelSize, setPixelSize] = useState(16);

  // recog models
  useEffect(() => {
    (async () => {
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri('/models/tiny_face_detector'),
        faceapi.nets.ssdMobilenetv1.loadFromUri('/models/ssd_mobilenetv1'),
      ]);
      setModelsReady(true);
    })();
  }, []);

  // re-apply
  useEffect(() => {
    if (!imgRef.current || !boxesRef.current) return;
    drawWithMode(imgRef.current, boxesRef.current);
  }, [mode, blurPx, pixelSize]);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);

    const img = new Image();
    img.src = URL.createObjectURL(file);
    img.onload = async () => {
      try {
        imgRef.current = img;
        const boxes = await detectAllFacesRobust(img);
        boxesRef.current = boxes;
        drawWithMode(img, boxes);
      } finally {
        setBusy(false);
        URL.revokeObjectURL(img.src);
      }
    };
  }

  // ---------------- Detection ----------------
  async function detectAllFacesRobust(img: HTMLImageElement): Promise<Box[]> {
    const tinyOpts = new faceapi.TinyFaceDetectorOptions({
      inputSize: 512,
      scoreThreshold: 0.1,
    });
    let det = await faceapi.detectAllFaces(img, tinyOpts);

    if (det.length < 4) {
      const ssdOpts = new faceapi.SsdMobilenetv1Options({
        minConfidence: 0.15,
      });
      det = await faceapi.detectAllFaces(img, ssdOpts);
    }

    const smallFaces = det.some(
      d => d.box.width * d.box.height < img.width * img.height * 0.001
    );
    if (det.length < 6 || smallFaces) {
      const { upscaled, scale } = upscaleImage(img, 2);
      const ssdOpts = new faceapi.SsdMobilenetv1Options({
        minConfidence: 0.15,
      });
      const detUpscaled = await faceapi.detectAllFaces(upscaled, ssdOpts);
      const mapped = detUpscaled.map(d => ({
        x: Math.round(d.box.x / scale),
        y: Math.round(d.box.y / scale),
        width: Math.round(d.box.width / scale),
        height: Math.round(d.box.height / scale),
      }));
      return mergeBoxes(
        det.map(d => d.box as faceapi.Box),
        mapped
      );
    }

    return det.map(d => ({
      x: Math.round(d.box.x),
      y: Math.round(d.box.y),
      width: Math.round(d.box.width),
      height: Math.round(d.box.height),
    }));
  }

  function upscaleImage(img: HTMLImageElement, factor: number) {
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * factor);
    c.height = Math.round(img.height * factor);
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const upscaled = new Image();
    upscaled.src = c.toDataURL('image/png');
    return { upscaled, scale: factor };
  }

  function mergeBoxes(
    a: (faceapi.Box | Box)[],
    b: Box[],
    iouThresh = 0.3
  ): Box[] {
    const boxes: Box[] = [
      ...a.map(bb => ({
        x: Math.round(bb.x),
        y: Math.round(bb.y),
        width: Math.round(bb.width),
        height: Math.round(bb.height),
      })),
      ...b,
    ];
    const kept: Box[] = [];
    boxes.sort((b1, b2) => b2.width * b2.height - b1.width * b1.height);
    for (const box of boxes)
      if (!kept.some(k => iou(k, box) > iouThresh)) kept.push(box);
    return kept;
  }

  function iou(b1: Box, b2: Box) {
    const x1 = Math.max(b1.x, b2.x);
    const y1 = Math.max(b1.y, b2.y);
    const x2 = Math.min(b1.x + b1.width, b2.x + b2.width);
    const y2 = Math.min(b1.y + b1.height, b2.y + b2.height);
    const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
    const area1 = b1.width * b1.height;
    const area2 = b2.width * b2.height;
    return inter / (area1 + area2 - inter + 1e-9);
  }

  // ---------------- Drawing ----------------
  function drawWithMode(img: HTMLImageElement, boxes: Box[]) {
    const c = canvasRef.current!;
    const ctx = c.getContext('2d')!;
    c.width = img.width;
    c.height = img.height;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0);

    for (const { x, y, width, height } of boxes) {
      if (mode === 'blur') {
        // BLUR
        const tmp = document.createElement('canvas');
        tmp.width = width;
        tmp.height = height;
        const tctx = tmp.getContext('2d')!;
        tctx.drawImage(c, x, y, width, height, 0, 0, width, height); //copy detectiion

        ctx.save();
        ctx.filter = `blur(${blurPx}px)`;
        ctx.drawImage(tmp, x, y);
        ctx.restore();
      } else if (mode === 'pixelate') {
        // PIXELATE
        const block = Math.max(4, pixelSize);
        const wBlocks = Math.max(1, Math.floor(width / block));
        const hBlocks = Math.max(1, Math.floor(height / block));
        const tmp = document.createElement('canvas');
        tmp.width = wBlocks;
        tmp.height = hBlocks;
        const tctx = tmp.getContext('2d')!;
        tctx.imageSmoothingEnabled = false;
        tctx.drawImage(c, x, y, width, height, 0, 0, wBlocks, hBlocks);
        //redraw
        ctx.save();
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(tmp, 0, 0, wBlocks, hBlocks, x, y, width, height);
        ctx.imageSmoothingEnabled = true;
        ctx.restore();
      } else {
        // BOX
        const alpha = Math.max(0.2, Math.min(1, 1)); //opacity
        ctx.save();
        console.log({alpha})
        ctx.globalAlpha = alpha;
        ctx.fillStyle = '#000';
        ctx.fillRect(x, y, width, height);
        ctx.restore();
      }
    }
  }

  function onDownload() {
    const c = canvasRef.current;
    if (!c) return;
    const a = document.createElement('a');
    a.download = 'anonymized.png';
    a.href = c.toDataURL('image/png');
    a.click();
  }

  return (
    <main style={{ padding: 20, fontFamily: 'system-ui' }}>
      {!modelsReady ? (
        <p>Loading...</p>
      ) : (
        <>
          <input
            type='file'
            accept='image/*'
            onChange={handleFileChange}
            disabled={busy}
          />

          <div
            style={{
              display: 'flex',
              gap: 16,
              alignItems: 'center',
              flexWrap: 'wrap',
              marginTop: 12,
            }}
          >
            <label>
               <select
                value={mode}
                onChange={e => setMode(e.target.value as Mode)}
              >
                <option value='blur'>Blur</option>
                <option value='pixelate'>Pixelate</option>
                <option value='box'>Solid box</option>
              </select>
            </label>

            {mode === 'blur' && (
              <label>
                Blur:&nbsp;
                <input
                  type='range'
                  min={4}
                  max={40}
                  step={1}
                  value={blurPx}
                  onChange={e => setBlurPx(parseInt(e.target.value, 10))}
                />
                &nbsp;{blurPx}
              </label>
            )}

            {mode === 'pixelate' && (
              <label>
                Pixels:&nbsp;
                <input
                  type='range'
                  min={4}
                  max={40}
                  step={2}
                  value={pixelSize}
                  onChange={e => setPixelSize(parseInt(e.target.value, 10))}
                />
                &nbsp;{pixelSize}
              </label>
            )}

            <button onClick={onDownload} disabled={busy}>
              Download PNG
            </button>
          </div>
        </>
      )}

      <div style={{ marginTop: 16 }}>
        <canvas
          ref={canvasRef}
          style={{
            maxWidth: '100%',
            border: '1px solid #ccc',
            borderRadius: 8,
          }}
        />
      </div>
    </main>
  );
}
