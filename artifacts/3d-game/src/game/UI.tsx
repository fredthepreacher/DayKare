import { useGameStore } from './store';
import { useEffect, useRef } from 'react';
import { useKeyboardControls } from '@react-three/drei';
import { Controls } from './Controls';
import {
  Clock,
  Book,
  CloudRain,
  Sun,
  Wand2,
  Backpack,
  DollarSign,
  Heart,
  AlertTriangle,
  MapPinned,
  Sparkles,
  Star,
  Trophy,
  LockKeyhole,
  CheckCircle2,
} from 'lucide-react';
import { TouchControls } from './TouchControls';
import { HUB_ROUTES, isRouteUnlocked, requirementLabel, requirementProgressLabel } from './progression';
import { getActiveQuest, getCurrentObjective, objectiveIsActive, QUEST_DEFINITIONS } from './quests';
import { playGameSound, unlockGameAudio } from './audio';
import { dialogueDismissLabel } from './dialogueActions';

export function UI() {
  const {
    timeOfDay,
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
    juiceUpgrades,
    toggleJournal,
    toggleImagination,
    toggleRain,
    advanceSchedule,
    pickUp,
    drop,
    updateBinkyStatus,
    cycleTricycleColor,
    setActiveDialogue,
    updateFriend,
    buyStock,
    buyUpgrade,
    serveCustomer,
    clearJuiceClubServedCustomer,
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
  } = useGameStore();

  const [subscribe] = useKeyboardControls<Controls>();
  const interactRef = useRef<() => void>(() => undefined);
  const queueCursor = useRef(0);

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

  useEffect(() => {
    return subscribe(
      (state) => state.journal,
      (pressed) => {
        if (pressed && !activeDialogue && !zoneTransitioning) toggleJournal();
      }
    );
  }, [subscribe, toggleJournal, activeDialogue, zoneTransitioning]);

  // Juice Club Customers Simulation
  useEffect(() => {
    if (schedule !== 'juice-club' || zone !== 'hub') return;
    const potentialCustomers = ['Max', 'Noah', 'Zoe'];
    const inviteNext = () => {
      const name = potentialCustomers[queueCursor.current % potentialCustomers.length];
      queueCursor.current += 1;
      useGameStore.getState().addWaitingCustomer(name);
    };
    const first = window.setTimeout(inviteNext, 1400);
    const interval = window.setInterval(inviteNext, 8000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(interval);
    };
  }, [schedule, zone]);

  useEffect(() => {
    if (!juiceClubServedCustomer) return;
    const timer = window.setTimeout(clearJuiceClubServedCustomer, 3200);
    return () => window.clearTimeout(timer);
  }, [juiceClubServedCustomer, clearJuiceClubServedCustomer]);

  useEffect(() => {
    const runInteraction = () => {
      if (zoneTransitioning) return;
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
        } else if (activeInteractable === 'blue-block' || activeInteractable === 'red-block' || activeInteractable === 'yellow-block') {
          pickUp(activeInteractable);
          const objectiveId = `collect-${activeInteractable}`;
          advanceQuestObjective('rainbow-tidy-up', objectiveId);
          setActiveInteractable(null);
          setActiveDialogue({ name: 'Rainbow Tidy-Up', text: 'Toy collected! Carry it to the activity station.' });
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
                        serveCustomer();
                         playGameSound('juice-service', 'interaction');
                        setActiveDialogue({ name: 'System', text: 'Served a happy customer! +1 reputation and +1 Star Token.' });
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
            setActiveDialogue({
              name: 'Rainbow Tidy-Up',
              text: finishedRound
                ? 'Everything is sorted! +2 reputation and +2 Star Tokens. You earned a Trusted Helper Pass, and a fresh tidy round is ready.'
                : 'Perfect fit! Now find the next misplaced toy.',
            });
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
              setActiveDialogue({
                name: 'Gardener Nia',
                text: 'All three seedlings are watered and standing tall! +1 reputation and +2 Star Tokens. This bed can be planted again.',
              });
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
        } else if (activeInteractable.startsWith('garden-npc-')) {
          const name = activeInteractable.replace('garden-npc-', '');
          const gardenDialogue: Record<string, string> = {
            Lily: 'I am watering the west bed, then meeting Finn in the gazebo to compare leaves.',
            Finn: 'The pond is full of tiny ripples. After I watch them, I am joining the garden ball game.',
            Zoe: 'I checked the tall flowers and carried the watering can back along the path.',
            'Ms. Harper': 'I am supervising the planting beds, pond edge, and gazebo path. Everyone has a clear route.',
          };
          setActiveDialogue({ name, text: gardenDialogue[name] ?? 'The Garden has something new to notice at every stop.' });
        } else if (activeInteractable.startsWith('route-')) {
          const routeId = activeInteractable.replace('route-', '');
          const route = HUB_ROUTES.find((candidate) => candidate.id === routeId);
          if (route) {
            const unlocked = isRouteUnlocked(route, progression);
            if (route.id === 'garden-district' && unlocked) {
              enterGarden();
            } else {
              setActiveDialogue({
                name: route.label,
                text: unlocked
                  ? `${route.description} This route is prepared, but it is not open yet.`
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
  }, [subscribe, activeInteractable, schedule, activeDialogue, isRiding, juiceStock, crackerStock, waitingCustomers, inventory, progression, quests, zoneTransitioning, gardenActivityStep]);

  const handleTeacherInteraction = (name: string) => {
    if (name === 'Mr. Davis') {
      if (objectiveIsActive(quests, 'where-binky', 'search-storage')) {
        setActiveDialogue({ name, text: 'I moved a small pink toy to the Storage Room for safekeeping. Check the grounded boxes along the back wall.' });
      } else if (schedule === 'outdoor-play') {
        setActiveDialogue({ name, text: isRainy ? 'Rain plan today: I am checking the reading and building corners.' : 'I am patrolling the playground fence and keeping the gate paths clear.' });
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
                useGameStore.setState(s => ({ collectibles: s.collectibles.filter(c => c !== 'Shiny Rock') }));
                advanceQuestObjective('where-binky', 'trade-with-sam');
                setActiveDialogue({ name: 'Sam', text: "Thanks! I saw Mr. Davis put something pink in the Storage Room boxes." });
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

  const formatTime = (time: number) => {
    const hours = Math.floor(time);
    const minutes = Math.floor((time - hours) * 60);
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours > 12 ? hours - 12 : hours;
    return `${displayHours}:${minutes === 0 ? '00' : minutes} ${ampm}`;
  };

  const getScheduleLabel = (s: string) => {
    return s.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  };

  const getInteractionLabel = () => {
    if (activeDialogue?.options) return null;
    if (activeDialogue) return 'Continue';
    if (isRiding) return 'Dismount';
    if (!activeInteractable) return null;
    if (activeInteractable === 'binky') return 'Pick up Binky';
    if (activeInteractable === 'juice-stand') return schedule === 'juice-club' ? 'Use Juice Stand' : 'Check Juice Stand';
    if (activeInteractable === 'tricycle') return 'Use Tricycle';
    if (activeInteractable === 'activity-rainbow-tidy-up') return 'Place Toy';
    if (activeInteractable === 'garden-return') return 'Return to DayKare';
    if (activeInteractable === 'garden-activity-host') {
      if (gardenActivityStep === 0) return 'Start Planting';
      if (gardenActivityStep < 3) return `Tend Seedlings · ${gardenActivityStep}/3`;
      return 'Plant Another Bed';
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
  const gameplayBlocked = journalOpen || Boolean(activeDialogue) || zoneTransitioning;

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
            <div className="text-sm font-medium text-muted-foreground">{getScheduleLabel(schedule)} {isRainy && "(Indoor)"}</div>
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
            +1.5h
          </button>
          <button 
            onClick={toggleRain}
            disabled={gameplayBlocked}
            className="bg-card/90 backdrop-blur p-2 rounded-lg shadow hover:bg-card border-2 border-transparent hover:border-blue-400/30 transition-all pointer-events-auto text-blue-500"
            title="Toggle Rain"
          >
            {isRainy ? <CloudRain className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
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
          <div className="max-w-xs bg-card/92 backdrop-blur border-2 border-amber-400/35 p-3 rounded-xl shadow-lg flex gap-3 items-start">
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

      {/* Teacher Suspicion */}
      {teacherSuspicion > 0 && (
        <div className="daykare-suspicion absolute top-6 left-1/2 -translate-x-1/2 bg-red-500/90 text-white px-6 py-2 rounded-full font-bold shadow-lg flex items-center gap-2">
          <AlertTriangle className="w-5 h-5" />
          Teacher Suspicion: {Math.round(teacherSuspicion)}%
        </div>
      )}

      {/* HUD - Top Right */}
      <div className="daykare-hud-right absolute top-6 right-6 flex flex-col items-end gap-3 pointer-events-auto">
        <button 
          onClick={toggleJournal}
          disabled={Boolean(activeDialogue) || zoneTransitioning}
          className="bg-card/90 backdrop-blur border-2 border-primary/20 p-3 rounded-xl shadow-lg flex items-center gap-3 hover:scale-105 transition-transform"
        >
          <span className="font-bold hidden sm:block">Journal (J)</span>
          <Book className="w-6 h-6 text-primary" />
        </button>

        <div className="daykare-progress-chip bg-card/90 backdrop-blur border-2 border-amber-400/25 px-3 py-2 rounded-xl shadow flex items-center gap-3 text-card-foreground">
          <div className="flex items-center gap-1 font-bold text-amber-700">
            <Star className="w-4 h-4 fill-amber-400 text-amber-500" />
            {progression.tokens}
          </div>
          <div className="w-px h-4 bg-amber-300/50" />
          <div className="text-xs font-bold text-muted-foreground">{progression.reputation} REP</div>
        </div>

        <div className="bg-card/90 backdrop-blur border-2 border-emerald-500/25 px-3 py-2 rounded-xl shadow flex items-center gap-2 text-card-foreground">
          <MapPinned className="w-4 h-4 text-emerald-600" />
          <span className="text-xs font-black uppercase tracking-wide">{zone === 'garden' ? 'Garden District' : 'DayKare Hub'}</span>
        </div>
        
        {schedule === 'juice-club' && (
          <div className="bg-card/90 backdrop-blur border-2 border-green-500/20 p-3 rounded-xl shadow flex flex-col items-end text-green-600 font-bold">
            <div className="flex items-center gap-2 text-lg">
              <DollarSign className="w-5 h-5" />
              <span>{juiceClubCash}.00</span>
            </div>
            {waitingCustomers.length > 0 && (
              <div className="text-xs text-orange-600 animate-pulse mt-1">Customer waiting!</div>
            )}
          </div>
        )}
      </div>

      {ambientMessage && !activeDialogue && !journalOpen && !zoneTransitioning && (
        <div className="absolute top-28 left-1/2 -translate-x-1/2 max-w-md rounded-full bg-[#fff8e8]/94 border-2 border-[#e6ae2f]/45 px-5 py-3 text-sm font-bold text-[#5c3a21] shadow-xl" role="status" aria-live="polite">
          {ambientMessage}
        </div>
      )}

      {/* Dialogue Overlay */}
      {activeDialogue && (
        <div
          className="daykare-dialogue absolute bottom-12 left-1/2 -translate-x-1/2 w-full max-w-2xl bg-card border-4 border-primary p-6 rounded-2xl shadow-2xl animate-in slide-in-from-bottom-8 pointer-events-auto z-20"
          role="dialog"
          aria-modal="true"
          aria-label={`${activeDialogue.name} dialogue`}
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
        <div className="daykare-journal-shell absolute inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center pointer-events-auto z-50 p-4">
          <div className="daykare-journal-book bg-[#fcf8f2] w-full max-w-5xl h-[85vh] rounded-3xl shadow-2xl flex overflow-hidden border-8 border-[#8b5a2b]">
            {/* Left Page */}
            <div className="flex-1 p-8 border-r border-[#d4c3b3] relative overflow-y-auto">
              <div className="flex justify-between items-center mb-6">
                <h2 className="font-serif text-4xl font-bold text-[#5c3a21]">My Journal</h2>
                <div className="text-sm font-bold text-green-600 bg-green-100 px-3 py-1 rounded-full">Auto-Saved</div>
              </div>
              
              <div className="space-y-6">
                <div className="bg-white/50 p-4 rounded-xl border border-[#e5d8cc]">
                  <h3 className="font-bold text-xl mb-2 flex items-center gap-2">
                    <Backpack className="w-5 h-5 text-orange-600" /> Backpack
                  </h3>
                  <div className="flex flex-wrap gap-4">
                    <div className="flex-1">
                      <div className="text-sm text-muted-foreground mb-1">Items</div>
                      <div className="flex flex-wrap gap-2">
                        {inventory.length === 0 && <span className="text-sm italic">Empty...</span>}
                        {inventory.map(item => (
                          <span key={item} className="bg-orange-100 text-orange-900 px-3 py-1 rounded-full text-sm font-bold border border-orange-300">
                            {item}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex-1">
                      <div className="text-sm text-muted-foreground mb-1">Collectibles</div>
                      <div className="flex flex-wrap gap-2">
                        {collectibles.length === 0 && <span className="text-sm italic">Empty...</span>}
                        {collectibles.map(item => (
                          <span key={item} className="bg-purple-100 text-purple-900 px-3 py-1 rounded-full text-sm font-bold border border-purple-300">
                            {item}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-amber-50/80 p-4 rounded-xl border border-amber-200">
                  <h3 className="font-bold text-xl mb-3 flex items-center gap-2 text-[#5c3a21]">
                    <Trophy className="w-5 h-5 text-amber-600" /> Hub Progress
                  </h3>
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <div className="bg-white/70 p-2 rounded-lg text-center">
                      <div className="text-xl font-black text-amber-700">{progression.reputation}</div>
                      <div className="text-[10px] uppercase font-bold text-amber-900/60">Reputation</div>
                    </div>
                    <div className="bg-white/70 p-2 rounded-lg text-center">
                      <div className="text-xl font-black text-amber-700">{progression.tokens}</div>
                      <div className="text-[10px] uppercase font-bold text-amber-900/60">Star Tokens</div>
                    </div>
                    <div className="bg-white/70 p-2 rounded-lg text-center">
                      <div className="text-xl font-black text-amber-700">{progression.activityRuns['rainbow-tidy-up'] ?? 0}</div>
                      <div className="text-[10px] uppercase font-bold text-amber-900/60">Tidy Rounds</div>
                    </div>
                  </div>
                  <div className="text-sm text-amber-950/75 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-500" />
                    Repeat activities, help friends, and run the Juice Club to prepare new routes.
                  </div>
                  <img
                    src={`${import.meta.env.BASE_URL}daykare-assets/20_reward_stickers.png`}
                    alt="DayKare reward sticker collection"
                    className="mt-3 w-full max-h-28 object-cover rounded-lg border border-amber-200"
                  />
                  <div className="mt-3 p-3 rounded-lg bg-white/70 border border-amber-200">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-black text-[#5c3a21]">Lost & Found Organizer</div>
                        <div className="text-xs text-amber-950/70">
                          Sends dropped quest toys to a visible recovery shelf. Costs 6 Star Tokens.
                        </div>
                      </div>
                      <button
                        onClick={() => buyHubUpgrade('storage-organizer', 6)}
                        disabled={!progression.trustedHelperPass || progression.tokens < 6 || progression.hubUpgrades.includes('storage-organizer')}
                        className="shrink-0 bg-amber-500 text-white px-3 py-2 rounded-lg text-xs font-black disabled:opacity-45"
                      >
                        {progression.hubUpgrades.includes('storage-organizer')
                          ? 'Installed'
                          : progression.trustedHelperPass
                            ? 'Buy · 6 ★'
                            : 'Helper Pass required'}
                      </button>
                    </div>
                  </div>
                  {progression.trustedHelperPass && (
                    <div className="mt-2 text-xs font-bold text-green-700 bg-green-100 px-3 py-2 rounded-lg">
                      Trusted Helper Pass: storage access approved.
                    </div>
                  )}
                </div>

                <div className="bg-white/50 p-4 rounded-xl border border-[#e5d8cc]">
                  <h3 className="font-bold text-xl mb-3">Quests & Activities</h3>
                  <div className="space-y-3">
                    {QUEST_DEFINITIONS.map((definition) => {
                      const quest = quests[definition.id];
                      const objective = getCurrentObjective(quests, definition.id);
                      return (
                        <div key={definition.id} className={`p-3 rounded-xl border ${quest.status === 'active' ? 'bg-orange-50 border-orange-200' : 'bg-white/70 border-[#e5d8cc]'}`}>
                          <div className="flex items-center justify-between gap-2">
                            <div className="font-black text-[#5c3a21]">{definition.title}</div>
                            <span className="text-[10px] font-black uppercase tracking-wider bg-[#e5d8cc] px-2 py-1 rounded">
                              {quest.status}{definition.repeatable && quest.completionCount > 0 ? ` · ${quest.completionCount} done` : ''}
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">{definition.summary}</div>
                          {objective && (
                            <div className="mt-2 text-sm text-orange-900">
                              <strong>{objective.label}</strong> — {objective.guidance}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="bg-white/50 p-4 rounded-xl border border-[#e5d8cc]">
                  <h3 className="font-bold text-xl mb-2 flex items-center gap-2">
                    <DollarSign className="w-5 h-5 text-green-600" /> Business: Juice Club
                  </h3>
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div className="bg-green-50 p-2 rounded border border-green-200">
                      <div className="text-xs text-green-700">Cash</div>
                      <div className="font-bold">${juiceClubCash}.00</div>
                    </div>
                    <div className="bg-orange-50 p-2 rounded border border-orange-200">
                      <div className="text-xs text-orange-700">Stock</div>
                      <div className="font-bold">{juiceStock} Juice, {crackerStock} Crackers</div>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="text-sm font-bold mb-1">Supplies & Upgrades</div>
                    <div className="flex justify-between items-center text-sm border-b border-gray-200 pb-1">
                      <span>Restock (5 Juice & Crackers) - $2</span>
                      <button 
                        onClick={() => buyStock('juice', 2, 5)}
                        disabled={juiceClubCash < 2}
                        className="bg-green-500 text-white px-2 py-1 rounded disabled:opacity-50"
                      >Buy</button>
                    </div>
                    <div className="flex justify-between items-center text-sm border-b border-gray-200 pb-1">
                      <span>Premium Cups (Double Earnings) - $10</span>
                      <button 
                        onClick={() => buyUpgrade('premium-cups', 10)}
                        disabled={juiceClubCash < 10 || juiceUpgrades.includes('premium-cups')}
                        className="bg-green-500 text-white px-2 py-1 rounded disabled:opacity-50"
                      >
                        {juiceUpgrades.includes('premium-cups') ? 'Bought' : 'Buy'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="absolute bottom-4 left-8 text-[#d4c3b3] font-serif italic">Page 1</div>
            </div>
            
            {/* Right Page */}
            <div className="flex-1 p-8 relative bg-texture-paper overflow-y-auto">
              <h2 className="font-serif text-4xl font-bold text-[#5c3a21] mb-6">Friends & Map</h2>
              
              <div className="bg-[#e9e0d3] p-4 rounded-xl aspect-video border-2 border-[#c2b2a1] mb-6 flex items-center justify-center relative overflow-hidden">
                <div className="text-[#8b5a2b] font-bold opacity-50 rotate-[-10deg] text-xl">Campus Map</div>
                <div className="absolute top-1/4 left-1/4 w-1/4 h-1/4 border-2 border-[#8b5a2b] bg-[#c2b2a1]/20 rounded flex items-center justify-center text-xs text-[#8b5a2b]">Art</div>
                <div className="absolute bottom-1/4 left-1/4 w-1/4 h-1/4 border-2 border-[#8b5a2b] bg-[#c2b2a1]/20 rounded flex items-center justify-center text-xs text-[#8b5a2b]">Storage</div>
                <div className="absolute top-1/4 right-1/4 w-1/3 h-1/2 border-2 border-[#8b5a2b] bg-[#c2b2a1]/20 rounded flex items-center justify-center text-xs text-[#8b5a2b]">Playground</div>
              </div>

              <div className="mb-7">
                <h3 className="font-bold text-xl mb-3 text-[#5c3a21] flex items-center gap-2">
                  <MapPinned className="w-5 h-5 text-purple-600" /> Future Routes
                </h3>
                <div className="space-y-2">
                  {HUB_ROUTES.map((route) => {
                    const unlocked = isRouteUnlocked(route, progression);
                    return (
                      <div key={route.id} className={`p-3 rounded-xl border flex items-start gap-3 ${unlocked ? 'bg-green-50 border-green-200' : 'bg-white/60 border-[#e5d8cc]'}`}>
                        <div className={`w-9 h-9 shrink-0 rounded-lg grid place-items-center ${unlocked ? 'bg-green-100 text-green-700' : 'bg-stone-100 text-stone-500'}`}>
                          {unlocked ? <CheckCircle2 className="w-5 h-5" /> : <LockKeyhole className="w-5 h-5" />}
                        </div>
                        <div className="min-w-0">
                          <div className="font-bold text-sm text-[#5c3a21]">{route.label}</div>
                          <div className="text-xs text-muted-foreground">{unlocked ? 'Prepared for future expansion' : requirementLabel(route)}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <h3 className="font-bold text-xl mb-3 text-[#5c3a21] flex items-center gap-2">
                  <Heart className="w-5 h-5 text-red-500" /> Friends Met
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  {Object.entries(friends).map(([name, data]) => (
                    <div key={name} className="bg-white/60 p-3 rounded-lg border border-[#e5d8cc] flex items-center gap-3">
                      <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center font-bold text-orange-800 shrink-0">
                        {name[0]}
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold text-sm truncate">{name}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {data.mood} • {data.friendship}%
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-8 flex justify-center">
                 <button onClick={() => useGameStore.getState().resetGame()} className="text-red-500 text-sm hover:underline">
                   Reset Save Data
                 </button>
              </div>

              <div className="absolute bottom-4 right-8 text-[#d4c3b3] font-serif italic">Page 2</div>
              <button 
                onClick={toggleJournal}
                className="absolute top-6 right-6 bg-[#5c3a21] text-white px-4 py-2 rounded-full font-bold shadow-md hover:scale-105 transition-transform"
              >
                Close
              </button>
            </div>
          </div>
        </div>
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