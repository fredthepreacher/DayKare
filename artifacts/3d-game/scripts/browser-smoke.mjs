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

  await evaluate(client, 'globalThis.__daykareStore.getState().setQuality("low")');
  const performanceSample = await evaluate(client, `(async () => {
    const probe = document.createElement('canvas');
    const gl = probe.getContext('webgl');
    const rendererInfo = gl?.getExtension('WEBGL_debug_renderer_info');
    const renderer = rendererInfo ? gl.getParameter(rendererInfo.UNMASKED_RENDERER_WEBGL) : 'unknown';
    const frames = [];
    await new Promise((resolve) => {
      const tick = (time) => {
        frames.push(time);
        if (frames.length >= 45) resolve();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const elapsed = frames.at(-1) - frames[0];
    return { fps: 1000 * (frames.length - 1) / Math.max(elapsed, 1), renderer };
  })()`);
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
  console.log(`DayKare browser checks passed (${performanceSample.fps.toFixed(1)}fps, ${performanceSample.renderer})`);
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