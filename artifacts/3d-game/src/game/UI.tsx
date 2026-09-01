import { RewardPulse } from './RewardPulse';
import { useIsRainy, useWeatherLabel } from './WeatherSystem';
import { useGameStore } from './store';
import { zoneLabel } from './world';
import { formatClock, timeOfDayToMinute } from './gameClock';
import { lazy, Suspense, useEffect, useRef, type KeyboardEvent } from 'react';
import { useKeyboardControls } from '@react-three/drei';
import { Controls } from './Controls';
import {
  Clock,
  Book,
  CloudRain,
  Sun,
  Wand2,
  DollarSign,
  AlertTriangle,
  MapPinned,
  Star,
  Menu,
  ShoppingBag,
} from 'lucide-react';
import { TouchControls } from './TouchControls';
import { HUB_ROUTES, isRouteUnlocked, requirementLabel, requirementProgressLabel } from './progression';
import { getActiveQuest, getCurrentObjective, objectiveIsActive } from './quests';
import { playGameSound, unlockGameAudio } from './audio';
import { dialogueDismissLabel } from './dialogueActions';
import { useModeStore } from './modeStore';
import {
  acknowledgeTeacherCall,
  getTeacherInterventionSnapshot,
  interventionIsActive,
} from './teacherInterventions';
import { useMonetizationStore } from './monetizationStore';

const Journal = lazy(() => import('./Journal').then(({ Journal }) => ({ default: Journal })));

