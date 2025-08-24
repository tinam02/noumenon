'use client';

import { BlurIcon, PixelateIcon, BoxIcon } from '@/components/Icons';
import type { Mode } from '@/hooks/useFaceAnonymizer';
import * as Label from '@radix-ui/react-label';

export default function ModePicker({
  mode,
  setMode,
  disabled,
}: {
  mode: Mode;
  setMode: (m: Mode) => void;
  disabled?: boolean;
}) {
  return (
    <section>
      <Label.Root className='metaLabel'>Filter</Label.Root>
      <div className='modeGrid' role='group' aria-label='Anonymization mode'>
        <button
          type='button'
          className={mode === 'blur' ? 'm active' : 'm'}
          aria-pressed={mode === 'blur'}
          onClick={() => setMode('blur')}
          disabled={disabled}
        >
          <BlurIcon />
          <span className='mLabel'>Blur</span>
        </button>
        <button
          type='button'
          className={mode === 'pixelate' ? 'm active' : 'm'}
          aria-pressed={mode === 'pixelate'}
          onClick={() => setMode('pixelate')}
          disabled={disabled}
        >
          <PixelateIcon />
          <span className='mLabel'>Pixelate</span>
        </button>
        <button
          type='button'
          className={mode === 'box' ? 'm active' : 'm'}
          aria-pressed={mode === 'box'}
          onClick={() => setMode('box')}
          disabled={disabled}
        >
          <BoxIcon />
          <span className='mLabel'>Box</span>
        </button>
      </div>
    </section>
  );
}
