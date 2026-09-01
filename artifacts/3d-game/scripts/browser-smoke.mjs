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
  await Promise.all([
    client.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: mobile ? 2 : 1,
      mobile,
    }),
    client.send('Emulation.setTouchEmulationEnabled', {
      enabled: mobile,
      maxTouchPoints: mobile ? 5 : 1,
    }),
  ]);
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

  await waitFor(client, 'Boolean(document.querySelector("[data-testid=button-story]"))', 'front-end menu');
  assert.equal(
    await evaluate(client, 'document.querySelector("[data-testid=status-online-players]")?.textContent?.includes("20 players") === true'),
    true,
    'Multiplayer menu truthfully advertises the configured room capacity',
  );
  await evaluate(client, 'document.querySelector("[data-testid=button-online]")?.click()');
  await waitFor(client, 'Boolean(document.querySelector("[data-testid=overlay-online-lobby]"))', 'Online preview lobby');
  assert.equal(
    await evaluate(client, 'document.querySelector("[data-testid=status-networking]")?.textContent?.includes("not configured") === true'),
    true,
    'Multiplayer lobby truthfully reports missing local service credentials',
  );
  assert.equal(
    await evaluate(client, 'document.querySelector("[data-testid=button-join-multiplayer]")?.disabled === true'),
    true,
    'the room cannot fake a connection while its service is unconfigured',
  );
  await evaluate(client, 'document.querySelector("[data-testid=button-online-back]")?.click()');
  await waitFor(client, 'Boolean(document.querySelector("[data-testid=button-story]"))', 'return to front-end menu');
  await evaluate(client, 'document.querySelector("[data-testid=button-story]")?.click()');
  await waitFor(client, '!document.querySelector("[data-testid=overlay-game-menu]")', 'Story Mode resume');

  const modulePath = JSON.stringify(new URL('src/game/store.ts', targetUrl).href);
  await evaluate(client, `(async () => {
    const { useGameStore } = await import(${modulePath});
    globalThis.__daykareStore = useGameStore;
    const focusSource = document.createElement('button');
    focusSource.id = 'browser-dialogue-focus-source';
    focusSource.textContent = 'Dialogue focus source';
    document.body.append(focusSource);
    focusSource.focus();
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
  await waitFor(
    client,
    'document.activeElement?.textContent?.includes("Keep open")',
    'dialogue focuses its first action',
  );
  assert.deepEqual(
    await evaluate(client, `(() => {
      const dialogue = document.querySelector('.daykare-dialogue');
      return {
        role: dialogue?.getAttribute('role'),
        modal: dialogue?.getAttribute('aria-modal'),
        label: dialogue?.getAttribute('aria-label'),
      };
    })()`),
    { role: 'dialog', modal: 'true', label: 'Browser Check dialogue' },
    'dialogue exposes modal semantics and an accessible name',
  );
  assert.equal(
    await evaluate(client, 'document.querySelector(".daykare-dialogue-cancel")?.textContent?.includes("Cancel / Leave")'),
    true,
    'mobile option dialogue exposes Cancel / Leave',
  );
  assert.equal(
    await evaluate(client, `(() => {
      const cancel = document.querySelector('.daykare-dialogue-cancel');
      cancel.focus();
      cancel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
      const wrappedForward = document.activeElement?.textContent?.includes('Keep open') === true;
      document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }));
      return wrappedForward && document.activeElement === cancel;
    })()`),
    true,
    'dialogue traps forward and reverse keyboard focus',
  );
  await evaluate(client, `document.activeElement.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
  )`);
  await waitFor(client, 'globalThis.__daykareStore.getState().activeDialogue === null', 'Escape closes dialogue');
  await waitFor(
    client,
    'document.activeElement?.id === "browser-dialogue-focus-source"',
    'dialogue restores prior focus',
  );
  await evaluate(client, 'document.querySelector("#browser-dialogue-focus-source")?.remove()');

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
  assert.equal(
    await evaluate(client, `localStorage.getItem('daykare-save')?.includes('storageWarning') ?? false`),
    false,
    'session-only storage warnings are excluded from the save payload',
  );
  await evaluate(client, `(() => {
    const originalSetItem = Storage.prototype.setItem;
    try {
      Storage.prototype.setItem = function setItemFailure() {
        throw new DOMException('Storage blocked for browser check', 'SecurityError');
      };
      globalThis.__daykareStore.getState().setTimeOfDay(13.75);
    } finally {
      Storage.prototype.setItem = originalSetItem;
    }
  })()`);
  await waitFor(
    client,
    'Boolean(document.querySelector(".daykare-save-warning"))',
    'save-unavailable warning',
  );
  assert.equal(
    await evaluate(client, `document.querySelector('.daykare-save-warning')?.textContent?.includes(
      'progress will not be saved'
    )`),
    true,
    'a localStorage write failure produces a clear non-fatal warning',
  );
  await evaluate(client, `globalThis.__daykareStore.setState({ storageWarning: false })`);

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
      version: 4,
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
    friendNames: ['Leo', 'Mia', 'Sam', 'Zoe', 'Eli', 'Noah', 'Lily', 'Finn', 'Ruby', 'Max', 'Mae'],
    leo: { mood: 'sad', friendship: 10, recentMemory: 'Lost his favorite toy.' },
    waitingCustomers: [],
    activeCustomer: null,
    progression: {
      version: 4,
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

  await evaluate(client, `(() => {
    const store = globalThis.__daykareStore;
    store.getState().resetGame();
    store.getState().advanceQuestObjective('where-binky', 'talk-to-leo');
    store.getState().advanceQuestObjective('where-binky', 'ask-mia');
    const legacy = JSON.parse(localStorage.getItem('daykare-save'));
    legacy.version = 3;
    legacy.state.collectibles = ['Shiny Rock'];
    legacy.state.progression = {
      ...legacy.state.progression,
      version: 3,
      collectibleProgress: {},
    };
    localStorage.setItem('daykare-save', JSON.stringify(legacy));
    return true;
  })()`);
  await client.send('Page.reload', { ignoreCache: true });
  await waitFor(client, 'document.readyState === "complete"', 'legacy Shiny Rock reload');
  const migratedLegacyRock = await evaluate(client, `(async () => {
    const { useGameStore } = await import(${modulePath});
    const interactables = await import(${JSON.stringify(new URL('src/game/Interactables.tsx', targetUrl).href)});
    globalThis.__daykareStore = useGameStore;
    const started = performance.now();
    while (!useGameStore.persist.hasHydrated() && performance.now() - started < 5000) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    const state = useGameStore.getState();
    return {
      collectibles: state.collectibles,
      objective: state.quests['where-binky'].currentObjectiveId,
      pickupCount: state.progression.collectibleProgress['Shiny Rock'] ?? 0,
      worldVisible: interactables.shouldSpawnShinyRock(state.quests, state.collectibles, state.zone),
      saveVersion: JSON.parse(localStorage.getItem('daykare-save')).version,
    };
  })()`);
  assert.deepEqual(migratedLegacyRock, {
    collectibles: [],
    objective: 'trade-with-sam',
    pickupCount: 0,
    worldVisible: true,
    saveVersion: 4,
  }, 'a legacy pre-granted rock is removed and replaced by the visible world pickup');

  const shinyRockPickup = await evaluate(client, `(async () => {
    const store = globalThis.__daykareStore;
    const interactables = await import(${JSON.stringify(new URL('src/game/Interactables.tsx', targetUrl).href)});
    const world = await import(${JSON.stringify(new URL('src/game/world.ts', targetUrl).href)});
    const { Vector3 } = await import(${JSON.stringify(new URL('node_modules/.vite/deps/three.js', targetUrl).href)});
    store.getState().resetGame();
    store.getState().advanceQuestObjective('where-binky', 'talk-to-leo');
    store.getState().advanceQuestObjective('where-binky', 'ask-mia');
    const before = store.getState();
    const worldVisible = interactables.shouldSpawnShinyRock(before.quests, before.collectibles, before.zone);
    const spawnWalkable = world.isWalkable(new Vector3(...world.SHINY_ROCK_SPAWN), 0.34, [], 'hub');
    const collected = store.getState().collectShinyRock();
    const state = store.getState();
    return {
      worldVisible,
      spawn: world.SHINY_ROCK_SPAWN,
      spawnWalkable,
      collected,
      collectibles: state.collectibles,
      objective: state.quests['where-binky'].currentObjectiveId,
      pickupCount: state.progression.collectibleProgress['Shiny Rock'],
    };
  })()`);
  assert.deepEqual(shinyRockPickup, {
    worldVisible: true,
    spawn: [10.2, 0.18, -0.4],
    spawnWalkable: true,
    collected: true,
    collectibles: ['Shiny Rock'],
    objective: 'trade-with-sam',
    pickupCount: 1,
  }, 'the live Hub exposes one reachable quest-gated Shiny Rock and collects it');

  await client.send('Page.reload', { ignoreCache: true });
  await waitFor(client, 'document.readyState === "complete"', 'Shiny Rock pickup reload');
  const shinyRockTrade = await evaluate(client, `(async () => {
    const { useGameStore } = await import(${modulePath});
    globalThis.__daykareStore = useGameStore;
    const started = performance.now();
    while (!useGameStore.persist.hasHydrated() && performance.now() - started < 5000) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    const before = useGameStore.getState();
    const pickupSurvived = before.collectibles.includes('Shiny Rock')
      && before.quests['where-binky'].currentObjectiveId === 'trade-with-sam';
    const traded = before.tradeShinyRock();
    const duplicateTrade = useGameStore.getState().tradeShinyRock();
    const after = useGameStore.getState();
    return {
      pickupSurvived,
      traded,
      duplicateTrade,
      collectibles: after.collectibles,
      objective: after.quests['where-binky'].currentObjectiveId,
      binkyStatus: after.binkyStatus,
      pickupCount: after.progression.collectibleProgress['Shiny Rock'],
    };
  })()`);
  assert.deepEqual(shinyRockTrade, {
    pickupSurvived: true,
    traded: true,
    duplicateTrade: false,
    collectibles: [],
    objective: 'search-storage',
    binkyStatus: 'traded-info',
    pickupCount: 1,
  }, 'the Shiny Rock survives reload, trades atomically, and cannot advance twice');

  await client.send('Page.reload', { ignoreCache: true });
  await waitFor(client, 'document.readyState === "complete"', 'Shiny Rock trade reload');
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
        collectibles: state.collectibles,
        objective: state.quests['where-binky'].currentObjectiveId,
        pickupCount: state.progression.collectibleProgress['Shiny Rock'],
      };
    })()`),
    { collectibles: [], objective: 'search-storage', pickupCount: 1 },
    'the completed Shiny Rock trade remains consumed after reload',
  );

  const questModulePath = JSON.stringify(new URL('src/game/quests.ts', targetUrl).href);
  const tidyCameraInputModulePath = JSON.stringify(new URL('src/game/cameraInput.ts', targetUrl).href);
  const tidyInteractionFocusModulePath = JSON.stringify(new URL('src/game/interactionFocus.ts', targetUrl).href);
  const tidyThreeModulePath = JSON.stringify(new URL('node_modules/.vite/deps/three.js', targetUrl).href);
  await setViewport(client, 390, 844, true);
  await evaluate(client, `(async () => {
    const quests = await import(${questModulePath});
    const store = globalThis.__daykareStore;
    let tidyQuests = quests.activateQuest(quests.createInitialQuests(), 'rainbow-tidy-up');
    const state = store.getState();
    store.setState({
      quests: tidyQuests,
      inventory: [],
      tidyPlacedItems: [],
      activeDialogue: null,
      journalOpen: false,
      zone: 'hub',
      pendingZone: null,
      zoneTransitioning: false,
      playerPosition: [-3, 0, -2],
      hubPosition: [-3, 0, -2],
      teleportTrigger: state.teleportTrigger + 1,
    });
  })()`);
  await waitFor(
    client,
    `globalThis.__daykareStore.getState().activeInteractable === 'blue-block'
      && document.querySelector('.daykare-touch-interact strong')?.textContent === 'Pick up Toy'`,
    'mobile player can target the blue block',
  );
  await evaluate(client, `document.querySelector('.daykare-touch-interact').click()`);
  await waitFor(
    client,
    `globalThis.__daykareStore.getState().inventory.includes('blue-block')
      && globalThis.__daykareStore.getState().quests['rainbow-tidy-up'].currentObjectiveId === 'place-blue-block'`,
    'mobile player picks up the required blue block',
  );
  await waitFor(client, `Boolean(document.querySelector('.daykare-dialogue-close'))`, 'pickup dialogue close action');
  await evaluate(client, `document.querySelector('.daykare-dialogue-close').click()`);
  await waitFor(client, `globalThis.__daykareStore.getState().activeDialogue === null`, 'pickup dialogue closes');
  await evaluate(client, `(async () => {
    const store = globalThis.__daykareStore;
    const state = store.getState();
    store.setState({
      playerPosition: [0, 0, 0.3],
      hubPosition: [0, 0, 0.3],
      teleportTrigger: state.teleportTrigger + 1,
    });
  })()`);
  await sleep(250);
  const adverseTidyCameraYaw = await evaluate(client, `(async () => {
    const cameraInput = await import(${tidyCameraInputModulePath});
    const interactions = await import(${tidyInteractionFocusModulePath});
    const { Vector3 } = await import(${tidyThreeModulePath});
    cameraInput.recenterCamera();
    cameraInput.addCameraOrbit(Math.PI / 0.008, 0);
    globalThis.__daykareTidyCompetitorCleanup?.();
    globalThis.__daykareTidyCompetitorCleanup = interactions.registerInteractionCandidate({
      id: 'browser-competing-quest-target',
      position: new Vector3(0, 0, -0.2),
      range: 2,
      priority: 100,
      questPriority: true,
      valid: true,
    });
    return cameraInput.getCameraInput().yaw;
  })()`);
  assert.ok(
    Math.abs(adverseTidyCameraYaw - Math.PI) < 0.001,
    `mobile tidy regression keeps its adverse camera yaw: ${adverseTidyCameraYaw}`,
  );
  await waitFor(
    client,
    `globalThis.__daykareStore.getState().activeInteractable === 'activity-rainbow-tidy-up'
      && document.querySelector('.daykare-touch-interact strong')?.textContent === 'Place Blue Block'
      && document.querySelector('.daykare-touch-interact-mark')?.textContent?.trim() === 'PLACE'`,
    'carried blue block exposes its explicit mobile Place action despite unfavorable camera focus',
  );
  await evaluate(client, `document.querySelector('.daykare-touch-interact').click()`);
  await waitFor(
    client,
    `globalThis.__daykareStore.getState().quests['rainbow-tidy-up'].currentObjectiveId === 'collect-red-block'`,
    'mobile blue-block placement advances the tidy objective',
  );
  assert.deepEqual(
    await evaluate(client, `(() => {
      const state = globalThis.__daykareStore.getState();
      return {
        inventory: state.inventory,
        placed: state.tidyPlacedItems,
        objective: state.quests['rainbow-tidy-up'].currentObjectiveId,
      };
    })()`),
    { inventory: [], placed: ['blue-block'], objective: 'collect-red-block' },
    'mobile placement consumes and records the blue block atomically',
  );
  await evaluate(client, `(() => {
    globalThis.__daykareTidyCompetitorCleanup?.();
    globalThis.__daykareTidyCompetitorCleanup = null;
  })()`);
  await client.send('Page.reload', { ignoreCache: true });
  await waitFor(client, 'document.readyState === "complete"', 'blue-block placement reload');
  await waitFor(client, 'Boolean(document.querySelector("canvas"))', '3D canvas remount after blue-block placement');
  await evaluate(client, `(async () => {
    const { useGameStore } = await import(${modulePath});
    globalThis.__daykareStore = useGameStore;
  })()`);
  assert.deepEqual(
    await evaluate(client, `(() => {
      const state = globalThis.__daykareStore.getState();
      const duplicate = state.completeTidyToy('blue-block');
      return {
        duplicate,
        inventory: state.inventory,
        placed: state.tidyPlacedItems,
        objective: state.quests['rainbow-tidy-up'].currentObjectiveId,
      };
    })()`),
    { duplicate: false, inventory: [], placed: ['blue-block'], objective: 'collect-red-block' },
    'blue-block placement survives reload without duplicate advancement or ownership',
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
  await sleep(850);
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
    await evaluate(client, `globalThis.__daykareStore.setState({
      isRiding: true,
      schedule: 'juice-club',
      waitingCustomers: ['Max'],
      juiceClubActiveCustomer: 'Max',
      juiceClubCustomerPhase: 'ordering'
    })`);
    await setViewport(client, viewport.width, viewport.height, true);
    await waitFor(client, 'Boolean(document.querySelector(".daykare-touch-interact"))', `${viewport.label} interaction control`);
    // ResizeObserver, visualViewport, and scaled HUD rects settle on different
    // frames in software-rendered Chromium. Assert the converged layout, not the
    // transient frame immediately after the emulation override.
    await sleep(320);
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
        '.daykare-touch-interact',
        '.daykare-touch-actions',
      ];
      // Sprint/Crouch moved to the right thumb, into a band shared with Center
      // Camera above and the interaction button below. If it is not in this
      // matrix the overlap audit silently stops covering the crowded side.
      const collisionSelectors = [
        '.daykare-hud-left',
        '.daykare-hud-right',
        '.daykare-touch-movement',
        '.daykare-touch-interact',
        '.daykare-touch-recenter',
        '.daykare-touch-actions',
      ];
      const rectFor = (selector) => {
        const element = document.querySelector(selector);
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        return {
          selector,
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
        };
      };
      const collisionRects = collisionSelectors.map(rectFor).filter(Boolean);
      const overlaps = [];
      for (let i = 0; i < collisionRects.length; i += 1) {
        for (let j = i + 1; j < collisionRects.length; j += 1) {
          const a = collisionRects[i];
          const b = collisionRects[j];
          if (
            a.right > b.left + 1
            && b.right > a.left + 1
            && a.bottom > b.top + 1
            && b.bottom > a.top + 1
          ) {
            overlaps.push([a.selector, b.selector]);
          }
        }
      }
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
        controls: selectors.map((selector) => rectFor(selector) ?? { selector, missing: true }),
        overlaps,
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
    assert.deepEqual(
      controlLayout.overlaps,
      [],
      `${viewport.label} keeps HUD and touch controls separated: ${JSON.stringify(controlLayout.overlaps)}`,
    );
    const recenterControl = controlLayout.controls.find((control) => control.selector === '.daykare-touch-recenter');
    assert.ok(
      controlLayout.visual.right - recenterControl.right <= 24,
      `${viewport.label} keeps Center camera in its dedicated right-side slot: ${JSON.stringify({
        visualRight: controlLayout.visual.right,
        recenter: recenterControl,
        gap: controlLayout.visual.right - recenterControl.right,
      })}`,
    );
    if (viewport.label === 'landscape') {
      const safeAreaLayout = await evaluate(client, `(() => {
        const root = document.documentElement;
        root.style.setProperty('--daykare-safe-right', '44px');
        const visual = window.visualViewport ?? {
          offsetLeft: 0,
          width: window.innerWidth,
        };
        const rect = document.querySelector('.daykare-touch-recenter').getBoundingClientRect();
        const result = {
          rightGap: visual.offsetLeft + visual.width - rect.right,
          right: rect.right,
        };
        root.style.removeProperty('--daykare-safe-right');
        return result;
      })()`);
      assert.ok(
        safeAreaLayout.rightGap >= 52,
        `landscape Center camera clears a nonzero right safe area: ${JSON.stringify(safeAreaLayout)}`,
      );
    }
    if (process.env.DAYKARE_CAPTURE_DIR) {
      const screenshot = await client.send('Page.captureScreenshot', { format: 'png' });
      const captureName = viewport.label.replaceAll(' ', '-');
      await writeFile(
        path.join(process.env.DAYKARE_CAPTURE_DIR, `daykare-hud-${captureName}.png`),
        Buffer.from(screenshot.data, 'base64'),
      );
    }
  }
  await evaluate(client, 'globalThis.__daykareStore.setState({ isRiding: false })');

  await setViewport(client, 390, 844, true);
  const padPoint = await evaluate(client, `(() => {
    const rect = document.querySelector('.daykare-touch-pad').getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  })()`);
  const lookPoint = await evaluate(client, `(() => {
    const rect = document.querySelector('.daykare-touch-look').getBoundingClientRect();
    for (const yRatio of [0.55, 0.68, 0.42, 0.78, 0.3]) {
      for (const xRatio of [0.6, 0.72, 0.48, 0.82, 0.36]) {
        const point = { x: rect.left + rect.width * xRatio, y: rect.top + rect.height * yRatio };
        if (document.elementFromPoint(point.x, point.y)?.tagName === 'CANVAS') return point;
      }
    }
    return null;
  })()`);
  assert.ok(lookPoint, 'portrait has exposed gameplay canvas available for free-look');
  assert.deepEqual(
    await evaluate(client, `(() => {
      const hudButton = document.querySelector('.daykare-hud-left button');
      const hudRect = hudButton.getBoundingClientRect();
      const lookTarget = document.elementFromPoint(${lookPoint.x}, ${lookPoint.y});
      const hudTarget = document.elementFromPoint(
        hudRect.left + hudRect.width / 2,
        hudRect.top + hudRect.height / 2
      );
      return {
        lookTarget: lookTarget?.tagName,
        hudTargetIsCanvas: hudTarget?.tagName === 'CANVAS',
      };
    })()`),
    { lookTarget: 'CANVAS', hudTargetIsCanvas: false },
    'free-look begins on gameplay canvas without covering HUD controls',
  );
  const touchStartPosition = await evaluate(client, 'globalThis.__daykareMovementProbe.player');
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: padPoint.x, y: padPoint.y, id: 11, radiusX: 8, radiusY: 8 }],
  });
  await sleep(100);
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
  await sleep(100);
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

  // --- Center Camera: a real touch, not a synthetic click ---------------------
  //
  // The suite above clicks the control with element.click(). That proves the
  // handler works, but not that a finger landing on the control behaves
  // correctly: a HUD touch must recenter the camera and must NOT also be
  // treated as a look gesture. Those are different failures, and only a
  // dispatched touch sequence can tell them apart.
  const recenterHit = await evaluate(client, `(() => {
    const rect = document.querySelector('.daykare-touch-recenter').getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    return { x, y, hitsControl: document.elementFromPoint(x, y)?.closest('.daykare-touch-recenter') !== null };
  })()`);
  assert.equal(recenterHit.hitsControl, true, 'Center Camera control is hit-testable in compact portrait');

  // Orbit away from neutral first, so a recenter has something to undo.
  await evaluate(client, `(async () => {
    const cameraInput = await import(${cameraInputModulePath});
    cameraInput.addCameraOrbit(140, 30);
    return true;
  })()`);
  const orbitBeforeRecenterTouch = await evaluate(client, `(async () => {
    const cameraInput = await import(${cameraInputModulePath});
    return { ...cameraInput.getCameraInput() };
  })()`);
  assert.ok(
    Math.abs(orbitBeforeRecenterTouch.yaw) > 0.1,
    'camera is off-centre before the Center Camera touch',
  );

  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: recenterHit.x, y: recenterHit.y, id: 31, radiusX: 8, radiusY: 8 }],
  });
  // A finger is never perfectly still. This drift would orbit the camera if the
  // control leaked its touch through to the look handler.
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: recenterHit.x + 6, y: recenterHit.y + 4, id: 31, radiusX: 8, radiusY: 8 }],
  });
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
  await sleep(260);

  const orbitAfterRecenterTouch = await evaluate(client, `(async () => {
    const cameraInput = await import(${cameraInputModulePath});
    return { ...cameraInput.getCameraInput() };
  })()`);
  assert.equal(orbitAfterRecenterTouch.yaw, 0, 'a real touch on Center Camera recentres yaw in compact portrait');
  assert.ok(
    Math.abs(orbitAfterRecenterTouch.pitch - 0.22) < 1e-6,
    'a real touch on Center Camera restores the neutral pitch',
  );

  // --- HUD touches must not become camera touches -----------------------------
  const hudHit = await evaluate(client, `(() => {
    const button = document.querySelector('.daykare-hud-left button');
    if (!button) return null;
    const rect = button.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  })()`);
  if (hudHit) {
    const orbitBeforeHudDrag = await evaluate(client, `(async () => {
      const cameraInput = await import(${cameraInputModulePath});
      return { ...cameraInput.getCameraInput() };
    })()`);
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: hudHit.x, y: hudHit.y, id: 41, radiusX: 8, radiusY: 8 }],
    });
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: hudHit.x + 120, y: hudHit.y + 40, id: 41, radiusX: 8, radiusY: 8 }],
    });
    await sleep(160);
    const orbitAfterHudDrag = await evaluate(client, `(async () => {
      const cameraInput = await import(${cameraInputModulePath});
      return { ...cameraInput.getCameraInput() };
    })()`);
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    assert.equal(
      orbitAfterHudDrag.yaw,
      orbitBeforeHudDrag.yaw,
      'a drag that starts on a HUD control never orbits the camera',
    );
  }
  await client.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });

  const repeatedOrbit = await evaluate(client, `(async () => {
    const cameraInput = await import(${cameraInputModulePath});
    cameraInput.recenterCamera();
    const pad = document.querySelector('.daykare-touch-pad');
    const canvas = document.querySelector('.daykare-app-shell canvas');
    pad.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      pointerId: 61,
      pointerType: 'touch',
      button: 0,
      clientX: ${padPoint.x},
      clientY: ${padPoint.y},
    }));
    pad.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true,
      cancelable: true,
      pointerId: 61,
      pointerType: 'touch',
      clientX: ${padPoint.x + 34},
      clientY: ${padPoint.y - 52},
    }));
    for (let drag = 0; drag < 8; drag += 1) {
      const pointerId = 71 + drag;
      canvas.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        pointerId,
        pointerType: 'touch',
        button: 0,
        clientX: ${lookPoint.x},
        clientY: ${lookPoint.y},
      }));
      window.dispatchEvent(new PointerEvent('pointermove', {
        bubbles: true,
        cancelable: true,
        pointerId,
        pointerType: 'touch',
        clientX: ${lookPoint.x + 110},
        clientY: ${lookPoint.y},
      }));
      window.dispatchEvent(new PointerEvent('pointerup', {
        bubbles: true,
        pointerId,
        pointerType: 'touch',
        clientX: ${lookPoint.x + 110},
        clientY: ${lookPoint.y},
      }));
    }
    const touch = await import(${touchModulePath});
    const result = {
      movementMagnitude: Math.hypot(touch.getTouchInput().x, touch.getTouchInput().y),
      yaw: cameraInput.getCameraInput().yaw,
    };
    pad.dispatchEvent(new PointerEvent('pointerup', {
      bubbles: true,
      cancelable: true,
      pointerId: 61,
      pointerType: 'touch',
      clientX: ${padPoint.x + 34},
      clientY: ${padPoint.y - 52},
    }));
    return result;
  })()`);
  assert.ok(repeatedOrbit.movementMagnitude > 0.5, 'repeated free-look drags leave joystick movement owned');
  assert.ok(repeatedOrbit.yaw > Math.PI * 2, `repeated mobile free-look exceeds 360 degrees: ${repeatedOrbit.yaw}`);
  assert.deepEqual(
    await evaluate(client, `(async () => {
      const touch = await import(${touchModulePath});
      return { ...touch.getTouchInput() };
    })()`),
    { x: 0, y: 0, run: false, crouch: false },
    'releasing movement after repeated look drags clears only the completed joystick stream',
  );

  await evaluate(client, `(() => {
    const store = globalThis.__daykareStore;
    store.setState((state) => ({
      progression: { ...state.progression, reputation: 10 },
      activeDialogue: null,
      journalOpen: false,
      zoneTransitioning: false,
      pendingZone: null,
    }));
    store.getState().enterGarden();
  })()`);
  await setViewport(client, 844, 390, true);
  await waitFor(client, `globalThis.__daykareStore.getState().zone === 'garden'
    && !globalThis.__daykareStore.getState().zoneTransitioning
    && Boolean(document.querySelector('.daykare-touch-pad'))`, 'Garden landscape touch controls');
  await sleep(320);
  const gardenTouchPoints = await evaluate(client, `(() => {
    const pad = document.querySelector('.daykare-touch-pad').getBoundingClientRect();
    const canvas = document.querySelector('.daykare-app-shell canvas').getBoundingClientRect();
    let look = null;
    for (const yRatio of [0.52, 0.64, 0.4, 0.74, 0.3]) {
      for (const xRatio of [0.62, 0.72, 0.5, 0.82, 0.4]) {
        const point = { x: canvas.left + canvas.width * xRatio, y: canvas.top + canvas.height * yRatio };
        if (document.elementFromPoint(point.x, point.y)?.tagName === 'CANVAS') {
          look = point;
          break;
        }
      }
      if (look) break;
    }
    return {
      pad: { x: pad.left + pad.width / 2, y: pad.top + pad.height / 2 },
      look,
    };
  })()`);
  assert.ok(gardenTouchPoints.look, 'Garden landscape has exposed gameplay canvas available for free-look');
  const gardenOrbitBefore = await evaluate(client, `(async () => {
    const cameraInput = await import(${cameraInputModulePath});
    return cameraInput.getCameraInput().yaw;
  })()`);
  await evaluate(client, `(async () => {
    const touch = await import(${touchModulePath});
    const canvas = document.querySelector('.daykare-app-shell canvas');
    touch.setTouchMove(0.68, -0.58);
    canvas.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      pointerId: 42,
      pointerType: 'touch',
      button: 0,
      clientX: ${gardenTouchPoints.look.x},
      clientY: ${gardenTouchPoints.look.y},
    }));
    for (const [deltaX, deltaY] of [[52, -14], [104, -28], [156, -18]]) {
      window.dispatchEvent(new PointerEvent('pointermove', {
        bubbles: true,
        cancelable: true,
        pointerId: 42,
        pointerType: 'touch',
        clientX: ${gardenTouchPoints.look.x} + deltaX,
        clientY: ${gardenTouchPoints.look.y} + deltaY,
      }));
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  })()`);
  await sleep(320);
  const gardenDualTouch = await evaluate(client, `(async () => {
    const touch = await import(${touchModulePath});
    const cameraInput = await import(${cameraInputModulePath});
    return {
      movementMagnitude: Math.hypot(touch.getTouchInput().x, touch.getTouchInput().y),
      yawDelta: Math.abs(cameraInput.getCameraInput().yaw - ${gardenOrbitBefore}),
    };
  })()`);
  assert.ok(
    gardenDualTouch.movementMagnitude > 0.5,
    `Garden landscape keeps joystick movement active: ${JSON.stringify(gardenDualTouch)}`,
  );
  assert.ok(
    gardenDualTouch.yawDelta > 0.5,
    `Garden landscape keeps independent camera orbit active: ${JSON.stringify(gardenDualTouch)}`,
  );
  await evaluate(client, `(async () => {
    const touch = await import(${touchModulePath});
    touch.resetTouchInput();
    window.dispatchEvent(new PointerEvent('pointercancel', {
      bubbles: true,
      pointerId: 42,
      pointerType: 'touch',
    }));
  })()`);
  await evaluate(client, 'globalThis.__daykareStore.getState().returnToHub()');
  await setViewport(client, 390, 844, true);
  await waitFor(client, `globalThis.__daykareStore.getState().zone === 'hub'
    && !globalThis.__daykareStore.getState().zoneTransitioning
    && Boolean(document.querySelector('.daykare-touch-pad'))`, 'Hub portrait touch controls restored');
  await sleep(320);

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
  assert.equal(performanceSample.devicePixelRatio, 1, 'low quality renders at the optimized 1x DPR');
  assert.ok(
    performanceSample.adaptiveRenderMode === 'full' || performanceSample.adaptiveRenderMode === 'reduced',
    'performance probe reports the active renderer policy',
  );
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

  await evaluate(client, `globalThis.__daykareStore.setState((state) => ({
    zone: 'garden',
    gardenPosition: [6.42, 0, -0.2],
    playerPosition: [6.42, 0, -0.2],
    teleportTrigger: state.teleportTrigger + 1,
  }))`);
  await waitForResource(
    'Garden.tsx',
    'Garden module loads when the Garden opens',
  );
  await sleep(500);
  await evaluate(client, `globalThis.__daykareStore.setState({
    activeInteractable: 'garden-landmark-pond'
  })`);
  await waitFor(
    client,
    'document.querySelector(".daykare-touch-interact")?.textContent?.includes("Notice Pond Ripples")',
    'Garden landmark interaction prompt',
  );
  await evaluate(client, 'document.querySelector(".daykare-touch-interact").click()');
  await waitFor(
    client,
    'globalThis.__daykareStore.getState().activeDialogue?.name === "Ripple Pond"',
    'Garden landmark interaction dialogue',
  );
  await evaluate(client, 'globalThis.__daykareStore.getState().setActiveDialogue(null)');
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
