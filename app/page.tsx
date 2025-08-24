'use client';

import * as Label from '@radix-ui/react-label';
import UploadButton from '@/components/UploadButton';
import ModePicker from '@/components/ModePicker';
import IntensitySlider from '@/components/IntensitySlider';
import CanvasStage from '@/components/CanvasStage';
import { useFaceAnonymizer } from '@/hooks/useFaceAnonymizer';

export default function Page() {
  const {
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
  } = useFaceAnonymizer();

  return (
    <main className='frame'>
      {!modelsReady ? (
        <div className='fileWrap'>
          <img src='/assets/p.gif' alt='loader' style={{ width: 76 }} />
          <div className='controls'>
            <div className='control'>
              <Label.Root className='metaLabel'>Loading</Label.Root>
              <div>Preparing models…</div>
            </div>
          </div>
        </div>
      ) : (
        <>
          <form className='controls' onSubmit={e => e.preventDefault()}>
            <div className='control span-2'>
              <UploadButton busy={busy} onPick={handleFile} />
            </div>

            {hasImage && (
              <>
                <ModePicker mode={mode} setMode={setMode} disabled={busy} />
                {mode === 'blur' && (
                  <IntensitySlider
                    label='Intensity'
                    value={blurPx}
                    min={4}
                    max={40}
                    step={1}
                    onChange={setBlurPx}
                    disabled={busy}
                  />
                )}
                {mode === 'pixelate' && (
                  <IntensitySlider
                    label='Pixel size'
                    value={pixelSize}
                    min={4}
                    max={40}
                    step={2}
                    onChange={setPixelSize}
                    disabled={busy}
                  />
                )}
              </>
            )}
          </form>

          <CanvasStage
            canvasRef={canvasRef}
            hasImage={hasImage}
            busy={busy}
            onPick={handleFile}
          />

          {hasImage && (
            <div className='control span-2'>
              <button
                type='button'
                className='button big'
                onClick={downloadPNG}
                disabled={busy}
                data-testid='btn-dl'
              >
                Download image
              </button>
            </div>
          )}
        </>
      )}
    </main>
  );
}
