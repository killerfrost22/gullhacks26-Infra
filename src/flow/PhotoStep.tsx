import { useRef, useState, useSyncExternalStore, type DragEvent } from 'react';
import { Camera, ImagePlus, Images, LoaderCircle, MapPin, RotateCcw, TriangleAlert, X } from 'lucide-react';
import { messageFor } from '../lib/messages';
import { PHOTO_MAX_INPUT_BYTES, preparePhoto, type PreparedPhoto } from '../lib/photo';

const ACCEPT = 'image/jpeg,image/png,image/webp';
const MAX_MB = Math.round(PHOTO_MAX_INPUT_BYTES / (1024 * 1024));

const coarsePointer = window.matchMedia('(pointer: coarse)');

interface PhotoStepProps {
  photo: PreparedPhoto | null;
  onPhoto: (photo: PreparedPhoto) => void;
  onRemove: () => void;
  initialError?: string;
}

export function PhotoStep({ photo, onPhoto, onRemove, initialError }: PhotoStepProps) {
  const touch = useSyncExternalStore(
    (listener) => {
      coarsePointer.addEventListener('change', listener);
      return () => coarsePointer.removeEventListener('change', listener);
    },
    () => coarsePointer.matches,
  );
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [dragging, setDragging] = useState(false);

  async function take(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      onPhoto(await preparePhoto(file));
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setBusy(false);
    }
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    void take(event.dataTransfer.files[0]);
  }

  const inputs = (
    <>
      <input
        ref={cameraRef}
        type="file"
        accept={ACCEPT}
        capture="environment"
        hidden
        onChange={(event) => {
          void take(event.target.files?.[0]);
          event.target.value = '';
        }}
      />
      <input
        ref={libraryRef}
        type="file"
        accept={ACCEPT}
        hidden
        onChange={(event) => {
          void take(event.target.files?.[0]);
          event.target.value = '';
        }}
      />
    </>
  );

  const errorNotice = error && (
    <div className="notice notice--error" role="alert">
      <TriangleAlert size={20} aria-hidden="true" />
      <p>{error}</p>
    </div>
  );

  if (photo) {
    return (
      <div className="photo-done">
        {inputs}
        <figure className="photo-preview">
          <img src={photo.dataUrl} alt="Your photo of the problem" width={photo.width} height={photo.height} />
        </figure>
        <div className="photo-meta">
          <p className="photo-note">
            {photo.gps ? (
              <>
                <MapPin size={18} aria-hidden="true" />
                <span>This photo has a location. We’ll suggest that spot; you confirm it.</span>
              </>
            ) : (
              <span>No location in this photo. You’ll pick the spot next.</span>
            )}
          </p>
          <p className="photo-fine">Resized on your device, with its hidden data (camera, time, GPS) removed.</p>
          <div className="photo-actions">
            <button
              type="button"
              className="btn btn--sm"
              // Without `capture`, phones offer both the camera and the library.
              onClick={() => libraryRef.current?.click()}
              disabled={busy}
              aria-busy={busy}
            >
              {busy ? <LoaderCircle size={18} className="spin" aria-hidden="true" /> : <RotateCcw size={18} aria-hidden="true" />}
              Replace
            </button>
            <button type="button" className="btn btn--sm btn--quiet" onClick={onRemove} disabled={busy}>
              <X size={18} aria-hidden="true" />
              Remove
            </button>
          </div>
          {errorNotice}
        </div>
      </div>
    );
  }

  return (
    <div className="photo-pick">
      {inputs}
      {touch ? (
        <div className="photo-buttons">
          <button
            type="button"
            className="btn btn--primary btn--lg btn--block"
            onClick={() => cameraRef.current?.click()}
            disabled={busy}
          >
            <Camera size={22} aria-hidden="true" />
            Take a photo
          </button>
          <button
            type="button"
            className="btn btn--lg btn--block"
            onClick={() => libraryRef.current?.click()}
            disabled={busy}
          >
            <Images size={22} aria-hidden="true" />
            From your library
          </button>
        </div>
      ) : (
        <div
          className="dropzone"
          data-dragging={dragging || undefined}
          onDragEnter={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
          }}
          onDrop={onDrop}
        >
          <ImagePlus size={32} aria-hidden="true" className="dropzone-icon" />
          <p className="dropzone-text">
            <strong>Drop a photo here</strong>
            <span>JPEG, PNG, or WebP, up to {MAX_MB} MB</span>
          </p>
          <button
            type="button"
            className="btn btn--primary btn--lg"
            onClick={() => libraryRef.current?.click()}
            disabled={busy}
          >
            <ImagePlus size={22} aria-hidden="true" />
            Choose a photo
          </button>
        </div>
      )}
      {busy && (
        <p className="photo-busy" role="status">
          <LoaderCircle size={18} className="spin" aria-hidden="true" />
          Preparing your photo…
        </p>
      )}
      {errorNotice}
    </div>
  );
}
