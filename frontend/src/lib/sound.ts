import logger from './logger'

// Simple sound synthesizer using Web Audio API
class SoundManager {
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;

  constructor() {
    try {
      // @ts-ignore - Handle vendor prefixes if necessary, though modern browsers support AudioContext
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      this.context = new AudioContextClass();
      this.masterGain = this.context.createGain();
      this.masterGain.gain.value = 0.3; // Default volume
      this.masterGain.connect(this.context.destination);
    } catch (e) {
      logger.error('Web Audio API not supported', e);
    }
  }

  private playTone(frequency: number, type: OscillatorType, duration: number) {
    if (!this.context || !this.masterGain) return;

    // Resume context if suspended (browser policy)
    if (this.context.state === 'suspended') {
      this.context.resume();
    }

    const osc = this.context.createOscillator();
    const gain = this.context.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(frequency, this.context.currentTime);

    gain.gain.setValueAtTime(this.masterGain.gain.value, this.context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.context.currentTime + duration);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start();
    osc.stop(this.context.currentTime + duration);
  }

  playPaddleHit() {
    this.playTone(440, 'square', 0.1); // A4
  }

  playWallHit() {
    this.playTone(220, 'square', 0.1); // A3
  }

  playScore() {
    this.playTone(880, 'sine', 0.3); // A5
    setTimeout(() => this.playTone(1760, 'sine', 0.3), 150); // A6
  }

  playGameOver() {
    if (!this.context) return;
    const now = this.context.currentTime;
    this.playTone(440, 'sawtooth', 0.5);
    setTimeout(() => this.playTone(330, 'sawtooth', 0.5), 400);
    setTimeout(() => this.playTone(220, 'sawtooth', 1.0), 800);
  }
}

export const soundManager = new SoundManager();