export function UI() {
  const {
    timeOfDay,
    dayNumber,
    schedule,
    isRainy,
    isImaginationMode,
    activeInteractable,
    setActiveInteractable,
    journalOpen,
    binkyStatus,
    juiceClubCash,
    inventory,
    collectibles,
    friends,
    teacherSuspicion,
    activeDialogue,
    juiceStock,
    crackerStock,
    waitingCustomers,
    juiceClubServedCustomer,
    juiceClubCustomerPhase,
    juiceClubActiveCustomer,
    juiceUpgrades,
    toggleJournal,
    toggleImagination,
    toggleRain,
    advanceSchedule,
    pickUp,
    collectShinyRock,
    tradeShinyRock,
    drop,
    updateBinkyStatus,
    cycleTricycleColor,
    setActiveDialogue,
    updateFriend,
    buyStock,
    buyUpgrade,
    serveCustomer,
    advanceJuiceClubCustomer,
    resetJuiceClubCustomer,
    addWaitingCustomer,
    setIsRiding,
    isRiding,
    progression,
    quests,
    advanceQuestObjective,
    completeTidyToy,
    buyHubUpgrade,
    zone,
    zoneTransitioning,
    pendingZone,
    enterGarden,
    returnToHub,
    gardenActivityStep,
    startGardenActivity,
    advanceGardenActivity,
    resetGardenActivity,
    completeActivity,
    ambientMessage,
    activeInstruction,
    showInstruction,
    dismissInstruction,
    storageWarning,
    rivalStory,
    rewardEvents,
    chooseRivalResponse,
    resolveRivalStory,
    dismissRewardEvent,
    caper,
    districtProgress,
    startCaper,
    chooseCaperRole,
    advanceCaper,
    observeCaperPatrol,
    completeCaperSafeSetup,
    completeCaperRetrieval,
    interruptCaper,
    advanceDistrictPreview,
  } = useGameStore();
  const tidyTutorialSeen = useGameStore((state) => state.tidyTutorialSeen);
  const markTidyTutorialSeen = useGameStore((state) => state.markTidyTutorialSeen);
  const rainyNow = useIsRainy();

  useEffect(() => {
    if (!activeInstruction) return;
    const elapsed = Date.now() - activeInstruction.shownAt;
    const timer = window.setTimeout(dismissInstruction, Math.max(0, 5_000 - elapsed));
    return () => window.clearTimeout(timer);
  }, [activeInstruction, dismissInstruction]);
  const weatherLabel = useWeatherLabel();
  const frontEndBlocked = useModeStore((state) => state.menuOpen || state.activeMode === 'online-preview');
  const openMenu = useModeStore((state) => state.openMenu);
  const openPanel = useModeStore((state) => state.openPanel);
  const careCoins = useMonetizationStore((state) => state.careCoins);
  const careGems = useMonetizationStore((state) => state.careGems);
  const reconcileGameplayRewards = useMonetizationStore((state) => state.reconcileGameplayRewards);

  useEffect(() => {
    reconcileGameplayRewards(progression.reputation);
  }, [progression.reputation, reconcileGameplayRewards]);

  const [subscribe] = useKeyboardControls<Controls>();
  const interactRef = useRef<() => void>(() => undefined);
  const queueCursor = useRef(0);
  const dialogueRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const dialogueWasOpen = useRef(false);

  useEffect(() => {
    if (activeDialogue) {
      if (!dialogueWasOpen.current && document.activeElement instanceof HTMLElement) {
        previousFocusRef.current = document.activeElement;
      }
      dialogueWasOpen.current = true;
      const frame = window.requestAnimationFrame(() => {
        const dialogue = dialogueRef.current;
        const firstControl = dialogue?.querySelector<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        (firstControl ?? dialogue)?.focus();
      });
      return () => window.cancelAnimationFrame(frame);
    }

    if (dialogueWasOpen.current) {
      dialogueWasOpen.current = false;
      const previousFocus = previousFocusRef.current;
      previousFocusRef.current = null;
      if (previousFocus?.isConnected) previousFocus.focus();
    }
    return undefined;
  }, [activeDialogue]);

  const onDialogueKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      setActiveDialogue(null);
      return;
    }
    if (event.key !== 'Tab') return;
    const dialogue = dialogueRef.current;
    if (!dialogue) return;
    const controls = Array.from(dialogue.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )).filter((element) => element.offsetParent !== null);
    if (!controls.length) {
      event.preventDefault();
      dialogue.focus();
      return;
    }
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  useEffect(() => {
    const handleAudioUnlock = () => unlockGameAudio();
    window.addEventListener('pointerdown', handleAudioUnlock, { passive: true });
    window.addEventListener('touchstart', handleAudioUnlock, { passive: true });
    window.addEventListener('keydown', handleAudioUnlock);
    return () => {
      window.removeEventListener('pointerdown', handleAudioUnlock);
      window.removeEventListener('touchstart', handleAudioUnlock);
      window.removeEventListener('keydown', handleAudioUnlock);
    };
  }, []);

  useEffect(() => {
    if (activeDialogue) playGameSound('dialogue', 'dialogue');
  }, [activeDialogue?.name, activeDialogue?.text]);

  const activeReward = rewardEvents[0] ?? null;
  useEffect(() => {
    if (!activeReward) return;
    playGameSound('tidy-place', 'interaction');
    const timer = window.setTimeout(() => dismissRewardEvent(activeReward.id), 2600);
    return () => window.clearTimeout(timer);
  }, [activeReward?.id, dismissRewardEvent]);

  useEffect(() => {
    return subscribe(
      (state) => state.journal,
      (pressed) => {
        if (pressed && !activeDialogue && !zoneTransitioning && !frontEndBlocked) toggleJournal();
      }
    );
  }, [subscribe, toggleJournal, activeDialogue, zoneTransitioning, frontEndBlocked]);

  // Juice Club Customers Simulation
  useEffect(() => {
    if (schedule !== 'juice-club' || zone !== 'hub') {
      resetJuiceClubCustomer();
      return;
    }
    const potentialCustomers = ['Max', 'Noah', 'Zoe'];
    const inviteNext = () => {
      const name = potentialCustomers[queueCursor.current % potentialCustomers.length];
      queueCursor.current += 1;
      const game = useGameStore.getState();
      if (!game.waitingCustomers.includes(name) && !game.juiceClubServedCustomer) game.addWaitingCustomer(name);
    };
    const first = window.setTimeout(inviteNext, 1400);
    const interval = window.setInterval(inviteNext, 8000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(interval);
    };
  }, [schedule, zone, resetJuiceClubCustomer]);

  useEffect(() => {
    if (schedule !== 'juice-club' || zone !== 'hub' || juiceClubCustomerPhase === 'idle') return;
    const delays: Partial<Record<string, number>> = {
      drink: 1500,
      reaction: 1200,
    };
    const delay = delays[juiceClubCustomerPhase];
    if (!delay) return;
    const timer = window.setTimeout(advanceJuiceClubCustomer, delay);
    return () => window.clearTimeout(timer);
  }, [schedule, zone, juiceClubCustomerPhase, juiceClubServedCustomer, advanceJuiceClubCustomer]);

  useEffect(() => {
    const runInteraction = () => {
      if (zoneTransitioning || frontEndBlocked) return;
      unlockGameAudio();
      if (activeDialogue || isRiding || activeInteractable) {
        playGameSound('interaction', 'interaction');
      }
      if (activeDialogue) {
        if (!activeDialogue.options) {
          setActiveDialogue(null);
        }
        return;
      }

      if (isRiding) {
        setIsRiding(false);
        return;
      }

      if (activeInteractable) {
        if (activeInteractable === 'binky') {
          pickUp('binky');
          if (objectiveIsActive(quests, 'where-binky', 'search-storage')) {
            advanceQuestObjective('where-binky', 'search-storage');
          }
          setActiveInteractable(null);
          setActiveDialogue({ name: 'System', text: 'You found Binky! Return it to Leo.' });
        } else if (activeInteractable === 'shiny-rock') {
          if (collectShinyRock()) {
            setActiveInteractable(null);
            setActiveDialogue({
              name: 'Shiny Rock',
              text: 'A smooth blue rock sparkles in your hand. Sam might trade a clue for this.',
            });
          }
        } else if (activeInteractable === 'blue-block' || activeInteractable === 'red-block' || activeInteractable === 'yellow-block') {
          pickUp(activeInteractable);
          const objectiveId = `collect-${activeInteractable}`;
          advanceQuestObjective('rainbow-tidy-up', objectiveId);
          setActiveInteractable(null);
          // Only the FIRST block explains itself. This popup used to fire on
          // every block of every round - three modal interruptions per round,
          // for as many rounds as the player chose to grind. The Journal
          // objective and the on-screen interaction prompt still say where the
          // station is, so a player who needs the reminder still has it.
          if (!tidyTutorialSeen) {
            markTidyTutorialSeen();
            showInstruction({
              id: 'tidy-first-placement',
              text: 'Carry the block to the Rainbow Tidy-Up station, then place it in the matching spot.',
            });
          }
        } else if (activeInteractable === 'juice-stand') {
          if (schedule === 'juice-club') {
            setActiveDialogue({
              name: 'Juice Stand',
              text: waitingCustomers.length > 0 ? `${waitingCustomers[0]} is waiting for juice!` : 'Waiting for customers...',
              options: [
                {
                  label: 'Serve Customer',
                  action: () => {
                    if (waitingCustomers.length > 0) {
                      if (juiceStock > 0 && crackerStock > 0) {
                        if (juiceClubCustomerPhase === 'ordering') {
                          serveCustomer();
                          playGameSound('juice-service', 'interaction');
                           setActiveDialogue(null);
                        } else {
                          setActiveDialogue({ name: 'System', text: `${juiceClubActiveCustomer ?? waitingCustomers[0]} is still walking up to order.` });
                        }
                      } else {
                        setActiveDialogue({ name: 'System', text: 'Out of stock! Buy more in the Journal Business tab.' });
                      }
                    } else {
                      setActiveDialogue({ name: 'System', text: 'No one is waiting right now.' });
                    }
                  },
                },
                { label: 'Leave', action: () => setActiveDialogue(null) },
              ],
            });
          } else {
            setActiveDialogue({ name: 'System', text: 'Juice Club is currently closed. Opens at 12:00 PM.' });
          }
        } else if (activeInteractable === 'tricycle') {
          setActiveDialogue({
            name: 'Tricycle',
            text: 'What do you want to do?',
            options: [
              { label: 'Ride', action: () => { setIsRiding(true); setActiveDialogue(null); } },
              { label: 'Paint', action: () => { cycleTricycleColor(); setActiveDialogue(null); } },
              { label: 'Leave', action: () => setActiveDialogue(null) },
            ],
          });
        } else if (activeInteractable === 'activity-rainbow-tidy-up') {
          const objective = quests['rainbow-tidy-up']?.currentObjectiveId;
          const item = objective?.replace('place-', '');
          if (item && inventory.includes(item) && completeTidyToy(item)) {
            const finishedRound = item === 'yellow-block';
            if (finishedRound && rivalStory.beat === 'rainbow-challenge') {
              setActiveDialogue({
                name: 'Mae',
                text: 'You finished the whole sort without bossing anyone around. Maybe a good plan can leave room for other people. I wrote a new one for the Garden.',
              });
            } else if (finishedRound) {
              setActiveDialogue(null);
            } else if (!tidyTutorialSeen) {
              showInstruction({
                id: `tidy-next-${item}`,
                text: 'Perfect fit! Check the Journal objective for the next highlighted block.',
              });
            } else {
              setActiveDialogue(null);
            }
          } else {
            setActiveDialogue({ name: 'Rainbow Tidy-Up', text: 'Bring the highlighted toy here before sorting the next one.' });
          }
        } else if (activeInteractable === 'garden-return') {
          returnToHub();
        } else if (activeInteractable === 'garden-activity-host') {
          if (gardenActivityStep === 0) {
            startGardenActivity();
            setActiveDialogue({
              name: 'Gardener Nia',
              text: 'Let’s wake up this planting bed. First, loosen the soil around the three seedlings.',
            });
          } else if (gardenActivityStep < 3) {
            const nextStep = advanceGardenActivity();
            if (nextStep >= 3) {
              completeActivity('garden-planting', 2, 1);
              setActiveDialogue(rivalStory.beat === 'garden-reversal'
                ? {
                    name: 'Mae',
                    text: 'My map put the watering can on the wrong side, and you fixed it without making me feel silly. Meet me back in the Hub. I think our plans fit together.',
                  }
                : null);
            } else {
              setActiveDialogue({
                name: 'Gardener Nia',
                text: 'Great soil work. Now carry the little watering can along the row.',
              });
            }
          } else {
            resetGardenActivity();
            setActiveDialogue({
              name: 'Gardener Nia',
              text: 'The bed is ready for another planting round whenever you are.',
            });
          }
        } else if (activeInteractable.startsWith('garden-landmark-')) {
          const landmark = activeInteractable.replace('garden-landmark-', '');
          const landmarkDialogue: Record<string, { name: string; text: string }> = {
            pond: {
              name: 'Ripple Pond',
              text: 'Tiny ripples circle the lily pads. The lookout marker keeps everyone a safe step back from the water.',
            },
            gazebo: {
              name: 'Garden Gazebo',
              text: 'The roof carries songs across the Garden. It is a calm place for circle time and leaf-sharing.',
            },
            greenhouse: {
              name: 'Seedling Greenhouse',
              text: 'Warm glass protects the newest sprouts. Look closely and you can see three different leaf shapes.',
            },
          };
          const dialogue = landmarkDialogue[landmark];
          if (dialogue) setActiveDialogue(dialogue);
        } else if (activeInteractable.startsWith('garden-npc-')) {
          const name = activeInteractable.replace('garden-npc-', '');
          const gardenDialogue: Record<string, string> = {
            Lily: 'I am watering the west bed, then meeting Finn in the gazebo to compare leaves.',
            Finn: 'The pond is full of tiny ripples. After I watch them, I am joining the garden ball game.',
            Zoe: 'I checked the tall flowers and carried the watering can back along the path.',
            'Ms. Harper': 'I am supervising the planting beds, pond edge, and gazebo path. Everyone has a clear route.',
          };
          setActiveDialogue({ name, text: gardenDialogue[name] ?? 'The Garden has something new to notice at every stop.' });
        } else if (activeInteractable === 'caper-board') {
          if (caper.step === 'idle' || caper.step === 'complete') {
            if (startCaper()) {
              setActiveDialogue({
                name: 'Sticker Parade Plan',
                text: 'Mae’s safe caper has one rule: nobody sneaks, takes, or gets left out. Choose the role you want to practice.',
                options: [
                  { label: 'Route Leader', action: () => { chooseCaperRole('route-leader'); setActiveDialogue({ name: 'Mae', text: 'You lead the garden-gate route. I’ll keep the plan card and check each turn with you.' }); } },
                  { label: 'Lookout', action: () => { chooseCaperRole('lookout'); setActiveDialogue({ name: 'Zoe', text: 'We watch for clear hallways and call a pause if anyone needs the path.' }); } },
                  { label: 'Supply Helper', action: () => { chooseCaperRole('supply-helper'); setActiveDialogue({ name: 'Sam', text: 'We count washable stickers and carry only what Ms. Harper approves.' }); } },
                ],
              });
            }
          } else if (caper.step === 'plan') {
            setActiveDialogue({
              name: 'Sticker Parade Plan',
              text: 'Pick one role before the route opens.',
              options: [
                { label: 'Route Leader', action: () => { chooseCaperRole('route-leader'); setActiveDialogue(null); } },
                { label: 'Lookout', action: () => { chooseCaperRole('lookout'); setActiveDialogue(null); } },
                { label: 'Supply Helper', action: () => { chooseCaperRole('supply-helper'); setActiveDialogue(null); } },
              ],
            });
          } else if (caper.step === 'scout') {
            if (advanceCaper()) {
              setActiveDialogue({
                name: 'Sticker Parade Plan',
                text: `Scouting complete with ${caper.helper}. The ${caper.route.replace('-', ' ')} route has clear corners and a calm stopping spot. Show the plan to Ms. Harper next.`,
              });
            }
          } else if (caper.step === 'teacher-check') {
            setActiveDialogue({
              name: 'Sticker Parade Plan',
              text: 'The plan needs a grown-up check. Bring it to Ms. Harper before launching the parade.',
            });
          } else if (caper.step === 'patrol-timing') {
            setActiveDialogue({
              name: 'Sticker Parade Plan',
              text: caper.patrolStartedAt > 0
                ? 'Keep watching until the marked teacher round is complete.'
                : 'Ms. Harper marked a calm hallway window. Start the timer and watch one full teacher round before moving.',
              options: [
                {
                  label: caper.patrolStartedAt > 0 ? 'Check Clear Path' : 'Start Watching',
                  action: () => {
                    const before = useGameStore.getState().caper;
                    observeCaperPatrol(Date.now());
                    const after = useGameStore.getState().caper;
                    setActiveDialogue(after.step === 'safe-distraction'
                      ? { name: 'Ms. Harper', text: 'Good waiting. The full round is complete, the hallway is clear, and I am watching the Storage doorway.' }
                      : {
                          name: 'Ms. Harper',
                          text: before.patrolStartedAt > 0
                            ? 'The round is still moving. Watch a little longer, then check again.'
                            : 'Timer started. Watch the classroom, art hall, and playground turns before checking again.',
                        });
                  },
                },
                { label: 'Pause and Reset', action: () => { interruptCaper(); setActiveDialogue({ name: 'Ms. Harper', text: 'Pausing is a strong choice. We’ll clear the route and scout it together again.' }); } },
              ],
            });
          } else if (caper.step === 'safe-distraction') {
            setActiveDialogue({
              name: 'Sticker Parade Plan',
              text: 'The timing is right. Set the supervised bubble table in the public hall so the younger group has a calm activity while Ms. Harper opens Storage.',
            });
          } else if (caper.step === 'retrieve') {
            setActiveDialogue({
              name: 'Sticker Parade Plan',
              text: 'Ms. Harper has authorized this objective and is supervising the Storage doorway. Retrieve the labeled parade banner, then return here.',
            });
          } else if (caper.step === 'escape') {
            if (advanceCaper()) {
              setActiveDialogue({ name: 'Sticker Parade Plan', text: 'Safe return complete. Everyone stayed on the approved route. The parade can begin.' });
            }
          } else if (caper.step === 'interrupted') {
            if (advanceCaper()) {
              setActiveDialogue({ name: 'Ms. Harper', text: 'Reset complete. Scout the route again with your helper; pausing did not erase your progress.' });
            }
          } else if (caper.step === 'celebrate' && advanceCaper()) {
            setActiveDialogue(null);
          }
        } else if (activeInteractable === 'parade-banner') {
          if (caper.step === 'retrieve' && completeCaperRetrieval()) {
            setActiveInteractable(null);
            setActiveDialogue({
              name: 'Parade Banner',
              text: 'You take only the labeled banner while Ms. Harper supervises. Follow the clear return route back to the plan board.',
            });
          }
        } else if (activeInteractable === 'caper-bubble-table') {
          if (caper.step === 'safe-distraction' && completeCaperSafeSetup()) {
            setActiveInteractable(null);
            setActiveDialogue({
              name: 'Bubble Table',
              text: 'The public hall activity is ready and supervised. Ms. Harper opens Storage for the labeled parade banner only.',
            });
          }
        } else if (activeInteractable.startsWith('route-')) {
          const routeId = activeInteractable.replace('route-', '');
          const route = HUB_ROUTES.find((candidate) => candidate.id === routeId);
          if (route) {
            const unlocked = isRouteUnlocked(route, progression);
            if (route.id === 'garden-district' && unlocked) {
              enterGarden();
            } else {
              if (unlocked && route.id === 'maker-market') advanceDistrictPreview('makerMarket');
              if (unlocked && route.id === 'storybook-lane') advanceDistrictPreview('storybookLane');
              const foundationProgress = route.id === 'maker-market'
                ? districtProgress.makerMarket
                : districtProgress.storybookLane;
              setActiveDialogue({
                name: route.label,
                text: unlocked
                  ? `${route.description} Foundation ${Math.min(3, foundationProgress + 1)}/3 is now sketched at this entrance; the full district remains a future route.`
                  : route.id === 'garden-district'
                    ? `${route.subtitle}. Garden District opens at 10 hub reputation (${requirementProgressLabel(route, progression)}). Complete helpful quests and activities to earn reputation.`
                    : `${route.subtitle}. Build ${requirementProgressLabel(route, progression)} to prepare this route.`,
              });
            }
          }
        } else if (activeInteractable.startsWith('teacher-')) {
          handleTeacherInteraction(activeInteractable.replace('teacher-', ''));
        } else if (activeInteractable.startsWith('kid-')) {
          const kidName = activeInteractable.split('-')[1];
          handleKidInteraction(kidName);
        }
      }
    };

    interactRef.current = runInteraction;
    return subscribe(
      (state) => state.interact,
      (pressed) => {
        if (pressed) runInteraction();
      },
    );
  }, [subscribe, activeInteractable, schedule, activeDialogue, isRiding, juiceStock, crackerStock, waitingCustomers, juiceClubCustomerPhase, juiceClubActiveCustomer, inventory, progression, quests, zoneTransitioning, gardenActivityStep, collectShinyRock, rivalStory.beat, caper, districtProgress, frontEndBlocked]);

  const handleTeacherInteraction = (name: string) => {
    if (name === 'Ms. Harper' && caper.step === 'teacher-check') {
      if (advanceCaper()) {
        setActiveDialogue({
          name: 'Ms. Harper',
          text: 'Clear route, washable stickers, and a role for everyone. Approved. I’ll supervise the turn by the playground gate.',
        });
      }
      return;
    }
    if (name === 'Mr. Davis' && objectiveIsActive(quests, 'where-binky', 'search-storage')) {
      setActiveDialogue({ name, text: 'I moved a small pink toy to the Storage Room for safekeeping. Check the grounded boxes along the back wall.' });
      return;
    }
    const intervention = getTeacherInterventionSnapshot(`hub:${name}`);
    if (intervention?.phase === 'calling-player') {
      acknowledgeTeacherCall(`hub:${name}`);
      setActiveDialogue({
        name,
        text: intervention.targetName
          ? `Thanks for coming over. ${intervention.targetName} is taking a calm reset, and then we’ll notice the better choice together.`
          : 'Thanks for checking in. The play space is calm again.',
      });
      return;
    }
    if (intervention && interventionIsActive(intervention)) {
      setActiveDialogue({
        name,
        text: intervention.phase === 'praise'
          ? 'The calmer choice is working. I’m making sure that helpful reset gets noticed.'
          : 'I’m handling this with a reminder, a little space, and a safer activity choice.',
      });
      return;
    }
    if (name === 'Mr. Davis') {
      if (schedule === 'outdoor-play') {
        setActiveDialogue({ name, text: rainyNow ? 'Rain plan today: I am checking the reading and building corners.' : 'I am patrolling the playground fence and keeping the gate paths clear.' });
      } else if (schedule === 'juice-club') {
        setActiveDialogue({ name, text: 'I am supervising the Juice Club line. Keep the counter stocked and leave a clear path for customers.' });
      } else if (schedule === 'art-time') {
        setActiveDialogue({ name, text: 'I am making rounds between the art table and the hallway. Brushes stay at the table when you are finished.' });
      } else if (schedule === 'pickup') {
        setActiveDialogue({ name, text: 'Pickup patrol is underway. I am checking the hallway and making sure everyone has their things.' });
      } else {
        setActiveDialogue({ name, text: 'Morning rounds: classroom, hallway, then the playground gate. Let me know if a toy blocks a path.' });
      }
      return;
    }
    setActiveDialogue({
      name,
      text: schedule === 'art-time'
        ? 'I am helping everyone settle at the art tables. Choose a clear place before you begin.'
        : 'I am watching today’s activity and helping everyone take turns.',
    });
  };

  const handleKidInteraction = (name: string) => {
    if (name === 'Mae') {
      if (rivalStory.beat === 'meet-mae') {
        const respond = (choice: 'kind' | 'bold' | 'curious', text: string) => {
          if (chooseRivalResponse(choice)) setActiveDialogue({ name: 'Mae', text });
        };
        setActiveDialogue({
          name: 'Mae',
          text: 'I’m Mae. I make the best plans, but nobody follows them for long. I bet I can finish Rainbow Tidy-Up before you.',
          options: [
            { label: '“We can both help.”', action: () => respond('kind', 'Maybe. I usually work alone—but I wrote you a clue card. Let’s see how your way works.') },
            { label: '“Challenge accepted.”', action: () => respond('bold', 'Good! A real challenge. I left my first plan in your Journal. No shortcuts, okay?') },
            { label: '“Why do plans matter?”', action: () => respond('curious', 'Because people forget my ideas when play gets noisy. I left a note in your Journal so this one won’t disappear.') },
          ],
        });
        return;
      }
      if (rivalStory.beat === 'rainbow-challenge') {
        setActiveDialogue({ name: 'Mae', text: 'The Rainbow Tidy-Up is our challenge. You sort your way, I’ll watch whether it really helps everyone.' });
        return;
      }
      if (rivalStory.beat === 'garden-reversal') {
        setActiveDialogue({ name: 'Mae', text: 'My next plan is in the Garden. Gardener Nia needs help with the seedlings—and I may have mixed up one part.' });
        return;
      }
      if (rivalStory.beat === 'make-peace') {
        setActiveDialogue({
          name: 'Mae',
          text: 'You notice people. I notice steps. Want to make one fair plan together and share the credit?',
          options: [
            {
              label: 'Build the plan together',
              action: () => {
                if (resolveRivalStory()) {
                  setActiveDialogue({
                    name: 'Mae',
                    text: 'Two stars, one team. Ms. Harper says “Bridge Builder” is a good nickname for someone who helps ideas meet in the middle.',
                  });
                }
              },
            },
          ],
        });
        return;
      }
      setActiveDialogue({ name: 'Mae', text: 'Our next plan has two names at the top. That makes it better.' });
      return;
    }
    // Binky Quest Logic
    if (name === 'Leo') {
      if (objectiveIsActive(quests, 'where-binky', 'talk-to-leo')) {
        advanceQuestObjective('where-binky', 'talk-to-leo');
        setActiveDialogue({ name: 'Leo', text: "I lost Binky! He's pink and round. I think Mia saw something." });
      } else if (objectiveIsActive(quests, 'where-binky', 'return-binky')) {
        if (inventory.includes('binky')) {
          if (updateBinkyStatus('returned-good')) {
            updateFriend('Leo', { friendship: 100, mood: 'happy', recentMemory: 'Got Binky back!' });
            setActiveDialogue({ name: 'Leo', text: "BINKY! Thank you! Ms. Harper has a real helper job next: carry the misplaced blocks to the Rainbow Tidy-Up station." });
          } else {
            setActiveDialogue({ name: 'Leo', text: "Let's make sure Binky is really here before we finish the helper job." });
          }
        } else {
          setActiveDialogue({ name: 'Leo', text: "You found Binky, but you're not carrying him. Pick him up from where you dropped him or check Lost & Found." });
        }
      } else if (binkyStatus === 'returned-good') {
        setActiveDialogue({ name: 'Leo', text: "Binky says hi! The Rainbow Tidy-Up station could use your help." });
      } else {
        setActiveDialogue({ name: 'Leo', text: "Please find Binky..." });
      }
    } else if (name === 'Mia') {
      if (objectiveIsActive(quests, 'where-binky', 'ask-mia')) {
        advanceQuestObjective('where-binky', 'ask-mia');
        setActiveDialogue({ name: 'Mia', text: "I saw Sam taking a shiny rock near the playground." });
      } else {
        setActiveDialogue({ name: 'Mia', text: "I like shiny things." });
      }
    } else if (name === 'Sam') {
      if (objectiveIsActive(quests, 'where-binky', 'trade-with-sam')) {
        if (collectibles.includes('Shiny Rock')) {
          setActiveDialogue({
            name: 'Sam',
            text: "I'll tell you what I saw if you give me a Shiny Rock.",
            options: [
              { label: 'Trade Rock', action: () => {
                if (tradeShinyRock()) {
                  setActiveDialogue({ name: 'Sam', text: "Thanks! I saw Mr. Davis put something pink in the Storage Room boxes." });
                } else {
                  setActiveDialogue({ name: 'Sam', text: "Let's find that Shiny Rock near the playground first." });
                }
              }},
              { label: 'Keep it', action: () => setActiveDialogue(null) }
            ]
          });
        } else {
          setActiveDialogue({ name: 'Sam', text: "I want a Shiny Rock." });
        }
      } else if (objectiveIsActive(quests, 'where-binky', 'search-storage')) {
        setActiveDialogue({ name: 'Sam', text: "Check the Storage Room!" });
      } else {
        setActiveDialogue({ name: 'Sam', text: "Tag, you're it! Just kidding." });
      }
    } else {
      // Generic Kid dialogue
      const f = friends[name];
      setActiveDialogue({ name: name, text: `I am feeling ${f.mood} today. ${f.recentMemory}` });
    }
  };

  /**
   * Formatting now comes from the canonical clock.
   *
   * The old local formatter padded only the exact hour - `minutes === 0 ? '00'
   * : minutes` - so 9:05 rendered as "9:5". Nobody saw it because time only
   * ever landed on :00 or :30. A clock that runs continuously lands on every
   * minute, and the first one it reached read "9:1 AM".
   */
  const formatTime = (time: number) => formatClock(timeOfDayToMinute(time));

  const getScheduleLabel = (s: string) => {
    return s.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  };

  const getInteractionLabel = () => {
    if (activeDialogue?.options) return null;
    if (activeDialogue) return 'Continue';
    if (isRiding) return 'Dismount';
    if (!activeInteractable) return null;
    if (activeInteractable === 'binky') return 'Pick up Binky';
    if (activeInteractable === 'shiny-rock') return 'Pick up Shiny Rock';
    if (activeInteractable === 'juice-stand') return schedule === 'juice-club' ? 'Use Juice Stand' : 'Check Juice Stand';
    if (activeInteractable === 'tricycle') return 'Use Tricycle';
    if (activeInteractable === 'activity-rainbow-tidy-up') {
      const item = quests['rainbow-tidy-up']?.currentObjectiveId?.replace('place-', '');
      if (!item) return 'Place Toy';
      const name = item.split('-').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
      return `Place ${name}`;
    }
    if (activeInteractable === 'garden-return') return 'Return to DayKare';
    if (activeInteractable === 'garden-activity-host') {
      if (gardenActivityStep === 0) return 'Start Planting';
      if (gardenActivityStep < 3) return `Tend Seedlings · ${gardenActivityStep}/3`;
      return 'Plant Another Bed';
    }
    if (activeInteractable === 'caper-board') {
      if (caper.step === 'idle' || caper.step === 'complete') return 'Start Sticker Parade';
      if (caper.step === 'celebrate') return 'Launch Sticker Parade';
      return `Continue Caper · ${caper.step.replace('-', ' ')}`;
    }
    if (activeInteractable === 'parade-banner') return 'Retrieve Parade Banner';
    if (activeInteractable === 'caper-bubble-table') return 'Set Up Bubble Table';
    if (activeInteractable.startsWith('garden-landmark-')) {
      const labels: Record<string, string> = {
        pond: 'Notice Pond Ripples',
        gazebo: 'Listen at the Gazebo',
        greenhouse: 'Inspect Seedlings',
      };
      return labels[activeInteractable.replace('garden-landmark-', '')] ?? 'Explore Garden Landmark';
    }
    if (activeInteractable.startsWith('garden-npc-')) return `Talk to ${activeInteractable.replace('garden-npc-', '')}`;
    if (activeInteractable.startsWith('route-')) {
      const route = HUB_ROUTES.find((candidate) => `route-${candidate.id}` === activeInteractable);
      if (!route) return 'Check Route';
      return `${isRouteUnlocked(route, progression) && route.id === 'garden-district' ? 'Enter' : 'Check'} ${route.label}`;
    }
    if (activeInteractable.startsWith('teacher-')) return `Talk to ${activeInteractable.replace('teacher-', '')}`;
    if (activeInteractable.startsWith('kid-')) return `Talk to ${activeInteractable.split('-')[1]}`;
    if (activeInteractable.includes('block')) return 'Pick up Toy';
    return 'Interact';
  };

  const interactionLabel = getInteractionLabel();
  const getInteractionDetail = () => {
    if (activeDialogue) return null;
    if (!activeInteractable) return null;
    if (activeInteractable === 'activity-rainbow-tidy-up') return 'Physical quest · sort one toy at a time';
    if (activeInteractable === 'garden-return') return 'Connected route · daycare hub';
    if (activeInteractable === 'garden-activity-host') return 'Repeatable Garden activity · modest reward';
    if (activeInteractable === 'caper-board') return 'Safe caper · planned with teacher supervision';
    if (activeInteractable === 'parade-banner') return 'Authorized story objective · teacher supervised';
    if (activeInteractable === 'caper-bubble-table') return 'Public hall setup · supervised activity';
    if (activeInteractable.startsWith('garden-landmark-')) return 'Garden discovery · safe observation point';
    if (activeInteractable.startsWith('garden-npc-')) return 'Garden routine';
    if (activeInteractable.startsWith('route-')) {
      const route = HUB_ROUTES.find((candidate) => `route-${candidate.id}` === activeInteractable);
      if (!route) return 'Future access point';
      return isRouteUnlocked(route, progression)
        ? route.id === 'garden-district' ? 'Connected route · Garden spawn' : 'Route prepared'
        : `Locked · ${requirementProgressLabel(route, progression)}`;
    }
    if (activeInteractable === 'juice-stand') return schedule === 'juice-club' ? 'Business activity' : 'Opens at 12:00 PM';
    if (activeInteractable === 'tricycle') return 'Ride or customize';
    if (activeInteractable.startsWith('teacher-')) return 'Teacher guidance';
    if (activeInteractable.startsWith('kid-')) return 'Friend interaction';
    return 'Nearby object';
  };
  const interactionDetail = getInteractionDetail();
  const activeQuest = getActiveQuest(quests);
  const activeObjective = getCurrentObjective(quests);
  const gameplayBlocked = journalOpen || Boolean(activeDialogue) || zoneTransitioning || frontEndBlocked;

  return (
    <div className="absolute inset-0 pointer-events-none select-none z-10 font-sans">
      
      {/* HUD - Top Left */}
      <div className="daykare-hud-left absolute top-6 left-6 flex flex-col gap-3 pointer-events-auto">
        <div className="bg-card/90 backdrop-blur border-2 border-primary/20 p-4 rounded-xl shadow-lg flex items-center gap-4 text-card-foreground">
          <div className="bg-primary/10 p-2 rounded-lg">
            <Clock className="w-6 h-6 text-primary" />
          </div>
          <div>
            <div className="text-2xl font-bold tracking-tight">{formatTime(timeOfDay)}</div>
            <div className="text-sm font-medium text-muted-foreground">Day {dayNumber} · {getScheduleLabel(schedule)} · {weatherLabel}{rainyNow && " (Indoor)"}</div>
          </div>
          <img
            src={`${import.meta.env.BASE_URL}daykare-assets/01_playtime_app_icon.png`}
            alt=""
            className="hidden sm:block w-12 h-9 rounded-lg object-cover border border-primary/20"
          />
        </div>

        <div className="flex gap-2">
          <button 
            onClick={advanceSchedule}
            disabled={gameplayBlocked}
            className="bg-card/90 backdrop-blur px-3 py-2 rounded-lg text-sm font-bold shadow hover:bg-card border-2 border-transparent hover:border-primary/20 transition-all pointer-events-auto"
          >
            {timeOfDay >= 17.5 ? 'Next day' : '+1.5h'}
          </button>
          <button 
            onClick={toggleRain}
            disabled={gameplayBlocked}
            className="bg-card/90 backdrop-blur p-2 rounded-lg shadow hover:bg-card border-2 border-transparent hover:border-blue-400/30 transition-all pointer-events-auto text-blue-500"
            title="Toggle Rain"
          >
            {rainyNow ? <CloudRain className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
          </button>
          <button 
            onClick={toggleImagination}
            disabled={gameplayBlocked}
            className={`backdrop-blur p-2 rounded-lg shadow transition-all pointer-events-auto border-2 ${
              isImaginationMode 
                ? 'bg-accent text-white border-accent' 
                : 'bg-card/90 text-accent border-transparent hover:border-accent/30'
            }`}
            title="Imagination Mode"
          >
            <Wand2 className="w-5 h-5" />
          </button>
          <button 
            onClick={() => useGameStore.setState(s => ({ quality: s.quality === 'high' ? 'low' : 'high' }))}
            disabled={gameplayBlocked}
            className="bg-card/90 backdrop-blur px-3 py-2 rounded-lg text-sm font-bold shadow hover:bg-card border-2 border-transparent hover:border-gray-400/30 transition-all pointer-events-auto text-gray-700"
            title="Quality Toggle"
          >
            {useGameStore.getState().quality === 'high' ? 'HQ' : 'LQ'}
          </button>
        </div>
        {activeQuest && activeObjective && (
          <div className="daykare-quest-card max-w-xs bg-card/92 backdrop-blur border-2 border-amber-400/35 p-3 rounded-xl shadow-lg flex gap-3 items-start">
            <img
              src={`${import.meta.env.BASE_URL}daykare-assets/13_ui_quest_icons.png`}
              alt=""
              className="w-12 h-12 rounded-lg object-cover border border-amber-300/50"
            />
            <div>
              <div className="text-[10px] uppercase tracking-[0.18em] font-black text-amber-700">{activeQuest.title}</div>
              <div className="font-bold text-card-foreground mt-1">{activeObjective.label}</div>
              <div className="text-xs text-muted-foreground mt-1">{activeObjective.guidance}</div>
            </div>
          </div>
        )}
      </div>

      {/* HUD - Top Right */}
      <div className="daykare-hud-right absolute top-6 right-6 flex flex-col items-end gap-3 pointer-events-auto">
        <button
          type="button"
          onClick={openMenu}
          disabled={Boolean(activeDialogue) || zoneTransitioning}
          className="bg-card/90 backdrop-blur border-2 border-primary/20 p-3 rounded-xl shadow-lg flex items-center gap-3 hover:scale-105 transition-transform"
          data-testid="button-open-game-menu"
          aria-label="Open game menu"
        >
          <span className="font-bold hidden sm:block">Menu</span>
          <Menu className="w-6 h-6 text-primary" />
        </button>
        <button
          type="button"
          onClick={() => openPanel('shop')}
          disabled={Boolean(activeDialogue) || zoneTransitioning}
          className="bg-card/90 backdrop-blur border-2 border-violet-400/25 px-3 py-2 rounded-xl shadow-lg flex items-center gap-2 hover:scale-105 transition-transform"
          data-testid="button-open-kare-shop"
          aria-label="Open Kare Shop"
        >
          <ShoppingBag className="w-5 h-5 text-violet-600" />
          <span className="font-bold hidden sm:block">Kare Shop</span>
          <span className="text-[10px] font-black text-amber-700">{careCoins} C</span>
          <span className="text-[10px] font-black text-violet-700">{careGems} G</span>
        </button>
        <button 
          onClick={toggleJournal}
          disabled={Boolean(activeDialogue) || zoneTransitioning}
          className="bg-card/90 backdrop-blur border-2 border-primary/20 p-3 rounded-xl shadow-lg flex items-center gap-3 hover:scale-105 transition-transform"
        >
          <span className="font-bold hidden sm:block">Journal (J)</span>
          <Book className="w-6 h-6 text-primary" />
        </button>

        <div className="daykare-progress-chip daykare-hud-progress bg-card/90 backdrop-blur border-2 border-amber-400/25 px-3 py-2 rounded-xl shadow flex items-center gap-3 text-card-foreground">
          <div className="flex items-center gap-1 font-bold text-amber-700 relative">
            <Star className="w-4 h-4 fill-amber-400 text-amber-500" />
            {progression.tokens}
            <RewardPulse value={progression.tokens} />
          </div>
          <div className="w-px h-4 bg-amber-300/50" />
          <div className="text-xs font-bold text-muted-foreground relative">
            {progression.reputation} REP
            <RewardPulse value={progression.reputation} suffix=" REP" />
          </div>
        </div>

        {/*
          The current-location readout. NOT a control, and never was.
          
          It sits directly under the Menu and Journal buttons and used to share
          their exact card styling - same blur, same border weight, same
          rounding - so it read as a third button that did nothing when tapped.
          It has no handler because district travel is diegetic: you walk to
          the portal and press E. Adding HUD fast-travel here would quietly
          replace a designed mechanic with a menu.
          
          So the fix is to stop it claiming to be a button. It is now labelled
          as a location, styled flatter than the real controls, and announced
          to screen readers when the zone changes.
        */}
        <div
          className="daykare-hud-zone daykare-hud-readout bg-card/70 backdrop-blur border border-emerald-500/30 px-3 py-1.5 rounded-lg flex items-center gap-2 text-card-foreground cursor-default select-none"
          role="status"
          aria-live="polite"
          aria-label={`Current location: ${zoneLabel(zone)}`}
          data-testid="status-current-zone"
        >
          <MapPinned className="w-4 h-4 text-emerald-600" aria-hidden="true" />
          <span className="flex flex-col leading-tight">
            <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">You are in</span>
            <span className="text-xs font-black uppercase tracking-wide">{zoneLabel(zone)}</span>
          </span>
        </div>
        
        {schedule === 'juice-club' && (
          <div className="daykare-hud-juice bg-card/90 backdrop-blur border-2 border-green-500/20 p-3 rounded-xl shadow flex flex-col items-end text-green-600 font-bold">
            <div className="flex items-center gap-2 text-lg">
              <DollarSign className="w-5 h-5" />
              <span>{juiceClubCash}.00</span>
            </div>
            {waitingCustomers.length > 0 && (
              <div className="text-xs text-orange-600 animate-pulse mt-1">
                {juiceClubCustomerPhase === 'ordering' ? `${juiceClubActiveCustomer} is ordering!` : `Customer ${juiceClubCustomerPhase}`}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="daykare-center-notices" aria-live="polite">
        {activeInstruction && !activeDialogue && !journalOpen && !zoneTransitioning && (
          <button
            type="button"
            className="daykare-gameplay-instruction"
            onClick={dismissInstruction}
            aria-label="Dismiss instruction"
          >
            <strong>What to do</strong>
            <span>{activeInstruction.text}</span>
            <small>Tap to dismiss</small>
          </button>
        )}
        {teacherSuspicion > 0 && (
          <div className="daykare-suspicion bg-red-500/90 text-white px-6 py-2 rounded-full font-bold shadow-lg flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" />
            Teacher Suspicion: {Math.round(teacherSuspicion)}%
          </div>
        )}
        {storageWarning && (
          <div className="daykare-save-warning max-w-md rounded-xl bg-amber-50/95 border-2 border-amber-500/55 px-4 py-2 text-sm font-bold text-amber-950 shadow-xl" role="status">
            Saving is unavailable in this browser. Your game will continue, but progress will not be saved.
          </div>
        )}
        {ambientMessage && !activeDialogue && !journalOpen && !zoneTransitioning && (
          <div className="daykare-ambient-message max-w-md rounded-full bg-[#fff8e8]/94 border-2 border-[#e6ae2f]/45 px-5 py-3 text-sm font-bold text-[#5c3a21] shadow-xl">
            {ambientMessage}
          </div>
        )}
      </div>

      {activeReward && (
        <div className="daykare-reward-burst" role="status" aria-live="polite">
          <div className="daykare-reward-sparkle" aria-hidden="true">✦</div>
          <div className="daykare-reward-copy">
            <strong>{activeReward.title}</strong>
            <span>{activeReward.detail}</span>
            {(activeReward.tokens > 0 || activeReward.reputation > 0) && (
              <small>
                {activeReward.tokens > 0 ? `+${activeReward.tokens} ★` : ''}
                {activeReward.tokens > 0 && activeReward.reputation > 0 ? '  ·  ' : ''}
                {activeReward.reputation > 0 ? `+${activeReward.reputation} REP` : ''}
              </small>
            )}
          </div>
          {activeReward.sticker && <div className="daykare-reward-sticker">{activeReward.sticker}</div>}
        </div>
      )}

      {/* Dialogue Overlay */}
      {activeDialogue && (
        <div
          ref={dialogueRef}
          className="daykare-dialogue absolute bottom-12 left-1/2 -translate-x-1/2 w-full max-w-2xl bg-card border-4 border-primary p-6 rounded-2xl shadow-2xl animate-in slide-in-from-bottom-8 pointer-events-auto z-20"
          role="dialog"
          aria-modal="true"
          aria-label={`${activeDialogue.name} dialogue`}
          tabIndex={-1}
          onKeyDown={onDialogueKeyDown}
        >
          <div className="font-serif font-bold text-2xl text-primary mb-2">{activeDialogue.name}</div>
          <div className="text-lg text-card-foreground mb-4">{activeDialogue.text}</div>
          
          {activeDialogue.options ? (
            <div className="daykare-dialogue-actions flex gap-4">
              {activeDialogue.options.map((opt, i) => (
                <button 
                  key={i}
                  onClick={opt.action}
                  className="bg-primary/10 hover:bg-primary/20 text-primary font-bold py-2 px-4 rounded-lg transition-colors border border-primary/30"
                >
                  {opt.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setActiveDialogue(null)}
                className="daykare-dialogue-cancel bg-muted/70 hover:bg-muted text-card-foreground font-bold py-2 px-4 rounded-lg transition-colors border border-border"
                aria-label="Cancel choice and leave dialogue"
              >
                {dialogueDismissLabel(true)}
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="daykare-dialogue-close text-sm text-muted-foreground mt-4 flex items-center gap-2"
              onClick={() => setActiveDialogue(null)}
              aria-label="Continue and close dialogue"
            >
              <span className="bg-muted px-2 py-1 rounded">E</span>
              <span className="daykare-dialogue-close-copy">
                <strong>{dialogueDismissLabel(false)}</strong>
                <small>Tap here or press E to close</small>
              </span>
            </button>
          )}
        </div>
      )}

      {zoneTransitioning && (
        <div className="absolute inset-0 z-[80] bg-[#183f35]/92 text-white flex items-center justify-center pointer-events-auto" role="status" aria-live="assertive">
          <div className="text-center px-6">
            <div className="w-14 h-14 mx-auto rounded-full border-4 border-white/25 border-t-[#ffd166] animate-spin" />
            <div className="font-serif text-3xl font-bold mt-5">
              {pendingZone === 'garden' ? 'Opening Garden District' : 'Returning to DayKare'}
            </div>
            <div className="text-sm text-white/75 mt-2">Following the connected garden path…</div>
          </div>
        </div>
      )}

      {/* Interaction Prompt - Bottom Center */}
      {interactionLabel && !journalOpen && !activeDialogue && (
        <div className="daykare-desktop-interact daykare-interaction-prompt absolute bottom-12 left-1/2 -translate-x-1/2 bg-card border-2 border-primary p-4 rounded-2xl shadow-xl flex items-center gap-4 animate-in slide-in-from-bottom-4">
          <div className="bg-primary text-primary-foreground font-mono font-bold w-10 h-10 rounded-lg flex items-center justify-center text-xl shadow-inner">
            E
          </div>
          <div>
            <div className="text-lg font-bold text-card-foreground">{interactionLabel}</div>
            {interactionDetail && (
              <div className="text-xs font-semibold text-muted-foreground mt-0.5">{interactionDetail}</div>
            )}
          </div>
        </div>
      )}

      {/* Crosshair */}
      {!journalOpen && !activeDialogue && (
        <div className="daykare-crosshair absolute top-1/2 left-1/2 w-1.5 h-1.5 bg-white/80 rounded-full -translate-x-1/2 -translate-y-1/2 shadow-sm" />
      )}

      {/* Journal Overlay */}
      {journalOpen && (
        <Suspense fallback={<div className="absolute inset-0 z-50 grid place-items-center bg-black/40 text-white" role="status">Opening Journal…</div>}>
          <Journal />
        </Suspense>
      )}

      <TouchControls
        movementEnabled={!journalOpen && !activeDialogue && !zoneTransitioning}
        interactionLabel={journalOpen || activeDialogue || zoneTransitioning ? null : interactionLabel}
        interactionDetail={journalOpen || activeDialogue || zoneTransitioning ? null : interactionDetail}
        onInteract={() => interactRef.current()}
      />

      {/* Controls Legend */}
      {!journalOpen && (
        <div className="daykare-desktop-only absolute bottom-6 right-6 bg-black/50 backdrop-blur text-white p-4 rounded-xl text-xs font-mono space-y-2 pointer-events-none">
          <div className="flex justify-between gap-4"><span>Move</span> <span className="text-gray-300">Arrows / WASD</span></div>
          <div className="flex justify-between gap-4"><span>Jump</span> <span className="text-gray-300">Space</span></div>
          <div className="flex justify-between gap-4"><span>Run</span> <span className="text-gray-300">Shift</span></div>
          <div className="flex justify-between gap-4"><span>Camera</span> <span className="text-gray-300">Drag orbit · R centers</span></div>
          <div className="flex justify-between gap-4"><span>Crouch</span> <span className="text-gray-300">C</span></div>
          <div className="flex justify-between gap-4"><span>Interact</span> <span className="text-gray-300">E</span></div>
          <div className="flex justify-between gap-4"><span>Journal</span> <span className="text-gray-300">J/Tab</span></div>
        </div>
      )}
    </div>
  );
}
