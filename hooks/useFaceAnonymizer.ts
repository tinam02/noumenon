'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import * as faceapi from 'face-api.js';

export type Box = { x: number; y: number; width: number; height: number };
export type Mode = 'blur' | 'pixelate' | 'box';

const MAX_DIM = 1600; // cap giant phone photos

const nextFrame = () =>
  new Promise<void>(r => requestAnimationFrame(() => r()));

let modelsPromise: Promise<void> | null = null;
function ensureModelsLoaded() {
  if (!modelsPromise) {
    modelsPromise = Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri('/models/tiny_face_detector'),
      faceapi.nets.ssdMobilenetv1.loadFromUri('/models/ssd_mobilenetv1'),
    ]).then(() => {});
  }
  return modelsPromise;
}

function fitSize(w: number, h: number) {
  const s = Math.min(1, MAX_DIM / Math.max(w, h));
  return { w: Math.round(w * s), h: Math.round(h * s) };
}

/** downscale -> upscale */
function blurDownUp(src: HTMLCanvasElement, radiusPx: number) {
  const k = Math.min(16, Math.max(2, Math.round(Math.max(1, radiusPx) / 2)));
  const dw = Math.max(1, Math.floor(src.width / k));
  const dh = Math.max(1, Math.floor(src.height / k));

  const small = document.createElement('canvas');
  small.width = dw;
  small.height = dh;
  const sctx = small.getContext('2d')!;
  sctx.imageSmoothingEnabled = true;
  sctx.drawImage(src, 0, 0, dw, dh);

  const out = document.createElement('canvas');
  out.width = src.width;
  out.height = src.height;
  const octx = out.getContext('2d')!;
  octx.imageSmoothingEnabled = true;
  octx.drawImage(small, 0, 0, dw, dh, 0, 0, out.width, out.height);
  return out;
}


function makeFaceMask(
  w: number,
  h: number,
  faces: Box[],
  pad: number,//frow
  feather: number//edge soften
) {
  const m = document.createElement('canvas');
  m.width = w;
  m.height = h;
  const mx = m.getContext('2d')!;
  mx.clearRect(0, 0, w, h);

  //  rects
  mx.fillStyle = '#fff';
  for (const { x, y, width, height } of faces) {
    const rx = Math.max(0, x - pad);
    const ry = Math.max(0, y - pad);
    const rw = Math.min(w - rx, width + pad * 2);
    const rh = Math.min(h - ry, height + pad * 2);
    mx.fillRect(rx, ry, rw, rh);
  }

  // blur the mask to create soft edges
  return blurDownUp(m, feather);
}

