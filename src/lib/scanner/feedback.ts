/**
 * Multi-sensory scanner feedback utility.
 * Synthesizes acoustic tones via HTML5 Web Audio API and triggers hardware haptic
 * vibration pulses across handheld mobile scanner interfaces.
 */

/**
 * Safely resolves standard or vendor-prefixed Web Audio API context constructor.
 */
function resolveAudioContextConstructor(): typeof AudioContext | undefined {

  if (typeof window === "undefined") {
    return undefined;
  }

  if (typeof AudioContext !== "undefined") {
    return AudioContext;
  }

  const browserWindow = window as Window & {
    webkitAudioContext?: typeof AudioContext;
  };

  return browserWindow.webkitAudioContext;
}

/**
 * Plays synthesized acoustic feedback for scan events.
 * Success: High pleasant dual-tone chime (880Hz to 1174Hz).
 * Failure: Low rejection buzz with sawtooth waveform (220Hz).
 * Closes the AudioContext upon completion to prevent audio graph leaks.
 */
export function playAudioFeedback(isSuccess: boolean): void {

  const AudioContextClass = resolveAudioContextConstructor();
  if (!AudioContextClass) {
    return;
  }

  try {
    const audioContext = new AudioContextClass();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    if (isSuccess) {
      // Pleasant high dual-tone chime
      oscillator.frequency.setValueAtTime(880, audioContext.currentTime);
      oscillator.frequency.setValueAtTime(1174, audioContext.currentTime + 0.08);
      gainNode.gain.setValueAtTime(0.15, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.25);
      oscillator.start();
      oscillator.stop(audioContext.currentTime + 0.25);
    } else {
      // Rejection alert tone
      oscillator.type = "sawtooth";
      oscillator.frequency.setValueAtTime(220, audioContext.currentTime);
      gainNode.gain.setValueAtTime(0.18, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.35);
      oscillator.start();
      oscillator.stop(audioContext.currentTime + 0.35);
    }

    oscillator.onended = () => {
      void audioContext.close();
    };
  } catch (error) {
    console.warn("Audio feedback initialization error:", error);
  }
}

/**
 * Triggers hardware haptic vibration feedback on compatible mobile devices.
 * Success: Single short tactile pulse (80ms).
 * Failure: Distinct triple-pulse pattern ([120ms, 80ms, 120ms]).
 */
export function triggerHapticFeedback(isSuccess: boolean): void {

  if (typeof window !== "undefined" && "vibrate" in navigator) {
    try {
      if (isSuccess) {
        navigator.vibrate([80]);
      } else {
        navigator.vibrate([120, 80, 120]);
      }
    } catch (error) {
      console.warn("Haptic vibration error:", error);
    }
  }
}

/**
 * Backwards-compatible alias for existing scanner callers.
 */
export const triggerHaptic = triggerHapticFeedback;

/**
 * Concurrently triggers acoustic and haptic feedback for a scan outcome.
 */
export function triggerMultiSensoryFeedback(isSuccess: boolean): void {

  playAudioFeedback(isSuccess);
  triggerHapticFeedback(isSuccess);
}
