'use client';

import classNames from 'classnames';

export default function UploadButton({
  busy,
  onPick
}: {
  busy: boolean;
  onPick: (f: File | null) => void;
}) {
  return (
    <div className='fileWrap'>
      <label
        htmlFor='filePick'
        className={classNames('fileBtn', 'big', busy && 'disabled')}
      >
        <img
          src='https://em-content.zobj.net/source/microsoft/74/open-file-folder_1f4c2.png'
          style={{ width: 24 }}
          alt=''
        />
        <span>{busy ? 'Loading...' : 'Browse image…'}</span>
      </label>

      <input
        id='filePick'
        type='file'
        accept='image/*'
        disabled={busy}
        onChange={e => onPick(e.target.files?.[0] ?? null)}
      />

      {busy && <div className='spinner' aria-hidden />}
    </div>
  );
}
