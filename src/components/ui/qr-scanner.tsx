"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, FlipHorizontal, ImageUp, AlertCircle, Loader2 } from 'lucide-react';
import jsQR from 'jsqr';
import { decodeQrImage } from '@/lib/scanner/decode-image';

interface QrScannerProps {
  onDecode: (text: string) => void | Promise<void>;
  autoStart?: boolean;
  imageInput?: boolean;
}

export function QrScanner({ onDecode, autoStart = false, imageInput = true }: QrScannerProps) {

  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const requestRef = useRef(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const decodeRef = useRef(onDecode);
  const [status, setStatus] = useState<'inactive' | 'starting' | 'active'>('inactive');
  const [error, setError] = useState<string | null>(null);
  const [readingImage, setReadingImage] = useState(false);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [activeCameraId, setActiveCameraId] = useState('');

  useEffect(() => { decodeRef.current = onDecode; }, [onDecode]);

  const stop = useCallback(() => {

    requestRef.current++;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setStatus('inactive');
  }, []);

  const start = useCallback(async (deviceId?: string) => {

    stop();
    setError(null);
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setError('Camera access requires HTTPS or localhost. Use an image or manual entry.');
      return;
    }

    const request = requestRef.current;
    setStatus('starting');
    timeoutRef.current = setTimeout(() => {
      if (request !== requestRef.current) return;
      stop();
      setError('Camera did not start. Check camera permission, then retry or use an image or manual entry.');
    }, 15000);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: 'environment' } }), width: { ideal: 640 }, height: { ideal: 640 } },
      });
      // Permission prompts can resolve after cancellation or timeout; release that late stream.
      if (request !== requestRef.current || !videoRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      streamRef.current = stream;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      if (request !== requestRef.current) return;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setStatus('active');
      setActiveCameraId(stream.getVideoTracks()[0]?.getSettings().deviceId || '');
      const devices = await navigator.mediaDevices.enumerateDevices();
      if (request === requestRef.current) setCameras(devices.filter((device) => device.kind === 'videoinput'));
    } catch (cause) {
      if (request !== requestRef.current) return;
      console.warn('Camera initialization failed:', cause);
      stop();
      setError('Camera unavailable or permission denied. Check site permissions, then retry or use manual entry.');
    }
  }, [stop]);

  useEffect(() => {
    if (autoStart) void start();
    return stop;
  }, [autoStart, start, stop]);

  useEffect(() => {
    if (status !== 'active') return;
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { willReadFrequently: true });
    let busy = false;
    const interval = setInterval(async () => {
      const video = videoRef.current;
      if (busy || !video?.videoWidth || video.readyState < 2 || !context) return;
      busy = true;
      try {
        const scale = Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight));
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(pixels.data, pixels.width, pixels.height, { inversionAttempts: 'dontInvert' });
        if (code) await decodeRef.current(code.data);
      } catch (cause) {
        console.warn('Camera QR processing failed:', cause);
        stop();
        setError('Unable to process camera frames. Retry or use an image or manual entry.');
      } finally {
        busy = false;
      }
    }, 250);
    return () => clearInterval(interval);
  }, [status, stop]);

  return (
    <section aria-label="QR scanner" className="space-y-3 border border-neutral-300 rounded-lg p-3">
      <div className="relative aspect-square w-full max-w-[280px] mx-auto overflow-hidden border border-neutral-300 rounded">
        <video ref={videoRef} muted playsInline aria-label="Camera preview" className="h-full w-full object-cover" />
        {status !== 'active' && <p className="absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-neutral-900">{status === 'starting' ? 'Starting camera...' : 'Camera is inactive'}</p>}
      </div>
      {status === 'active' && cameras.length > 1 && (
        <button
          type="button"
          onClick={() => {
            const index = cameras.findIndex((camera) => camera.deviceId === activeCameraId);
            void start(cameras[(index + 1) % cameras.length].deviceId);
          }}
          className="min-h-11 w-full border border-neutral-300 hover:border-neutral-900 rounded px-3 py-2 flex items-center justify-center gap-1.5 text-xs font-semibold text-neutral-800 transition-colors"
        >
          <FlipHorizontal className="w-4 h-4" />
          <span>Switch Camera</span>
        </button>
      )}
      {error && (
        <div role="alert" className="text-sm text-neutral-900 break-words flex items-center gap-2 border border-neutral-300 p-2.5 rounded bg-white">
          <AlertCircle className="w-4 h-4 text-neutral-900 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}
      <button
        type="button"
        onClick={status === 'inactive' ? () => void start() : stop}
        className="w-full min-h-11 border border-neutral-900 hover:border-neutral-700 rounded px-3 py-2 font-semibold text-xs flex items-center justify-center gap-2 transition-colors"
      >
        {status === 'starting' ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Cancel camera request</span>
          </>
        ) : status === 'active' ? (
          <>
            <CameraOff className="w-4 h-4" />
            <span>Stop Camera</span>
          </>
        ) : (
          <>
            <Camera className="w-4 h-4" />
            <span>Start Camera Scanner</span>
          </>
        )}
      </button>
      {imageInput && (
        <>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            aria-label="Upload QR image"
            onChange={async (event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = '';
              if (!file) return;
              setReadingImage(true);
              setError(null);
              try { await decodeRef.current(await decodeQrImage(file)); }
              catch (cause) { setError(cause instanceof Error ? cause.message : 'Image could not be read. Use manual entry.'); }
              finally { setReadingImage(false); }
            }}
          />
          <button
            type="button"
            disabled={readingImage}
            onClick={() => fileRef.current?.click()}
            className="w-full min-h-11 border border-neutral-300 hover:border-neutral-900 rounded px-3 py-2 flex items-center justify-center gap-1.5 text-xs font-semibold text-neutral-800 transition-colors disabled:opacity-50"
          >
            {readingImage ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Reading QR image...</span>
              </>
            ) : (
              <>
                <ImageUp className="w-4 h-4" />
                <span>Scan QR Image</span>
              </>
            )}
          </button>
        </>
      )}
    </section>
  );
}
