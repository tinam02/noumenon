'use client';

import { useEffect, useRef, useState } from 'react';
import * as faceapi from 'face-api.js';
import * as Select from '@radix-ui/react-select';
import * as Slider from '@radix-ui/react-slider';
import * as Label from '@radix-ui/react-label';
import { BlurIcon, PixelateIcon, BoxIcon } from '@/components/Icons';

type Box = { x: number; y: number; width: number; height: number };
type Mode = 'blur' | 'pixelate' | 'box';

export default function Page() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const boxesRef = useRef<Box[] | null>(null);

  const [modelsReady, setModelsReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState('No file selected.');

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

  async function handleFile(file: File | null) {
    if (!file) return;
    setBusy(true);
    setFileName(file.name);

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
        ctx.save();
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
    <main className='frame'>
      {!modelsReady ? (
        <div className='controls'>
          <div className='control'>
            <Label.Root className='metaLabel'>Loading</Label.Root>
            <div className='input'>Downloading models…</div>
          </div>
        </div>
      ) : (
        <>
          <form className='controls' onSubmit={e => e.preventDefault()}>
            <div className='control span-2'>
              <Label.Root className='metaLabel' htmlFor='filePick'>
                Image
              </Label.Root>
              <div className='fileWrap'>
                <label htmlFor='filePick' className='fileBtn'>
                  Browse…
                </label>
                <input
                  id='filePick'
                  type='file'
                  accept='image/*'
                  onChange={e => handleFile(e.target.files?.[0] ?? null)}
                  disabled={busy}
                />
              </div>
            </div>

            <div
              className='modeGrid'
              role='group'
              aria-label='Anonymization mode'
            >
              <button
                type='button'
                className={mode === 'blur' ? 'm active' : 'm'}
                aria-pressed={mode === 'blur'}
                onClick={() => setMode('blur')}
              >
                <BlurIcon />
                <span className='mLabel'>Blur</span>
              </button>

              <button
                type='button'
                className={mode === 'pixelate' ? 'm active' : 'm'}
                aria-pressed={mode === 'pixelate'}
                onClick={() => setMode('pixelate')}
              >
                <PixelateIcon />
                <span className='mLabel'>Pixelate</span>
              </button>

              <button
                type='button'
                className={mode === 'box' ? 'm active' : 'm'}
                aria-pressed={mode === 'box'}
                onClick={() => setMode('box')}
              >
                <BoxIcon />
                <span className='mLabel'>Box</span>
              </button>
            </div>

            {mode === 'blur' && (
              <div className='control'>
                <Label.Root className='metaLabel'>Blur</Label.Root>
                <Slider.Root
                  className='sliderRoot'
                  value={[blurPx]}
                  onValueChange={([v]) => setBlurPx(v)}
                  min={4}
                  max={40}
                  step={1}
                  aria-label='Blur amount'
                >
                  <Slider.Track className='sliderTrack'>
                    <Slider.Range className='sliderRange' />
                  </Slider.Track>
                  <Slider.Thumb className='sliderThumb' aria-label='Handle' />
                </Slider.Root>
              </div>
            )}

            {mode === 'pixelate' && (
              <div className='control'>
                <Label.Root className='metaLabel'>Pixel size</Label.Root>
                <Slider.Root
                  className='sliderRoot'
                  value={[pixelSize]}
                  onValueChange={([v]) => setPixelSize(v)}
                  min={4}
                  max={40}
                  step={2}
                  aria-label='Pixel size'
                >
                  <Slider.Track className='sliderTrack'>
                    <Slider.Range className='sliderRange' />
                  </Slider.Track>
                  <Slider.Thumb className='sliderThumb' aria-label='Handle' />
                </Slider.Root>
              </div>
            )}

            <div className='control span-2'>
              <button
                type='button'
                className='button'
                onClick={onDownload}
                disabled={busy}
              >
                Download PNG
              </button>
            </div>
          </form>

          <section className='stage'>
            <canvas ref={canvasRef} className='canvas' />
          </section>
        </>
      )}
    </main>
  );
}
