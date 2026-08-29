import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function availablePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitForJson(url, attempts = 80) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
      lastError = new Error(`${response.status} ${response.statusText}`);
    } catch (error) {
      lastError = error;
    }
    await sleep(100);
  }
  throw lastError ?? new Error(`Timed out waiting for ${url}`);
}

class CdpClient {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.nextId = 1;
    this.pending = new Map();
    this.events = new Map();
  }

  async connect() {
    await new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const pending = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) pending?.reject(new Error(message.error.message));
        else pending?.resolve(message.result);
        return;
      }
      for (const listener of this.events.get(message.method) ?? []) listener(message.params);
    });
  }

  send(method, params = {}) {
    const id = this.nextId;
    this.nextId += 1;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  on(method, listener) {
    const listeners = this.events.get(method) ?? [];
    listeners.push(listener);
    this.events.set(method, listeners);
  }

  close() {
    this.socket.close();
  }
}

async function evaluate(client, expression) {
  const result = await client.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  }
  return result.result.value;
}

async function waitFor(client, expression, message, timeoutMs = 8000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await evaluate(client, expression)) return;
    await sleep(100);
  }
  throw new Error(`Timed out: ${message}`);
}

async function dispatchKey(client, type, code, key) {
  await client.send('Input.dispatchKeyEvent', {
    type,
    code,
    key,
    windowsVirtualKeyCode: key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0,
    nativeVirtualKeyCode: key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0,
  });
}

async function setViewport(client, width, height, mobile) {
  await client.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: mobile ? 2 : 1,
    mobile,
  });
  await sleep(180);
}

const domain = process.env.REPLIT_DEV_DOMAIN;
const targetUrl = process.env.DAYKARE_TEST_URL
  ?? (domain ? `https://${domain}/` : null);
if (!targetUrl) {
  throw new Error('Set DAYKARE_TEST_URL or REPLIT_DEV_DOMAIN before running browser checks.');
}

const port = await availablePort();
const profile = await mkdtemp(path.join(tmpdir(), 'daykare-chromium-'));
const chromium = spawn('chromium', [
  '--headless=new',
  '--no-sandbox',
  '--disable-dev-shm-usage',
  '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding',
  '--enable-unsafe-swiftshader',
  '--use-gl=angle',
  '--use-angle=swiftshader',
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });

let stderr = '';
chromium.stderr.on('data', (chunk) => {
  stderr += chunk.toString();
});

