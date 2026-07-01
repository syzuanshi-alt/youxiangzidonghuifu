import { getMailRiskState } from './riskState.js';

export const WORKBENCH_SOUND_EFFECTS = {
  mail_received: [
    { frequency: 660, duration: 0.08, delay: 0 },
    { frequency: 880, duration: 0.1, delay: 0.09 },
  ],
  send_success: [
    { frequency: 523, duration: 0.08, delay: 0 },
    { frequency: 784, duration: 0.12, delay: 0.09 },
  ],
  archive_success: [
    { frequency: 440, duration: 0.07, delay: 0 },
    { frequency: 330, duration: 0.09, delay: 0.08 },
  ],
  action_failed: [
    { frequency: 220, duration: 0.12, delay: 0 },
    { frequency: 185, duration: 0.16, delay: 0.13 },
  ],
  high_risk: [
    { frequency: 740, duration: 0.08, delay: 0 },
    { frequency: 740, duration: 0.08, delay: 0.12 },
    { frequency: 392, duration: 0.12, delay: 0.24 },
  ],
};

export function normalizeSoundSettings(settings = {}) {
  return {
    enabled: settings.enabled === true,
  };
}

function mailSoundId(mail = {}) {
  return String(mail.id || mail.messageId || mail.message_id || '').trim();
}

function uniqueEffects(effects = []) {
  return [...new Set(effects.filter(Boolean))];
}

export function detectMailArrivalSoundEffects({
  previousIds = new Set(),
  currentMails = [],
  baselineReady = false,
} = {}) {
  if (!baselineReady) return [];

  const newMails = currentMails.filter((mail) => {
    const id = mailSoundId(mail);
    return id && !previousIds.has(id);
  });

  if (!newMails.length) return [];
  if (newMails.some((mail) => getMailRiskState(mail).urgent)) {
    return ['high_risk'];
  }
  return ['mail_received'];
}

export function soundEffectsForActionResult(result = {}) {
  if (!result.ok) return ['action_failed'];

  if (['send', 'auto_send', 'manual_send_after_approval'].includes(result.action)) {
    return ['send_success'];
  }

  if (['archive', 'auto_archive', 'manual_archive'].includes(result.action)) {
    return ['archive_success'];
  }

  return [];
}

export function soundEffectsForClosedLoopPayload(payload = {}) {
  if (!payload.ok) return ['action_failed'];

  const effects = [];
  for (const item of payload.items || []) {
    if (['failed', 'blocked'].includes(item.status)) {
      effects.push('action_failed');
    } else if (item.status === 'sent') {
      effects.push('send_success');
    } else if (item.status === 'archived') {
      effects.push('archive_success');
    }
  }

  return uniqueEffects(effects);
}

export function canPlayWorkbenchSound(settings = {}) {
  return normalizeSoundSettings(settings).enabled;
}

export function playWorkbenchSound(effectName, {
  settings = {},
  audioContext = null,
  audioContextFactory = null,
  volume = 0.045,
} = {}) {
  if (!canPlayWorkbenchSound(settings)) return false;

  const pattern = WORKBENCH_SOUND_EFFECTS[effectName];
  if (!pattern) return false;

  const AudioContextCtor = audioContextFactory
    || globalThis.AudioContext
    || globalThis.webkitAudioContext;
  if (!audioContext && !AudioContextCtor) return false;

  try {
    const context = audioContext || new AudioContextCtor();
    if (typeof context.resume === 'function') {
      Promise.resolve(context.resume()).catch(() => {});
    }

    const now = context.currentTime || 0;
    pattern.forEach((note) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const startAt = now + note.delay;
      const endAt = startAt + note.duration;

      oscillator.type = note.type || 'sine';
      oscillator.frequency.setValueAtTime(note.frequency, startAt);
      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.exponentialRampToValueAtTime(volume, startAt + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, endAt);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(startAt);
      oscillator.stop(endAt + 0.02);
    });

    return true;
  } catch {
    return false;
  }
}
