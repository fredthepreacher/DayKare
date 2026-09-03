import { useEffect, useRef } from 'react';
import {
  Play,
  Globe2,
  Wand2,
  BookOpen,
  Settings,
  Accessibility,
  X,
  ChevronRight,
  ShoppingBag,
} from 'lucide-react';

export interface GameMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onStoryMode: () => void;
  onDayKareOnline: () => void;
  onCustomize: () => void;
  onProgress: () => void;
  onShop: () => void;
  onSettings: () => void;
  onAccessibility: () => void;
  onlineSeatCount?: number;
}

export function GameMenu({
  isOpen,
  onClose,
  onStoryMode,
  onDayKareOnline,
  onCustomize,
  onProgress,
  onShop,
  onSettings,
  onAccessibility,
  onlineSeatCount
}: GameMenuProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (!isOpen) return undefined;
    const timer = window.setTimeout(() => {
      const firstBtn = panelRef.current?.querySelector<HTMLButtonElement>('[data-testid="button-story"]');
      if (firstBtn) firstBtn.focus();
    }, 100);
    return () => window.clearTimeout(timer);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const menuItems = [
    { 
      id: 'story', 
      label: 'Story Mode', 
      icon: Play, 
      onClick: onStoryMode, 
      bgClass: 'bg-[#ffad33]', 
      borderClass: 'border-[#e69519]', 
      hoverClass: 'hover:bg-[#ffb84d]', 
      titleColor: 'text-[#5c3300]', 
      description: 'Continue your DayKare adventure' 
    },
    { 
      id: 'online', 
      label: 'Multiplayer',
      icon: Globe2, 
      onClick: onDayKareOnline, 
      bgClass: 'bg-[#33cccc]', 
      borderClass: 'border-[#29b3b3]', 
      hoverClass: 'hover:bg-[#4dd2d2]', 
      titleColor: 'text-[#004d4d]', 
      description: 'Join friends in a shared 20-player room',
      extra: onlineSeatCount !== undefined ? (
        <div className="flex items-center gap-2 mt-2 text-[#004d4d] font-black text-[11px] uppercase tracking-wide bg-white/40 w-max px-3 py-1 rounded-full shadow-sm" data-testid="status-online-players">
          Up to 20 players · Friends room
        </div>
      ) : null
    },
    { 
      id: 'shop',
      label: 'Kare Shop',
      icon: ShoppingBag,
      onClick: onShop,
      bgClass: 'bg-[#b28ad6]',
      borderClass: 'border-[#9270b8]',
      hoverClass: 'hover:bg-[#c19be0]',
      titleColor: 'text-[#3e245b]',
      description: 'Care Coins, passes & optional extras'
    },
    {
      id: 'customize', 
      label: 'Customize', 
      icon: Wand2, 
      onClick: onCustomize, 
      bgClass: 'bg-[#ff66b3]', 
      borderClass: 'border-[#e64d99]', 
      hoverClass: 'hover:bg-[#ff80bf]', 
      titleColor: 'text-[#660033]', 
      description: 'Change outfits and tricycles' 
    },
    { 
      id: 'progress', 
      label: 'DayKare Tablet',
      icon: BookOpen, 
      onClick: onProgress, 
      bgClass: 'bg-[#ff8566]', 
      borderClass: 'border-[#e66a4d]', 
      hoverClass: 'hover:bg-[#ff9980]', 
      titleColor: 'text-[#661a00]', 
      description: 'Quests, stickers & progression' 
    },
  ];

  return (
    <div className="fixed inset-0 z-[100] flex pointer-events-auto daykare-menu-backdrop bg-[#4a2e1b]/40 font-sans" data-testid="overlay-game-menu">
      <div 
        ref={panelRef}
        className="w-full md:w-[440px] h-[100dvh] bg-texture-paper flex flex-col shadow-[20px_0_60px_-15px_rgba(41,27,17,0.5)] daykare-menu-panel relative z-10 md:border-r-8 border-[#8b5a2b] overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="menu-title"
      >
        <div className="p-8 pb-6 pt-12 relative flex justify-between items-start shrink-0">
          <div>
            <h1 id="menu-title" className="font-serif text-5xl font-black text-[#5c3a21] leading-none mb-2 drop-shadow-sm" data-testid="text-menu-title">
              DayKare
            </h1>
            <p className="text-[#8b5a2b] font-bold tracking-widest uppercase text-[11px]" data-testid="text-menu-subtitle">
              Campus Hub
            </p>
          </div>
          <button 
            onClick={onClose} 
            className="md:hidden w-11 h-11 flex items-center justify-center bg-[#f4ece1] text-[#8b5a2b] rounded-full border-2 border-[#d4c3b3] active:scale-95 transition-transform focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#ffad33]"
            data-testid="button-close-mobile"
            aria-label="Close menu"
          >
            <X className="w-6 h-6" strokeWidth={3} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-2 space-y-4">
          {menuItems.map((item) => (
            <button 
              key={item.id}
              onClick={item.onClick}
              className={`w-full group daykare-menu-item relative flex items-center p-4 rounded-3xl border-b-[5px] transition-all duration-200 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white focus-visible:ring-offset-4 focus-visible:ring-offset-[#fdfbf7] shadow-sm hover:shadow-md ${item.bgClass} ${item.borderClass} ${item.hoverClass}`}
              data-testid={`button-${item.id}`}
            >
              <div className="shrink-0 w-[60px] h-[60px] rounded-2xl flex items-center justify-center border-[3px] border-white/40 shadow-inner bg-white/20">
                <item.icon className="w-8 h-8 text-white drop-shadow-md" strokeWidth={2.5} />
              </div>
              <div className="ml-5 flex-1 text-left">
                <div className={`font-black text-[22px] leading-tight drop-shadow-sm ${item.titleColor}`}>
                  {item.label}
                </div>
                <div className={`font-bold text-[13.5px] mt-0.5 opacity-90 ${item.titleColor}`}>
                  {item.description}
                </div>
                {item.extra}
              </div>
              <div className="absolute right-5 opacity-0 -translate-x-4 transition-all duration-300 group-hover:opacity-100 group-hover:translate-x-0">
                <ChevronRight className={`w-8 h-8 ${item.titleColor} opacity-50`} strokeWidth={3} />
              </div>
            </button>
          ))}
        </div>

        <div className="p-6 bg-[#f4ece1] flex justify-between items-center border-t-4 border-[#d4c3b3] shrink-0">
          <div className="flex gap-3">
            <button 
              onClick={onSettings} 
              className="w-[52px] h-[52px] flex items-center justify-center bg-white text-[#8b5a2b] rounded-2xl border-b-[4px] border-[#d4c3b3] shadow-sm hover:bg-[#faf8f5] active:scale-95 transition-all focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#ffad33] focus-visible:ring-offset-2 focus-visible:ring-offset-[#f4ece1]" 
              data-testid="button-settings" 
              aria-label="Settings"
            >
              <Settings className="w-6 h-6" strokeWidth={2.5} />
            </button>
            <button 
              onClick={onAccessibility} 
              className="w-[52px] h-[52px] flex items-center justify-center bg-white text-[#8b5a2b] rounded-2xl border-b-[4px] border-[#d4c3b3] shadow-sm hover:bg-[#faf8f5] active:scale-95 transition-all focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#ffad33] focus-visible:ring-offset-2 focus-visible:ring-offset-[#f4ece1]" 
              data-testid="button-accessibility" 
              aria-label="Accessibility"
            >
              <Accessibility className="w-6 h-6" strokeWidth={2.5} />
            </button>
          </div>
          <button 
            onClick={onClose} 
            className="px-8 h-[52px] flex items-center justify-center bg-[#5c3a21] text-white font-black text-[15px] uppercase tracking-wider rounded-2xl shadow-md border-b-[4px] border-[#3a2212] hover:bg-[#4a2e1b] active:scale-95 transition-all focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#5c3a21] focus-visible:ring-offset-2 focus-visible:ring-offset-[#f4ece1]" 
            data-testid="button-resume"
          >
            Resume
          </button>
        </div>
      </div>
      
      <div 
        className="hidden md:flex flex-1 items-start justify-end p-8 cursor-pointer" 
        onClick={onClose} 
        data-testid="click-dismiss-area"
        aria-hidden="true"
      >
        <button 
          onClick={onClose} 
          className="bg-white/10 hover:bg-white/20 text-white rounded-full p-4 backdrop-blur-md transition-transform active:scale-95 border border-white/20 shadow-lg focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white" 
          data-testid="button-close-hub" 
          aria-label="Close Hub"
        >
          <X className="w-8 h-8" strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
}