export function useFaceAnonymizer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const boxesRef = useRef<Box[] | null>(null);

  const [modelsReady, setModelsReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<Mode>('box');
  const [blurPx, setBlurPx] = useState(12);
  const [pixelSize, setPixelSize] = useState(16);

  const hasImage = !!imgRef.current;

  useEffect(() => {
    ensureModelsLoaded().then(() => setModelsReady(true));
  }, []);

  useEffect(() => {
    if (!imgRef.current || !boxesRef.current) return;
    drawWithMode(imgRef.current, boxesRef.current);
  }, [mode, blurPx, pixelSize]);

  const handleFile = useCallback(async (file: File | null) => {
    if (!file) return;
    setBusy(true);
    await nextFrame();

    const url = URL.createObjectURL(file);
    const raw = new Image();
    raw.src = url;
    raw.onload = async () => {
      try {
        const { w, h } = fitSize(
          raw.naturalWidth || raw.width,
          raw.naturalHeight || raw.height
        );
        const c0 = document.createElement('canvas');
        c0.width = w;
        c0.height = h;
        c0.getContext('2d')!.drawImage(raw, 0, 0, w, h);

        const img = new Image();
        img.src = c0.toDataURL('image/jpeg', 0.92);
        await new Promise(r => (img.onload = () => r(null)));

        imgRef.current = img;
        const boxes = await detectAllFacesRobust(img);
        boxesRef.current = boxes;
        drawWithMode(img, boxes);
      } finally {
        URL.revokeObjectURL(url);
        setMode('box'); // reset
        setBusy(false);
      }
    };
  }, []);

  async function detectAllFacesRobust(img: HTMLImageElement): Promise<Box[]> {
    // tf
    const tinyOpts = new faceapi.TinyFaceDetectorOptions({
      inputSize: 512,
      scoreThreshold: 0.1,
    });
    let det = await faceapi.detectAllFaces(img, tinyOpts);

    // SSD if Tiny under-detects
    if (det.length < 4) {
      const ssdOpts = new faceapi.SsdMobilenetv1Options({
        minConfidence: 0.15,
      });
      const ssdDet = await faceapi.detectAllFaces(img, ssdOpts);
      if (ssdDet.length > det.length) det = ssdDet;
    }

    //  upscale + SSD merge if few/small faces
    const smallFaces = det.some(
      d => d.box.width * d.box.height < img.width * img.height * 0.001
    );
    if (det.length < 6 || smallFaces) {
      const { upscaled, scale } = upscaleImage(img, 1.8);
      const ssdOpts = new faceapi.SsdMobilenetv1Options({
        minConfidence: 0.15,
      });
      const detUp = await faceapi.detectAllFaces(upscaled, ssdOpts);
      const mapped = detUp.map(d => ({
        x: Math.round(d.box.x / scale),
        y: Math.round(d.box.y / scale),
        width: Math.round(d.box.width / scale),
        height: Math.round(d.box.height / scale),
      }));
      return mergeBoxes(
        det.map(d => d.box as faceapi.Box),
        mapped,
        0.3
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

  function drawWithMode(img: HTMLImageElement, boxes: Box[]) {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;

    // base sharp
    c.width = img.width;
    c.height = img.height;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0);
    if (boxes.length === 0) return;

    if (mode === 'blur') {
      // use largest face to scale strength; apply to all w mask
      const largest = boxes.reduce((a, b) =>
        a.width * a.height > b.width * b.height ? a : b
      );
      const relArea =
        (largest.width * largest.height) / (img.width * img.height);
      let base = Math.min(Math.max(10 * relArea * 100, 6), 30);
      const strength = base * (blurPx / 12);

      // blurred copy of the full img
      const snap = document.createElement('canvas');
      snap.width = c.width;
      snap.height = c.height;
      snap.getContext('2d')!.drawImage(c, 0, 0);
      const blurred = blurDownUp(snap, strength);

      // feathered mask over faces
      const pad = Math.round(Math.min(largest.width, largest.height) * 0.12);
      const feather = Math.max(8, Math.round(strength * 0.9));
      const mask = makeFaceMask(c.width, c.height, boxes, pad, feather);

      // clip blurred by mask and draw
      const bctx = blurred.getContext('2d')!;
      bctx.globalCompositeOperation = 'destination-in';
      bctx.drawImage(mask, 0, 0);
      bctx.globalCompositeOperation = 'source-over';

      ctx.drawImage(blurred, 0, 0);
      return;
    }

    // pixelate / box
    for (const { x, y, width, height } of boxes) {
      if (mode === 'pixelate') {
        const block = Math.max(4, pixelSize);
        const wBlocks = Math.max(1, Math.floor(width / block));
        const hBlocks = Math.max(1, Math.floor(height / block));
        const tmp = document.createElement('canvas');
        tmp.width = wBlocks;
        tmp.height = hBlocks;
        const tctx = tmp.getContext('2d')!;
        tctx.imageSmoothingEnabled = false;
        tctx.drawImage(c, x, y, width, height, 0, 0, wBlocks, hBlocks);
        ctx.save();
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(tmp, 0, 0, wBlocks, hBlocks, x, y, width, height);
        ctx.imageSmoothingEnabled = true;
        ctx.restore();
      } else {
        ctx.fillStyle = '#000';
        ctx.fillRect(x, y, width, height);
      }
    }
  }

  function downloadPNG() {
    const c = canvasRef.current;
    if (!c) return;
    const a = document.createElement('a');
    a.download = 'anonymized.png';
    a.href = c.toDataURL('image/png');
    a.click();
  }

  return {
    modelsReady,
    busy,
    hasImage,
    mode,
    blurPx,
    pixelSize,
    canvasRef,
    setMode,
    setBlurPx,
    setPixelSize,
    handleFile,
    downloadPNG,
  };
}
