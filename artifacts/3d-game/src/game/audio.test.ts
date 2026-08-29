import assert from 'node:assert/strict';
import type { GameSound, SoundPriority } from './audio';

type AudioOperation = {
  kind: 'oscillator-start' | 'oscillator-stop';
  at: number;
};

class FakeParam {
  setValueAtTime() {}
  exponentialRampToValueAtTime() {}
}

class FakeGainNode {
  gain = new FakeParam();

  connect() {}
}

class FakeOscillator {
  type: OscillatorType = 'sine';
  frequency = new FakeParam();

  constructor(private readonly operations: AudioOperation[]) {}

  connect() {}

  start(at: number) {
    this.operations.push({ kind: 'oscillator-start', at });
  }

  stop(at: number) {
    this.operations.push({ kind: 'oscillator-stop', at });
  }
}

class FakeAudioContext {
  static instances: FakeAudioContext[] = [];

  currentTime = 0;
  destination = {};
  operations: AudioOperation[] = [];
  state: AudioContextState;
  resumeCalls = 0;
  readonly resumeMode: 'running' | 'suspended' | 'reject' | 'throw';

  constructor(
    state: AudioContextState = 'suspended',
    resumeMode: 'running' | 'suspended' | 'reject' | 'throw' = 'running',
  ) {
    this.state = state;
    this.resumeMode = resumeMode;
    FakeAudioContext.instances.push(this);
  }

  createGain() {
    return new FakeGainNode();
  }

  createOscillator() {
    return new FakeOscillator(this.operations);
  }

  resume() {
    this.resumeCalls += 1;
    if (this.resumeMode === 'throw') {
      throw new Error('resume blocked');
    }
    if (this.resumeMode === 'reject') {
      return Promise.reject(new Error('resume blocked'));
    }
    if (this.resumeMode === 'running') {
      this.state = 'running';
    }
    return Promise.resolve();
  }
}

function installAudioWindow(AudioContextClass?: new () => FakeAudioContext) {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: AudioContextClass ? { AudioContext: AudioContextClass } : {},
  });
}

function countStarted(context: FakeAudioContext) {
  return context.operations.filter(({ kind }) => kind === 'oscillator-start').length;
}

function assertSchedulesCue(
  playGameSound: (sound: GameSound, priority?: SoundPriority) => void,
  context: FakeAudioContext,
  sound: GameSound,
  priority: SoundPriority,
  expectedTones: number,
) {
  const before = countStarted(context);
  playGameSound(sound, priority);
  assert.equal(
    countStarted(context) - before,
    expectedTones,
    `${sound} should schedule ${expectedTones} tone(s)`,
  );
}

const audioModule = await import('./audio?audio-cue-test');
const { playGameSound, unlockGameAudio } = audioModule;

installAudioWindow();
assert.doesNotThrow(() => playGameSound('arrival'));
assert.equal(FakeAudioContext.instances.length, 0, 'audio stays dormant before a gesture');

class RunningFakeAudioContext extends FakeAudioContext {
  constructor() {
    super('suspended', 'running');
  }
}

installAudioWindow(RunningFakeAudioContext);
unlockGameAudio();
const context = FakeAudioContext.instances.at(-1);
assert.ok(context, 'a supported audio context is created after unlock');
assert.equal(context.resumeCalls, 1);
assert.equal(context.state, 'running');

const cues: Array<[GameSound, SoundPriority, number]> = [
  ['arrival', 'ambient', 2],
  ['drawing', 'ambient', 2],
  ['play', 'ambient', 3],
  ['greeting', 'social', 2],
  ['juice-service', 'interaction', 3],
  ['interaction', 'interaction', 1],
  ['dialogue', 'dialogue', 2],
  ['tidy-place', 'interaction', 2],
];

for (const [sound, priority, expectedTones] of cues) {
  context.currentTime += 2;
  assertSchedulesCue(playGameSound, context, sound, priority, expectedTones);
}

const priorityModule = await import('./audio?audio-priority-test');

class PriorityFakeAudioContext extends FakeAudioContext {
  constructor() {
    super('suspended', 'running');
  }
}

installAudioWindow(PriorityFakeAudioContext);
priorityModule.unlockGameAudio();
const priorityContext = FakeAudioContext.instances.at(-1);
assert.ok(priorityContext);

priorityContext.currentTime = 1;
assertSchedulesCue(priorityModule.playGameSound, priorityContext, 'arrival', 'ambient', 2);

priorityContext.currentTime = 1.05;
const afterAmbient = countStarted(priorityContext);
priorityModule.playGameSound('drawing', 'ambient');
assert.equal(countStarted(priorityContext), afterAmbient, 'ambient cues are suppressed by an active ambient cue');

priorityContext.currentTime = 2;
assertSchedulesCue(priorityModule.playGameSound, priorityContext, 'interaction', 'interaction', 1);

priorityContext.currentTime = 2.05;
const afterInteraction = countStarted(priorityContext);
priorityModule.playGameSound('arrival', 'ambient');
assert.equal(countStarted(priorityContext), afterInteraction, 'interaction suppresses ambient during playback');

priorityContext.currentTime = 2.2;
assertSchedulesCue(priorityModule.playGameSound, priorityContext, 'arrival', 'ambient', 2);

priorityContext.currentTime = 3;
assertSchedulesCue(priorityModule.playGameSound, priorityContext, 'dialogue', 'dialogue', 2);

priorityContext.currentTime = 3.05;
const afterDialogue = countStarted(priorityContext);
priorityModule.playGameSound('drawing', 'ambient');
assert.equal(countStarted(priorityContext), afterDialogue, 'dialogue suppresses ambient during playback');

const unsupportedModule = await import('./audio?audio-unsupported-test');
installAudioWindow();
assert.doesNotThrow(() => {
  unsupportedModule.playGameSound('arrival');
  unsupportedModule.unlockGameAudio();
  unsupportedModule.playGameSound('dialogue', 'dialogue');
});
assert.equal(FakeAudioContext.instances.length, 2, 'unsupported audio does not construct a context');

const suspendedModule = await import('./audio?audio-suspended-test');

class SuspendedFakeAudioContext extends FakeAudioContext {
  constructor() {
    super('suspended', 'suspended');
  }
}

installAudioWindow(SuspendedFakeAudioContext);
assert.doesNotThrow(() => suspendedModule.unlockGameAudio());
const suspendedContext = FakeAudioContext.instances.at(-1);
assert.ok(suspendedContext);
assert.doesNotThrow(() => suspendedModule.playGameSound('arrival'));
assert.equal(countStarted(suspendedContext), 0, 'suspended audio does not schedule tones');

const rejectingModule = await import('./audio?audio-rejecting-test');

class RejectingFakeAudioContext extends FakeAudioContext {
  constructor() {
    super('suspended', 'reject');
  }
}

installAudioWindow(RejectingFakeAudioContext);
assert.doesNotThrow(() => rejectingModule.unlockGameAudio(), 'resume rejection is handled safely');

const throwingModule = await import('./audio?audio-throwing-test');

class ThrowingFakeAudioContext extends FakeAudioContext {
  constructor() {
    super('suspended', 'throw');
  }
}

installAudioWindow(ThrowingFakeAudioContext);
assert.doesNotThrow(() => throwingModule.unlockGameAudio(), 'synchronous resume failure is handled safely');

console.log('audio tests passed');