'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import * as faceapi from 'face-api.js';

export type Box = { x: number; y: number; width: number; height: number };
export type Mode = 'blur' | 'pixelate' | 'box';

async function nextFrame() {
  return new Promise<void>(r => requestAnimationFrame(() => r()));
}

export function useFaceAnonymizer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const boxesRef = useRef<Box[] | null>(null);

  const [modelsReady, setModelsReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<Mode>('blur');
  const [blurPx, setBlurPx] = useState(12);
  const [pixelSize, setPixelSize] = useState(16);

  const hasImage = !!imgRef.current;

  // models
  useEffect(() => {
    (async () => {
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri('/models/tiny_face_detector'),
        faceapi.nets.ssdMobilenetv1.loadFromUri('/models/ssd_mobilenetv1'),
      ]);
      setModelsReady(true);
    })();
  }, []);

  // Redraw
  useEffect(() => {
    if (!imgRef.current || !boxesRef.current) return;
    drawWithMode(imgRef.current, boxesRef.current);
  }, [mode, blurPx, pixelSize]);

  const handleFile = useCallback(async (file: File | null) => {
    if (!file) return;
    setBusy(true);
    await nextFrame();

    const url = URL.createObjectURL(file);
    const img = new Image();
    img.src = url;
    img.onload = async () => {
      try {
        imgRef.current = img;
        const boxes = await detectAllFacesRobust(img);
        boxesRef.current = boxes;
        drawWithMode(img, boxes);
      } finally {
        URL.revokeObjectURL(img.src);
        setBusy(false);
      }
    };
  }, []);

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

  function drawWithMode(img: HTMLImageElement, boxes: Box[]) {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;

    c.width = img.width;
    c.height = img.height;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0);

    for (const { x, y, width, height } of boxes) {
      if (mode === 'blur') {
        const tmp = document.createElement('canvas');
        tmp.width = width;
        tmp.height = height;
        const tctx = tmp.getContext('2d')!;
        tctx.drawImage(c, x, y, width, height, 0, 0, width, height);
        ctx.save();
        ctx.filter = `blur(${blurPx}px)`;
        ctx.drawImage(tmp, x, y);
        ctx.restore();
      } else if (mode === 'pixelate') {
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
        ctx.save();
        ctx.fillStyle = '#000';
        ctx.fillRect(x, y, width, height);
        ctx.restore();
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
    // st
    modelsReady,
    busy,
    // fileName,
    hasImage,
    mode,
    blurPx,
    pixelSize,
    // refs
    canvasRef,
    // acts
    setMode,
    setBlurPx,
    setPixelSize,
    handleFile,
    downloadPNG,
  };
}
