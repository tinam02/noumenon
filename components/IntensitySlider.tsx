'use client';

import * as Slider from '@radix-ui/react-slider';
import * as Label from '@radix-ui/react-label';

export default function IntensitySlider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className='control'>
      <Label.Root className='metaLabel'>{label}</Label.Root>
      <Slider.Root
        className='sliderRoot'
        value={[value]}
        onValueChange={([v]) => onChange(v)}
        min={min}
        max={max}
        step={step}
        aria-label={label}
        disabled={disabled}
      >
        <Slider.Track className='sliderTrack'>
          <Slider.Range className='sliderRange' />
        </Slider.Track>
        <Slider.Thumb className='sliderThumb' aria-label='Handle' />
      </Slider.Root>
    </div>
  );
}