let client;
try {
  await waitForJson(`http://127.0.0.1:${port}/json/version`);
  const pageResponse = await fetch(
    `http://127.0.0.1:${port}/json/new?${encodeURIComponent(targetUrl)}`,
    { method: 'PUT' },
  );
  assert.equal(pageResponse.ok, true, `could not create Chromium target: ${pageResponse.status}`);
  const page = await pageResponse.json();
  client = new CdpClient(page.webSocketDebuggerUrl);
  await client.connect();
  const exceptions = [];
  const networkResources = [];
  client.on('Runtime.exceptionThrown', ({ exceptionDetails }) => {
    exceptions.push(exceptionDetails.exception?.description ?? exceptionDetails.text);
  });
  client.on('Network.responseReceived', ({ response }) => {
    networkResources.push(response.url);
  });
  await Promise.all([
    client.send('Runtime.enable'),
    client.send('Page.enable'),
    client.send('Network.enable'),
    client.send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true,
    }),
  ]);
  await client.send('Page.navigate', { url: targetUrl });
  await waitFor(client, 'document.readyState === "complete"', 'page load');
  await waitFor(client, 'Boolean(document.querySelector("canvas"))', '3D canvas mount');
  assert.equal(
    networkResources.some((url) => url.includes('Journal.tsx') || url.includes('/Journal-')),
    false,
    'Journal chunk is deferred until the Journal opens',
  );
  assert.equal(
    networkResources.some((url) => url.includes('Garden.tsx') || url.includes('/Garden-')),
    false,
    'Garden chunk is deferred until the Garden opens',
  );
  if (process.env.DAYKARE_CAPTURE_DIR) {
    await mkdir(process.env.DAYKARE_CAPTURE_DIR, { recursive: true });
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await sleep(1200);
    const desktop = await client.send('Page.captureScreenshot', { format: 'png' });
    await writeFile(path.join(process.env.DAYKARE_CAPTURE_DIR, 'daykare-swiftshader-desktop.png'), Buffer.from(desktop.data, 'base64'));
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true,
    });
    await sleep(800);
    const mobile = await client.send('Page.captureScreenshot', { format: 'png' });
    await writeFile(path.join(process.env.DAYKARE_CAPTURE_DIR, 'daykare-swiftshader-mobile.png'), Buffer.from(mobile.data, 'base64'));
  }

  const modulePath = JSON.stringify(new URL('src/game/store.ts', targetUrl).href);
  await evaluate(client, `(async () => {
    const { useGameStore } = await import(${modulePath});
    globalThis.__daykareStore = useGameStore;
    useGameStore.getState().setActiveDialogue({
      name: 'Browser Check',
      text: 'Choose a test option.',
      options: [{ label: 'Keep open', action: () => {} }],
    });
    return true;
  })()`);
  assert.equal(
    await evaluate(client, `Boolean(
      globalThis.__daykareStore.getState().activeDialogue?.options?.length
      && globalThis.__daykareStore.getState().activeDialogue?.name === 'Browser Check'
    )`),
    true,
    'dialogue state reaches the live game store',
  );
  await waitFor(client, 'Boolean(document.querySelector(".daykare-dialogue-cancel"))', 'mobile cancel control');
  assert.equal(
    await evaluate(client, 'document.querySelector(".daykare-dialogue-cancel")?.textContent?.includes("Cancel / Leave")'),
    true,
    'mobile option dialogue exposes Cancel / Leave',
  );
  await evaluate(client, 'document.querySelector(".daykare-dialogue-cancel").click()');
  await waitFor(client, 'globalThis.__daykareStore.getState().activeDialogue === null', 'dialogue cancellation');

  await evaluate(client, `(() => {
    globalThis.__daykareStore.getState().setTimeOfDay(14.25);
    return localStorage.getItem('daykare-save')?.includes('14.25') ?? false;
  })()`);
  await client.send('Page.reload', { ignoreCache: true });
  await waitFor(client, 'document.readyState === "complete"', 'reload');
  await evaluate(client, `(async () => {
    const { useGameStore } = await import(${modulePath});
    globalThis.__daykareStore = useGameStore;
    const started = performance.now();
    while (!useGameStore.persist.hasHydrated() && performance.now() - started < 5000) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    return true;
  })()`);
  assert.equal(
    await evaluate(client, 'globalThis.__daykareStore.getState().timeOfDay'),
    14.25,
    'local save rehydrates after a real page reload',
  );

  await evaluate(client, `(() => {
    const store = globalThis.__daykareStore;
    store.getState().setTimeOfDay(12.25);
    store.setState({
      teacherSuspicion: 37,
      waitingCustomers: ['Max', 'Noah'],
      juiceClubActiveCustomer: 'Max',
      juiceClubServedCustomer: null,
      juiceClubCustomerPhase: 'ordering',
    });
    return localStorage.getItem('daykare-save')?.includes('ordering') ?? false;
  })()`);
  await client.send('Page.reload', { ignoreCache: true });
  await waitFor(client, 'document.readyState === "complete"', 'active Juice Club reload');
  const rehydratedClub = await evaluate(client, `(async () => {
    const { useGameStore } = await import(${modulePath});
    globalThis.__daykareStore = useGameStore;
    const started = performance.now();
    while (!useGameStore.persist.hasHydrated() && performance.now() - started < 5000) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    const state = useGameStore.getState();
    return {
      timeOfDay: state.timeOfDay,
      schedule: state.schedule,
      teacherSuspicion: state.teacherSuspicion,
      waitingCustomers: state.waitingCustomers,
      activeCustomer: state.juiceClubActiveCustomer,
      servedCustomer: state.juiceClubServedCustomer,
      phase: state.juiceClubCustomerPhase,
    };
  })()`);
  assert.deepEqual(rehydratedClub, {
    timeOfDay: 12.25,
    schedule: 'juice-club',
    teacherSuspicion: 37,
    waitingCustomers: ['Max', 'Noah'],
    activeCustomer: 'Max',
    servedCustomer: null,
    phase: 'ordering',
  }, 'a valid in-progress Juice Club save keeps its exact lifecycle state');

  await evaluate(client, `(() => {
    globalThis.__daykareStore.setState({
      waitingCustomers: ['Noah'],
      juiceClubActiveCustomer: 'Max',
      juiceClubServedCustomer: 'Max',
      juiceClubCustomerPhase: 'service',
    });
    return true;
  })()`);
  await client.send('Page.reload', { ignoreCache: true });
  await waitFor(client, 'document.readyState === "complete"', 'served Juice Club reload');
  assert.deepEqual(
    await evaluate(client, `(async () => {
      const { useGameStore } = await import(${modulePath});
      globalThis.__daykareStore = useGameStore;
      const started = performance.now();
      while (!useGameStore.persist.hasHydrated() && performance.now() - started < 5000) {
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      const state = useGameStore.getState();
      return {
        waitingCustomers: state.waitingCustomers,
        activeCustomer: state.juiceClubActiveCustomer,
        servedCustomer: state.juiceClubServedCustomer,
        phase: state.juiceClubCustomerPhase,
      };
    })()`),
    {
      waitingCustomers: ['Noah'],
      activeCustomer: 'Max',
      servedCustomer: 'Max',
      phase: 'service',
    },
    'a served Juice Club customer resumes the drink-and-depart lifecycle safely',
  );

  await evaluate(client, `(() => {
    localStorage.setItem('daykare-save', JSON.stringify({
      version: 3,
      state: {
        quality: 'ultra',
        timeOfDay: 'noon',
        schedule: 'juice-club',
        inventory: ['forged-item'],
        friends: {
          Leo: { mood: 'furious', friendship: null, recentMemory: 'forged memory' },
          Ghost: { mood: 'happy', friendship: 100, recentMemory: 'boo' },
        },
        waitingCustomers: ['Ghost'],
        juiceClubActiveCustomer: 'Ghost',
        juiceClubServedCustomer: 'Ghost',
        juiceClubCustomerPhase: 'ordering',
        progression: {
          reputation: 0,
          tokens: -500,
          routeUnlocks: ['garden-district'],
          activityRuns: { forged: 99, 'garden-planting': 2 },
          activityRewards: { forged: 99, 'garden-planting': 999 },
        },
        zone: 'garden',
        playerPosition: [null, 0, 0],
        gardenActivityStep: 2,
        zoneTransitioning: true,
        pendingZone: 'garden',
      },
    }));
    return true;
  })()`);
  const reloadAndReadRepairedSave = async () => {
    await client.send('Page.reload', { ignoreCache: true });
    await waitFor(client, 'document.readyState === "complete"', 'corrupt-save reload');
    return evaluate(client, `(async () => {
      const { useGameStore } = await import(${modulePath});
      globalThis.__daykareStore = useGameStore;
      const started = performance.now();
      while (!useGameStore.persist.hasHydrated() && performance.now() - started < 5000) {
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      const state = useGameStore.getState();
      return {
        quality: state.quality,
        timeOfDay: state.timeOfDay,
        schedule: state.schedule,
        inventory: state.inventory,
        friendNames: Object.keys(state.friends),
        leo: state.friends.Leo,
        waitingCustomers: state.waitingCustomers,
        activeCustomer: state.juiceClubActiveCustomer,
        progression: state.progression,
        zone: state.zone,
        gardenActivityStep: state.gardenActivityStep,
        zoneTransitioning: state.zoneTransitioning,
        pendingZone: state.pendingZone,
      };
    })()`);
  };
  const repairedSave = await reloadAndReadRepairedSave();
  assert.deepEqual(repairedSave, {
    quality: 'high',
    timeOfDay: 9,
    schedule: 'morning-play',
    inventory: [],
    friendNames: ['Leo', 'Mia', 'Sam', 'Zoe', 'Eli', 'Noah', 'Lily', 'Finn', 'Ruby', 'Max'],
    leo: { mood: 'sad', friendship: 10, recentMemory: 'Lost his favorite toy.' },
    waitingCustomers: [],
    activeCustomer: null,
    progression: {
      version: 3,
      reputation: 0,
      tokens: 0,
      routeUnlocks: [],
      activityRuns: { 'garden-planting': 2 },
      activityRewards: { 'garden-planting': 4 },
      collectibleProgress: {},
      vehicleProgress: {},
      hubUpgrades: [],
      trustedHelperPass: false,
    },
    zone: 'hub',
    gardenActivityStep: 0,
    zoneTransitioning: false,
    pendingZone: null,
  }, 'a malformed browser save is rebuilt only from authored fields');
  assert.deepEqual(
    await reloadAndReadRepairedSave(),
    repairedSave,
    'repeated hydration of the same corrupt payload stays deterministic',
  );

  const waitForResource = async (fragment, message, timeoutMs = 8000) => {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (networkResources.some((url) => url.includes(fragment))) return;
      await sleep(100);
    }
    throw new Error(`Timed out: ${message}`);
  };

  const gameplayRegression = await evaluate(client, `(async () => {
    const sessions = await import(${JSON.stringify(new URL('src/game/activitySessions.ts', targetUrl).href)});
    const world = await import(${JSON.stringify(new URL('src/game/world.ts', targetUrl).href)});
    const npcs = await import(${JSON.stringify(new URL('src/game/NPCs.tsx', targetUrl).href)});
    const { Group, Vector3 } = await import(${JSON.stringify(new URL('node_modules/.vite/deps/three.js', targetUrl).href)});
    const session = sessions.getSharedActivitySession('hub', 'art-time', 1);
    const interruptedSession = sessions.getSharedActivitySession('hub', 'art-time', 1, true);
    const cameraTarget = new Vector3(0, 1, 0);
    const camera = world.resolveCameraPosition(cameraTarget, new Vector3(10, 1, -8.4));
    const artwork = world.getWorldSolidSurfaceTransform('main-south-wall', 'north', 1.72, 4.6);
    const npc = new Group();
    npc.position.set(6.8, 0, -3.4);
    const moved = npcs.stepNpc('browser-facing-check', npc, new Vector3(8.4, 0, -1.8), null, 1, 4, 'garden');

    const store = globalThis.__daykareStore;
    store.setState({
      schedule: 'juice-club',
      zone: 'hub',
      waitingCustomers: [],
      juiceClubActiveCustomer: null,
      juiceClubCustomerPhase: 'idle',
      juiceClubServedCustomer: null,
      juiceStock: 2,
      crackerStock: 2,
      juiceClubCustomersServed: 0,
      clubSupplies: 10,
    });
    store.getState().addWaitingCustomer('Max');
    store.getState().serveCustomer();
    const earlyServiceBlocked = store.getState().juiceClubCustomersServed === 0;
    store.getState().reportJuiceClubArrival('Max', 'entry');
    store.getState().reportJuiceClubArrival('Max', 'queue');
    const reachedOrdering = store.getState().juiceClubCustomerPhase === 'ordering';
    store.getState().serveCustomer();
    const rewardedAtService = store.getState().juiceClubCustomersServed === 1 && store.getState().juiceClubCustomerPhase === 'service';
    store.getState().reportJuiceClubArrival('Max', 'service');
    store.getState().advanceJuiceClubCustomer();
    store.getState().advanceJuiceClubCustomer();
    store.getState().reportJuiceClubArrival('Max', 'departure');
    const lifecycleCompleted = store.getState().juiceClubCustomerPhase === 'idle';

    return {
      sharedSlotsWalkable: session.participants.every((participant) =>
        world.isWalkable(new Vector3(...participant.slot), 0.34, [], 'hub')),
      interruptedSession: interruptedSession === null,
      cameraClear: world.isCameraPositionClear(camera),
      cameraSightlineClear: world.isCameraTransitionClear(cameraTarget, camera),
      artworkAnchored: artwork.position[2] === 7.66 && artwork.rotation[1] === Math.PI,
      npcMoved: moved && npc.position.distanceTo(new Vector3(6.8, 0, -3.4)) > 0.01,
      earlyServiceBlocked,
      reachedOrdering,
      rewardedAtService,
      lifecycleCompleted,
    };
  })()`);
  assert.deepEqual(gameplayRegression, {
    sharedSlotsWalkable: true,
    interruptedSession: true,
    cameraClear: true,
    cameraSightlineClear: true,
    artworkAnchored: true,
    npcMoved: true,
    earlyServiceBlocked: true,
    reachedOrdering: true,
    rewardedAtService: true,
    lifecycleCompleted: true,
  }, 'browser gameplay regressions pass against live Vite modules');

  const worldModulePath = JSON.stringify(new URL('src/game/world.ts', targetUrl).href);
  const touchModulePath = JSON.stringify(new URL('src/game/touchInput.ts', targetUrl).href);
  const cameraInputModulePath = JSON.stringify(new URL('src/game/cameraInput.ts', targetUrl).href);
  await setViewport(client, 960, 640, false);
  await evaluate(client, `(() => {
    globalThis.__daykareMovementProbeEnabled = true;
    const store = globalThis.__daykareStore;
    const state = store.getState();
    store.setState({
      activeDialogue: null,
      journalOpen: false,
      zone: 'hub',
      pendingZone: null,
      zoneTransitioning: false,
      isRiding: false,
      playerPosition: [6.55, 0, 0.75],
      teleportTrigger: state.teleportTrigger + 1,
    });
    return true;
  })()`);
  await waitFor(
    client,
    'Math.abs(globalThis.__daykareMovementProbe?.player?.[0] - 6.55) < 0.2',
    'player teleport before live input',
  );
  await evaluate(client, `(() => {
    globalThis.__daykareMovementSamples = [];
    globalThis.__daykareMovementSampling = true;
    const sample = () => {
      if (!globalThis.__daykareMovementSampling) return;
      const probe = globalThis.__daykareMovementProbe;
      if (probe && globalThis.__daykareMovementSamples.at(-1)?.updatedAt !== probe.updatedAt) {
        globalThis.__daykareMovementSamples.push(structuredClone(probe));
      }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
    return true;
  })()`);

  await dispatchKey(client, 'rawKeyDown', 'ShiftLeft', 'Shift');
  await dispatchKey(client, 'rawKeyDown', 'KeyD', 'd');
  await dispatchKey(client, 'rawKeyDown', 'KeyW', 'w');
  await sleep(650);
  await dispatchKey(client, 'keyUp', 'KeyW', 'w');
  await dispatchKey(client, 'keyUp', 'KeyD', 'd');
  await dispatchKey(client, 'keyUp', 'ShiftLeft', 'Shift');
  const crossedPortalX = await evaluate(client, 'globalThis.__daykareMovementProbe.player[0]');
  assert.ok(crossedPortalX > 8.15, `real diagonal keyboard run crosses the east portal: ${crossedPortalX}`);

  await dispatchKey(client, 'rawKeyDown', 'ShiftLeft', 'Shift');
  await dispatchKey(client, 'rawKeyDown', 'KeyA', 'a');
  await dispatchKey(client, 'rawKeyDown', 'KeyS', 's');
  await sleep(650);
  await dispatchKey(client, 'keyUp', 'KeyS', 's');
  await dispatchKey(client, 'keyUp', 'KeyA', 'a');
  await dispatchKey(client, 'keyUp', 'ShiftLeft', 'Shift');
  const reversedPortalX = await evaluate(client, 'globalThis.__daykareMovementProbe.player[0]');
  assert.ok(reversedPortalX < crossedPortalX - 1, 'rapid diagonal reversal moves back through the opening');

  const canvasPoint = await evaluate(client, `(() => {
    const rect = document.querySelector('canvas').getBoundingClientRect();
    return { x: rect.left + rect.width * 0.55, y: rect.top + rect.height * 0.45 };
  })()`);
  const orbitBefore = await evaluate(client, `(async () => {
    const cameraInput = await import(${cameraInputModulePath});
    return { ...cameraInput.getCameraInput() };
  })()`);
  await client.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: canvasPoint.x,
    y: canvasPoint.y,
    button: 'left',
    buttons: 1,
    clickCount: 1,
  });
  await client.send('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: canvasPoint.x + 96,
    y: canvasPoint.y + 28,
    button: 'none',
    buttons: 1,
  });
  await client.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: canvasPoint.x + 96,
    y: canvasPoint.y + 28,
    button: 'left',
    buttons: 0,
    clickCount: 1,
  });
  const orbitAfter = await evaluate(client, `(async () => {
    const cameraInput = await import(${cameraInputModulePath});
    return { ...cameraInput.getCameraInput() };
  })()`);
  assert.ok(Math.abs(orbitAfter.yaw - orbitBefore.yaw) > 0.4, 'real mouse drag orbits the camera');
  await dispatchKey(client, 'rawKeyDown', 'KeyR', 'r');
  await dispatchKey(client, 'keyUp', 'KeyR', 'r');
  await sleep(360);
  assert.equal(
    await evaluate(client, `(async () => {
      const cameraInput = await import(${cameraInputModulePath});
      const input = cameraInput.getCameraInput();
      return Math.abs(input.yaw) < 1e-6 && Math.abs(input.pitch - 0.22) < 1e-6;
    })()`),
    true,
    'keyboard recenter clears live orbit state',
  );
  await evaluate(client, 'globalThis.__daykareMovementSampling = false');
  const liveMovement = await evaluate(client, `(async () => {
    const world = await import(${worldModulePath});
    const { Vector3 } = await import(${JSON.stringify(new URL('node_modules/.vite/deps/three.js', targetUrl).href)});
    const samples = globalThis.__daykareMovementSamples;
    let maxPlayerStep = 0;
    let maxCameraStep = 0;
    let maxPlayerSpeed = 0;
    let maxCameraSpeed = 0;
    let maxOccludedFrames = 0;
    let occludedFrames = 0;
    let sideSwitches = 0;
    for (let index = 0; index < samples.length; index += 1) {
      const sample = samples[index];
      const player = new Vector3(...sample.player);
      const camera = new Vector3(...sample.camera);
      const target = new Vector3(...sample.cameraTarget);
      if (!world.isWalkable(player, world.PLAYER_RADIUS, [], sample.zone)) {
        return { valid: false, reason: 'player left walkable space', sample };
      }
      if (!world.isCameraPositionClear(camera, 0.2, sample.zone)) {
        return { valid: false, reason: 'camera body intersected a blocker', sample };
      }
      const sightlineClear = world.isCameraTransitionClear(target, camera, 0.2, sample.zone);
      occludedFrames = sightlineClear ? 0 : occludedFrames + 1;
      maxOccludedFrames = Math.max(maxOccludedFrames, occludedFrames);
      if (index > 0) {
        const previous = samples[index - 1];
        const elapsedSeconds = Math.max((sample.updatedAt - previous.updatedAt) / 1000, 0.001);
        const playerStep = player.distanceTo(new Vector3(...previous.player));
        const cameraStep = camera.distanceTo(new Vector3(...previous.camera));
        maxPlayerStep = Math.max(maxPlayerStep, playerStep);
        maxCameraStep = Math.max(maxCameraStep, cameraStep);
        maxPlayerSpeed = Math.max(maxPlayerSpeed, playerStep / elapsedSeconds);
        maxCameraSpeed = Math.max(maxCameraSpeed, cameraStep / elapsedSeconds);
        if (sample.cameraSide !== previous.cameraSide) sideSwitches += 1;
      }
    }
    return {
      valid: true,
      count: samples.length,
      elapsedMs: samples.at(-1).updatedAt - samples[0].updatedAt,
      maxPlayerStep,
      maxCameraStep,
      maxPlayerSpeed,
      maxCameraSpeed,
      maxOccludedFrames,
      sideSwitches,
    };
  })()`);
  assert.equal(liveMovement.valid, true, liveMovement.reason ?? 'live movement remains valid');
  assert.ok(liveMovement.count >= 6, `live movement captures repeated frame samples: ${liveMovement.count}`);
  assert.ok(liveMovement.elapsedMs >= 1500, `live movement sampling is sustained over time: ${liveMovement.elapsedMs}ms`);
  assert.ok(liveMovement.maxPlayerSpeed < 10, `live player movement has no one-frame jump: ${liveMovement.maxPlayerSpeed}`);
  assert.ok(liveMovement.maxCameraSpeed < 22, `live camera movement has no one-frame jump: ${liveMovement.maxCameraSpeed}`);
  assert.ok(liveMovement.maxOccludedFrames < 90, 'live camera recovers from obstruction within a bounded interval');
  assert.ok(liveMovement.sideSwitches < 18, 'live camera side switching remains bounded');

  for (const viewport of [
    { width: 390, height: 844, label: 'portrait' },
    { width: 320, height: 568, label: 'compact portrait' },
    { width: 844, height: 390, label: 'landscape' },
  ]) {
    await setViewport(client, viewport.width, viewport.height, true);
    const controlLayout = await evaluate(client, `(() => {
      const visual = window.visualViewport ?? {
        offsetLeft: 0,
        offsetTop: 0,
        width: window.innerWidth,
        height: window.innerHeight,
      };
      const selectors = [
        '.daykare-touch-pad',
        '.daykare-touch-movement',
        '.daykare-touch-look',
        '.daykare-touch-recenter',
      ];
      return {
        metrics: {
          innerWidth: window.innerWidth,
          innerHeight: window.innerHeight,
          clientWidth: document.documentElement.clientWidth,
          clientHeight: document.documentElement.clientHeight,
          shell: (() => {
            const rect = document.querySelector('.daykare-app-shell')?.getBoundingClientRect();
            return rect ? { top: rect.top, bottom: rect.bottom, height: rect.height } : null;
          })(),
          overlay: (() => {
            const rect = document.querySelector('.daykare-touch-ui')?.getBoundingClientRect();
            return rect ? { top: rect.top, bottom: rect.bottom, height: rect.height } : null;
          })(),
        },
        visual: {
          left: visual.offsetLeft,
          top: visual.offsetTop,
          right: visual.offsetLeft + visual.width,
          bottom: visual.offsetTop + visual.height,
        },
        controls: selectors.map((selector) => {
          const element = document.querySelector(selector);
          if (!element) return { selector, missing: true };
          const rect = element.getBoundingClientRect();
          return {
            selector,
            left: rect.left,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
          };
        }),
      };
    })()`);
    for (const control of controlLayout.controls) {
      assert.equal(control.missing, undefined, `${viewport.label} renders ${control.selector}`);
      assert.ok(control.left >= controlLayout.visual.left - 1, `${viewport.label} keeps ${control.selector} inside the left edge`);
      assert.ok(control.top >= controlLayout.visual.top - 1, `${viewport.label} keeps ${control.selector} inside the top edge`);
      assert.ok(control.right <= controlLayout.visual.right + 1, `${viewport.label} keeps ${control.selector} inside the right edge`);
      assert.ok(
        control.bottom <= controlLayout.visual.bottom + 1,
        `${viewport.label} keeps ${control.selector} inside the bottom edge: ${JSON.stringify({ control, layout: controlLayout })}`,
      );
    }
  }

  await setViewport(client, 390, 844, true);
  const padPoint = await evaluate(client, `(() => {
    const rect = document.querySelector('.daykare-touch-pad').getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  })()`);
  const lookPoint = await evaluate(client, `(() => {
    const rect = document.querySelector('.daykare-touch-look').getBoundingClientRect();
    return { x: rect.left + rect.width * 0.6, y: rect.top + rect.height * 0.55 };
  })()`);
  const touchStartPosition = await evaluate(client, 'globalThis.__daykareMovementProbe.player');
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: padPoint.x, y: padPoint.y, id: 11, radiusX: 8, radiusY: 8 }],
  });
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: padPoint.x + 34, y: padPoint.y - 52, id: 11, radiusX: 8, radiusY: 8 }],
  });
  const touchOrbitBefore = await evaluate(client, `(async () => {
    const cameraInput = await import(${cameraInputModulePath});
    return { ...cameraInput.getCameraInput() };
  })()`);
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      { x: padPoint.x + 34, y: padPoint.y - 52, id: 11, radiusX: 8, radiusY: 8 },
      { x: lookPoint.x, y: lookPoint.y, id: 21, radiusX: 8, radiusY: 8 },
    ],
  });
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [
      { x: padPoint.x + 34, y: padPoint.y - 52, id: 11, radiusX: 8, radiusY: 8 },
      { x: lookPoint.x + 62, y: lookPoint.y + 24, id: 21, radiusX: 8, radiusY: 8 },
    ],
  });
  await sleep(500);
  const touchDuringMove = await evaluate(client, `(async () => {
    const touch = await import(${touchModulePath});
    const cameraInput = await import(${cameraInputModulePath});
    return {
      movement: { ...touch.getTouchInput() },
      orbit: { ...cameraInput.getCameraInput() },
    };
  })()`);
  assert.ok(Math.hypot(touchDuringMove.movement.x, touchDuringMove.movement.y) > 0.5, 'real touch drag owns and drives the movement pad');
  assert.ok(
    Math.abs(touchDuringMove.orbit.yaw - touchOrbitBefore.yaw) > 0.25,
    'a second real touch pointer orbits while the movement pointer remains owned',
  );
  assert.ok(
    await evaluate(client, `Math.hypot(
      globalThis.__daykareMovementProbe.player[0] - ${touchStartPosition[0]},
      globalThis.__daykareMovementProbe.player[2] - ${touchStartPosition[2]}
    ) > 0.5`),
    'real touch input moves the live player',
  );
  await evaluate(client, 'document.querySelector(".daykare-touch-recenter").click()');
  const recenteredDuringMove = await evaluate(client, `(async () => {
    const touch = await import(${touchModulePath});
    const cameraInput = await import(${cameraInputModulePath});
    return {
      movement: { ...touch.getTouchInput() },
      orbit: { ...cameraInput.getCameraInput() },
    };
  })()`);
  assert.ok(Math.hypot(recenteredDuringMove.movement.x, recenteredDuringMove.movement.y) > 0.5, 'recenter does not steal the movement pointer');
  assert.equal(recenteredDuringMove.orbit.yaw, 0, 'recenter clears touch orbit while movement continues');
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [
      { x: padPoint.x + 34, y: padPoint.y - 52, id: 11, radiusX: 8, radiusY: 8 },
      { x: lookPoint.x + 88, y: lookPoint.y + 18, id: 21, radiusX: 8, radiusY: 8 },
    ],
  });
  assert.ok(
    await evaluate(client, `(async () => {
      const touch = await import(${touchModulePath});
      const cameraInput = await import(${cameraInputModulePath});
      return Math.hypot(touch.getTouchInput().x, touch.getTouchInput().y) > 0.5
        && Math.abs(cameraInput.getCameraInput().yaw) > 0.1;
    })()`),
    'look resumes after recenter without stealing movement ownership',
  );
  await client.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  assert.deepEqual(
    await evaluate(client, `(async () => {
      const touch = await import(${touchModulePath});
      return { ...touch.getTouchInput() };
    })()`),
    { x: 0, y: 0, run: false, crouch: false },
    'touch cancellation releases pointer ownership and resets every movement mode',
  );

  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: padPoint.x, y: padPoint.y, id: 12, radiusX: 8, radiusY: 8 }],
  });
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: padPoint.x - 45, y: padPoint.y, id: 12, radiusX: 8, radiusY: 8 }],
  });
  await evaluate(client, 'window.dispatchEvent(new Event("blur"))');
  assert.deepEqual(
    await evaluate(client, `(async () => {
      const touch = await import(${touchModulePath});
      return { input: { ...touch.getTouchInput() }, knob: document.querySelector('.daykare-touch-knob')?.style.transform };
    })()`),
    { input: { x: 0, y: 0, run: false, crouch: false }, knob: 'translate(0px, 0px)' },
    'window blur releases touch state and recenters the movement knob',
  );
  await client.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });

  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: padPoint.x, y: padPoint.y, id: 13, radiusX: 8, radiusY: 8 }],
  });
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: padPoint.x, y: padPoint.y - 48, id: 13, radiusX: 8, radiusY: 8 }],
  });
  await evaluate(client, `globalThis.__daykareStore.getState().setActiveDialogue({
    name: 'Movement cancellation',
    text: 'Stop touch movement.',
  })`);
  await waitFor(client, '!document.querySelector(".daykare-touch-pad")', 'touch controls hide during dialogue');
  assert.deepEqual(
    await evaluate(client, `(async () => {
      const touch = await import(${touchModulePath});
      return { ...touch.getTouchInput() };
    })()`),
    { x: 0, y: 0, run: false, crouch: false },
    'dialogue cancellation resets touch input',
  );
  await client.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await evaluate(client, 'globalThis.__daykareStore.getState().setActiveDialogue(null)');
  await waitFor(client, 'Boolean(document.querySelector(".daykare-touch-pad"))', 'touch controls remount after dialogue');
  assert.deepEqual(
    await evaluate(client, `(async () => {
      const touch = await import(${touchModulePath});
      return { input: { ...touch.getTouchInput() }, knob: document.querySelector('.daykare-touch-knob')?.style.transform };
    })()`),
    { input: { x: 0, y: 0, run: false, crouch: false }, knob: 'translate(0px, 0px)' },
    'remounted touch controls start centered and inactive',
  );
  await evaluate(client, `(() => {
    globalThis.__daykareMovementProbeEnabled = false;
    delete globalThis.__daykareMovementProbe;
    delete globalThis.__daykareMovementSamples;
    return true;
  })()`);

  assert.deepEqual(
    await evaluate(client, `(async () => {
      const navigation = await import(${JSON.stringify(new URL('src/game/navigation.ts', targetUrl).href)});
      const { Vector3 } = await import(${JSON.stringify(new URL('node_modules/.vite/deps/three.js', targetUrl).href)});
      navigation.clearNpcNavigation();
      for (let index = 0; index < 3; index += 1) {
        const position = new Vector3(index, 0, 0);
        const unregister = navigation.registerNpcPosition('browser-remount', position);
        navigation.getNavigationTarget('browser-remount', position, position.clone().addScalar(1));
        unregister();
      }
      return navigation.getNpcNavigationSnapshot();
    })()`),
    { positionCount: 0, pathCount: 0 },
    'repeated browser remount cleanup leaves no navigation registrations',
  );

  await client.send('Page.reload', { ignoreCache: false });
  await waitFor(client, 'document.readyState === "complete"', 'clean performance reload');
  await waitFor(client, 'Boolean(document.querySelector("canvas"))', 'canvas remount before performance sample');
  await evaluate(client, `(async () => {
    const { useGameStore } = await import(${modulePath});
    globalThis.__daykareStore = useGameStore;
    const started = performance.now();
    while (!useGameStore.persist.hasHydrated() && performance.now() - started < 5000) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    useGameStore.getState().setQuality('low');
    return true;
  })()`);
  await sleep(1200);
  await waitFor(
    client,
    'globalThis.__daykarePerformanceProbe?.sampleCount >= 20',
    'in-scene performance telemetry sample',
  );
  const performanceSample = await evaluate(client, 'structuredClone(globalThis.__daykarePerformanceProbe)');
  assert.ok(performanceSample.p95FrameMs >= performanceSample.p50FrameMs, 'performance probe reports ordered frame-time percentiles');
  assert.ok(Number.isFinite(performanceSample.droppedFrames), 'performance probe reports dropped frame budgets');
  assert.ok(performanceSample.devicePixelRatio > 0, 'performance probe reports the renderer DPR');
  assert.ok(performanceSample.renderCalls >= 0 && performanceSample.triangles >= 0, 'performance probe reports render workload');
  assert.equal(performanceSample.zone, 'hub', 'performance probe includes relevant live scene state');
  const softwareRenderer = /swiftshader|llvmpipe|software/i.test(performanceSample.renderer);
  const minimumFps = softwareRenderer ? 5 : 12;
  assert.ok(
    performanceSample.fps >= minimumFps,
    `mobile frame sample is below the ${minimumFps}fps ${softwareRenderer ? 'software' : 'hardware'} budget: ${performanceSample.fps.toFixed(1)}fps`,
  );

  await evaluate(client, 'globalThis.__daykareStore.getState().toggleJournal()');
  await waitFor(client, 'Boolean(document.querySelector(".daykare-journal-shell"))', 'lazy Journal overlay');
  await waitForResource(
    'Journal.tsx',
    'Journal module loads when the Journal opens',
  );
  await evaluate(client, 'globalThis.__daykareStore.getState().toggleJournal()');
  await waitFor(client, 'globalThis.__daykareStore.getState().journalOpen === false', 'Journal closes');

  await evaluate(client, 'globalThis.__daykareStore.setState({ zone: "garden" })');
  await waitForResource(
    'Garden.tsx',
    'Garden module loads when the Garden opens',
  );
  await evaluate(client, 'globalThis.__daykareStore.setState({ zone: "hub" })');

  assert.equal(
    exceptions.filter((message) => !message.includes('WebGL')).length,
    0,
    `unexpected browser exceptions: ${exceptions.join('\n')}`,
  );
  console.log(`DayKare browser checks passed (${performanceSample.fps.toFixed(1)}fps, p95 ${performanceSample.p95FrameMs.toFixed(1)}ms, ${performanceSample.renderer})`);
} finally {
  client?.close();
  chromium.kill('SIGTERM');
  await sleep(150);
  if (!chromium.killed) chromium.kill('SIGKILL');
  await rm(profile, { recursive: true, force: true });
  if (chromium.exitCode && chromium.exitCode !== 0) {
    process.stderr.write(stderr.slice(-2000));
  }
}