import { useGameStore } from './store';
import { useEffect, useRef } from 'react';
import { useKeyboardControls } from '@react-three/drei';
import { Controls } from './Controls';
import { Clock, Book, CloudRain, Sun, Wand2, Backpack, DollarSign, Heart, AlertTriangle } from 'lucide-react';
import { TouchControls } from './TouchControls';

export function UI() {
  const {
    timeOfDay,
    schedule,
    isRainy,
    isImaginationMode,
    activeInteractable,
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
    addWaitingCustomer,
    setIsRiding,
    isRiding
  } = useGameStore();

  const [subscribe] = useKeyboardControls<Controls>();
  const interactRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    return subscribe(
      (state) => state.journal,
      (pressed) => {
        if (pressed && !activeDialogue) toggleJournal();
      }
    );
  }, [subscribe, toggleJournal, activeDialogue]);

  // Juice Club Customers Simulation
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (schedule === 'juice-club') {
      // Add a customer every 10 seconds if none waiting
      interval = setInterval(() => {
        const potentialCustomers = ['Max', 'Noah', 'Zoe'];
        const randomCustomer = potentialCustomers[Math.floor(Math.random() * potentialCustomers.length)];
        useGameStore.getState().addWaitingCustomer(randomCustomer);
      }, 10000);
    }
    return () => clearInterval(interval);
  }, [schedule]);

  useEffect(() => {
    const runInteraction = () => {
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
          updateBinkyStatus('found');
          pickUp('binky');
          setActiveDialogue({ name: 'System', text: 'You found Binky! Return it to Leo.' });
        } else if (activeInteractable === 'blue-block' || activeInteractable === 'red-block') {
          pickUp(activeInteractable);
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
                        setActiveDialogue({ name: 'System', text: 'Served juice to a happy customer!' });
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
        } else if (activeInteractable.startsWith('kid-')) {
          const kidName = activeInteractable.split('-')[1];
          handleKidInteraction(kidName);
        }
      } else if (inventory.length > 0) {
        const item = inventory[0];
        drop(item);
        setActiveDialogue({ name: 'System', text: `Dropped ${item}.` });
      }
    };

    interactRef.current = runInteraction;
    return subscribe(
      (state) => state.interact,
      (pressed) => {
        if (pressed) runInteraction();
      },
    );
  }, [subscribe, activeInteractable, schedule, activeDialogue, isRiding, juiceStock, crackerStock, waitingCustomers, inventory]);

  const handleKidInteraction = (name: string) => {
    // Binky Quest Logic
    if (name === 'Leo') {
      if (binkyStatus === 'not-started') {
        updateBinkyStatus('talked-to-owner');
        setActiveDialogue({ name: 'Leo', text: "I lost Binky! He's pink and round. I think Mia saw something." });
      } else if (binkyStatus === 'found') {
        updateBinkyStatus('returned-good');
        drop('binky');
        updateFriend('Leo', { friendship: 100, mood: 'happy', recentMemory: 'Got Binky back!' });
        setActiveDialogue({ name: 'Leo', text: "BINKY! Thank you so much! You're my best friend." });
      } else if (binkyStatus === 'returned-good') {
        setActiveDialogue({ name: 'Leo', text: "Binky says hi!" });
      } else {
        setActiveDialogue({ name: 'Leo', text: "Please find Binky..." });
      }
    } else if (name === 'Mia') {
      if (binkyStatus === 'talked-to-owner') {
        updateBinkyStatus('found-clue');
        setActiveDialogue({ name: 'Mia', text: "I saw Sam taking a shiny rock near the playground." });
      } else {
        setActiveDialogue({ name: 'Mia', text: "I like shiny things." });
      }
    } else if (name === 'Sam') {
      if (binkyStatus === 'found-clue') {
        if (collectibles.includes('Shiny Rock')) {
          setActiveDialogue({
            name: 'Sam',
            text: "I'll tell you what I saw if you give me a Shiny Rock.",
            options: [
              { label: 'Trade Rock', action: () => {
                useGameStore.setState(s => ({ collectibles: s.collectibles.filter(c => c !== 'Shiny Rock') }));
                updateBinkyStatus('traded-info');
                setActiveDialogue({ name: 'Sam', text: "Thanks! I saw Mr. Davis put something pink in the Storage Room boxes." });
              }},
              { label: 'Keep it', action: () => setActiveDialogue(null) }
            ]
          });
        } else {
          setActiveDialogue({ name: 'Sam', text: "I want a Shiny Rock." });
        }
      } else if (binkyStatus === 'traded-info') {
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
    if (!activeInteractable) return inventory.length > 0 ? `Drop ${inventory[0]}` : null;
    if (activeInteractable === 'binky') return 'Pick up Binky';
    if (activeInteractable === 'juice-stand') return schedule === 'juice-club' ? 'Use Juice Stand' : 'Check Juice Stand';
    if (activeInteractable === 'tricycle') return 'Use Tricycle';
    if (activeInteractable.startsWith('kid-')) return `Talk to ${activeInteractable.split('-')[1]}`;
    if (activeInteractable.includes('block')) return 'Pick up Toy';
    return 'Interact';
  };

  const interactionLabel = getInteractionLabel();

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
        </div>

        <div className="flex gap-2">
          <button 
            onClick={advanceSchedule}
            className="bg-card/90 backdrop-blur px-3 py-2 rounded-lg text-sm font-bold shadow hover:bg-card border-2 border-transparent hover:border-primary/20 transition-all pointer-events-auto"
          >
            +1.5h
          </button>
          <button 
            onClick={toggleRain}
            className="bg-card/90 backdrop-blur p-2 rounded-lg shadow hover:bg-card border-2 border-transparent hover:border-blue-400/30 transition-all pointer-events-auto text-blue-500"
            title="Toggle Rain"
          >
            {isRainy ? <CloudRain className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
          </button>
          <button 
            onClick={toggleImagination}
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
            className="bg-card/90 backdrop-blur px-3 py-2 rounded-lg text-sm font-bold shadow hover:bg-card border-2 border-transparent hover:border-gray-400/30 transition-all pointer-events-auto text-gray-700"
            title="Quality Toggle"
          >
            {useGameStore.getState().quality === 'high' ? 'HQ' : 'LQ'}
          </button>
        </div>
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
          className="bg-card/90 backdrop-blur border-2 border-primary/20 p-3 rounded-xl shadow-lg flex items-center gap-3 hover:scale-105 transition-transform"
        >
          <span className="font-bold hidden sm:block">Journal (J)</span>
          <Book className="w-6 h-6 text-primary" />
        </button>
        
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

      {/* Dialogue Overlay */}
      {activeDialogue && (
        <div className="daykare-dialogue absolute bottom-12 left-1/2 -translate-x-1/2 w-full max-w-2xl bg-card border-4 border-primary p-6 rounded-2xl shadow-2xl animate-in slide-in-from-bottom-8 pointer-events-auto">
          <div className="font-serif font-bold text-2xl text-primary mb-2">{activeDialogue.name}</div>
          <div className="text-lg text-card-foreground mb-4">{activeDialogue.text}</div>
          
          {activeDialogue.options ? (
            <div className="flex gap-4">
              {activeDialogue.options.map((opt, i) => (
                <button 
                  key={i}
                  onClick={opt.action}
                  className="bg-primary/10 hover:bg-primary/20 text-primary font-bold py-2 px-4 rounded-lg transition-colors border border-primary/30"
                >
                  {opt.label}
                </button>
              ))}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground animate-pulse mt-4 flex items-center gap-2">
              <span className="bg-muted px-2 py-1 rounded">E</span> to close
            </div>
          )}
        </div>
      )}

      {/* Interaction Prompt - Bottom Center */}
      {activeInteractable && !journalOpen && !activeDialogue && (
        <div className="daykare-desktop-interact absolute bottom-12 left-1/2 -translate-x-1/2 bg-card border-2 border-primary p-4 rounded-2xl shadow-xl flex items-center gap-4 animate-in slide-in-from-bottom-4">
          <div className="bg-primary text-primary-foreground font-mono font-bold w-10 h-10 rounded-lg flex items-center justify-center text-xl shadow-inner">
            E
          </div>
          <div className="text-lg font-bold text-card-foreground">
            {activeInteractable === 'binky' && "Pick up Binky"}
            {activeInteractable === 'juice-stand' && schedule === 'juice-club' && "Manage Juice Stand"}
            {activeInteractable === 'juice-stand' && schedule !== 'juice-club' && "Juice Club is closed"}
            {activeInteractable === 'tricycle' && "Interact with Tricycle"}
            {activeInteractable.startsWith('kid-') && `Talk to ${activeInteractable.split('-')[1]}`}
            {activeInteractable.includes('block') && "Pick up Toy"}
          </div>
        </div>
      )}

      {/* Dismount Prompt */}
      {isRiding && (
        <div className="daykare-desktop-interact absolute bottom-12 left-1/2 -translate-x-1/2 bg-card border-2 border-primary p-4 rounded-2xl shadow-xl flex items-center gap-4 animate-in slide-in-from-bottom-4">
          <div className="bg-primary text-primary-foreground font-mono font-bold w-10 h-10 rounded-lg flex items-center justify-center text-xl shadow-inner">
            E
          </div>
          <div className="text-lg font-bold text-card-foreground">Dismount</div>
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

                <div className="bg-white/50 p-4 rounded-xl border border-[#e5d8cc]">
                  <h3 className="font-bold text-xl mb-2">Quest: Where's Binky?</h3>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm font-bold uppercase text-[#5c3a21] tracking-wider bg-[#e5d8cc] px-2 py-1 rounded">
                      {binkyStatus.replace(/-/g, ' ')}
                    </span>
                  </div>
                  <ul className="text-sm space-y-1 list-disc pl-4 text-orange-900">
                    {binkyStatus === 'not-started' && <li>Talk to kids to see if anyone lost something.</li>}
                    {binkyStatus === 'talked-to-owner' && <li>Leo lost Binky. Mia might know something.</li>}
                    {binkyStatus === 'found-clue' && <li>Mia said Sam saw something. Talk to Sam.</li>}
                    {binkyStatus === 'traded-info' && <li>Sam said Mr. Davis put something in the Storage Room. Sneak in!</li>}
                    {binkyStatus === 'found' && <li>I found Binky! Return it to Leo.</li>}
                    {binkyStatus === 'returned-good' && <li className="text-green-700">Mission Complete! Leo is happy.</li>}
                  </ul>
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
        movementEnabled={!journalOpen && !activeDialogue}
        interactionLabel={journalOpen ? null : interactionLabel}
        onInteract={() => interactRef.current()}
      />

      {/* Controls Legend */}
      {!journalOpen && (
        <div className="daykare-desktop-only absolute bottom-6 right-6 bg-black/50 backdrop-blur text-white p-4 rounded-xl text-xs font-mono space-y-2 pointer-events-none">
          <div className="flex justify-between gap-4"><span>Move</span> <span className="text-gray-300">Arrows / WASD</span></div>
          <div className="flex justify-between gap-4"><span>Jump</span> <span className="text-gray-300">Space</span></div>
          <div className="flex justify-between gap-4"><span>Run</span> <span className="text-gray-300">Shift</span></div>
          <div className="flex justify-between gap-4"><span>Crouch</span> <span className="text-gray-300">C</span></div>
          <div className="flex justify-between gap-4"><span>Interact</span> <span className="text-gray-300">E</span></div>
          <div className="flex justify-between gap-4"><span>Journal</span> <span className="text-gray-300">J/Tab</span></div>
        </div>
      )}
    </div>
  );
}