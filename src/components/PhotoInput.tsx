import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { Camera, ImagePlus, MapPin, Trash2 } from 'lucide-react';
import * as exifr from 'exifr';
import type { Coordinates, PreparedPhoto } from '../../shared/types';

interface PhotoInputProps {
  value: PreparedPhoto | null;
  onChange: (value: PreparedPhoto | null) => void;
  disabled?: boolean;
}

const MAX_FILE_BYTES = 15 * 1024 * 1024;
const MAX_EDGE = 1920;

function validGps(value: unknown): value is Coordinates {
  if (!value || typeof value !== 'object') return false;
  const gps = value as Coordinates;
  return Number.isFinite(gps.latitude) && Math.abs(gps.latitude) <= 90
    && Number.isFinite(gps.longitude) && Math.abs(gps.longitude) <= 180;
}

async function isSupportedImage(file: File): Promise<boolean> {
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte);
  const webp = bytes.length === 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF'
    && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
  return jpeg || png || webp;
}

export function PhotoInput({ value, onChange, disabled = false }: PhotoInputProps) {
  const pickerRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const generation = useRef(0);
  const cancelDecode = useRef<(() => void) | null>(null);
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [metadataWarning, setMetadataWarning] = useState('');
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);

  useEffect(() => () => {
    generation.current += 1;
    cancelDecode.current?.();
  }, []);

  useEffect(() => {
    if (disabled) {
      generation.current += 1;
      cancelDecode.current?.();
      setBusy(false);
      setDragging(false);
      dragDepth.current = 0;
    }
  }, [disabled]);

  async function prepare(file: File) {
    if (disabledRef.current) return;
    const ticket = ++generation.current;
    cancelDecode.current?.();
    setError('');
    setMetadataWarning('');
    setBusy(true);
    onChange(null);
    const current = () => ticket === generation.current && !disabledRef.current;
    let release: (() => void) | undefined;

    try {
      if (!file.size) throw new Error('This image is empty. Please choose another photo.');
      if (file.size > MAX_FILE_BYTES) throw new Error('This photo is larger than 15 MB. Choose a smaller JPEG, PNG, or WebP image.');
      if (!await isSupportedImage(file)) throw new Error('Choose a JPEG, PNG, or WebP photo. Other formats, including HEIC, are not supported.');
      if (!current()) return;

      const objectUrl = URL.createObjectURL(file);
      const image = new Image();
      let rejectDecode: (reason: Error) => void = () => {};
      release = () => {
        image.onload = null;
        image.onerror = null;
        image.src = '';
        URL.revokeObjectURL(objectUrl);
        rejectDecode(new Error('Photo loading was cancelled.'));
      };
      cancelDecode.current = release;
      await new Promise<void>((resolve, reject) => {
        rejectDecode = reject;
        image.onload = () => resolve();
        image.onerror = () => reject(new Error('This photo could not be decoded. It may be damaged; try another image.'));
        image.src = objectUrl;
      });
      if (!current()) return;
      if (!image.naturalWidth || !image.naturalHeight) throw new Error('This photo has no readable image dimensions. Try another photo.');

      let gps: Coordinates | null = null;
      try {
        const extracted: unknown = await exifr.gps(file);
        if (validGps(extracted)) gps = { latitude: extracted.latitude, longitude: extracted.longitude };
      } catch {
        if (current()) setMetadataWarning('Photo GPS metadata could not be read. You can still set the location below.');
      }
      if (!current()) return;

      const scale = Math.min(1, MAX_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
      const width = Math.max(1, Math.round(image.naturalWidth * scale));
      const height = Math.max(1, Math.round(image.naturalHeight * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Your browser could not prepare this image. Try another browser or photo.');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);
      let dataUrl = canvas.toDataURL('image/jpeg', 0.86);
      for (const quality of [0.7, 0.5, 0.3]) {
        if (dataUrl.length <= 5_600_023) break;
        dataUrl = canvas.toDataURL('image/jpeg', quality);
      }
      canvas.width = 0;
      canvas.height = 0;
      if (!dataUrl.startsWith('data:image/jpeg;base64,')) throw new Error('Your browser could not encode the photo. Try another browser.');
      if (dataUrl.length > 5_600_023) throw new Error('The prepared image is too large to send. Please choose a smaller photo.');
      if (current()) onChange({ dataUrl, fileName: 'report-photo.jpg', width, height, gps });
    } catch (cause) {
      if (current()) setError(cause instanceof Error ? cause.message : 'The photo could not be prepared. Please try another image.');
    } finally {
      release?.();
      if (cancelDecode.current === release) cancelDecode.current = null;
      if (current()) setBusy(false);
    }
  }

  function choose(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (file) void prepare(file);
  }

  function drop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    if (disabled) return;
    if (event.dataTransfer.files.length !== 1) {
      setError('Drop one photo at a time.');
      return;
    }
    void prepare(event.dataTransfer.files[0]);
  }

  function remove() {
    generation.current += 1;
    cancelDecode.current?.();
    setBusy(false);
    setError('');
    setMetadataWarning('');
    onChange(null);
  }

  return (
    <div className="photo-input" aria-busy={busy}>
      <input ref={pickerRef} id="photo-input" type="file" accept="image/jpeg,image/png,image/webp" hidden disabled={disabled} onChange={choose} />
      <input ref={cameraRef} id="camera-input" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" hidden disabled={disabled} onChange={choose} />
      <div
        className={`photo-frame${dragging ? ' is-dragging' : ''}${value ? ' has-photo' : ''}`}
        onDragEnter={(event) => { event.preventDefault(); if (!disabled) { dragDepth.current += 1; setDragging(true); } }}
        onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = disabled ? 'none' : 'copy'; }}
        onDragLeave={(event) => { event.preventDefault(); dragDepth.current = Math.max(0, dragDepth.current - 1); if (!dragDepth.current) setDragging(false); }}
        onDrop={drop}
      >
        {value ? (
          <figure className="photo-preview">
            <img src={value.dataUrl} width={value.width} height={value.height} alt="Your photo of the problem" />
            <figcaption className={value.gps ? 'has-gps' : ''}>
              <MapPin size={14} aria-hidden="true" />{value.gps ? 'Location found in photo' : 'No location in photo. You’ll pin it next.'}
            </figcaption>
          </figure>
        ) : (
          <div className="photo-empty">
            <span className="photo-empty-icon"><Camera size={30} aria-hidden="true" /></span>
            <strong>{busy ? 'Getting your photo ready…' : 'Show us the problem'}</strong>
            <span className="fine-only">Drop a photo here, or choose one.</span>
            <span className="coarse-only">Take it from the sidewalk, not the road.</span>
          </div>
        )}
      </div>
      <div className={`photo-actions${value ? '' : ' is-empty'}`}>
        {value ? <>
          <button type="button" className="btn btn-ghost coarse-only" disabled={disabled} onClick={() => cameraRef.current?.click()}><Camera size={18} aria-hidden="true" />Retake</button>
          <button type="button" className="btn btn-ghost" disabled={disabled} onClick={() => pickerRef.current?.click()}><ImagePlus size={18} aria-hidden="true" />Replace</button>
          <button type="button" className="icon-button" disabled={disabled} onClick={remove} aria-label="Remove photo"><Trash2 size={18} aria-hidden="true" /></button>
        </> : <>
          <button type="button" className="btn btn-primary coarse-only" disabled={disabled || busy} onClick={() => cameraRef.current?.click()}><Camera size={19} aria-hidden="true" />Take a photo</button>
          <button type="button" className="btn btn-primary fine-only" disabled={disabled || busy} onClick={() => pickerRef.current?.click()}><ImagePlus size={19} aria-hidden="true" />Choose a photo</button>
          <button type="button" className="btn btn-ghost coarse-only" disabled={disabled || busy} onClick={() => pickerRef.current?.click()}><ImagePlus size={18} aria-hidden="true" />From your library</button>
        </>}
      </div>
      {error && <p className="field-error" role="alert">{error}</p>}
      {metadataWarning && <p className="field-hint">{metadataWarning}</p>}
    </div>
  );
}
