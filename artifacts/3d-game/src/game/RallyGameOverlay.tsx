import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import {
  RALLY_CONFIGS,
  createRally,
  createRallyMatchId,
  moveRallyPaddle,
  stepRally,
  type RallyId,
  type RallyState,
} from "./rallyGame";
import { useFinalMasterStore } from "./finalMasterStore";
import { playGameSound } from "./audio";

export function RallyGameOverlay({
  id,
  onClose,
}: {
  id: RallyId;
  onClose: () => void;
}) {
  const config = RALLY_CONFIGS[id],
    record = useFinalMasterStore((s) => s.recordRallyResult),
    award = useFinalMasterStore((s) => s.awardRallyWin),
    best = useFinalMasterStore((s) => s.rallyBest[id] ?? 0);
  const state = useRef<RallyState>(createRally()),
    matchId = useRef(createRallyMatchId(id)),
    axis = useRef(0),
    ball = useRef<HTMLDivElement>(null),
    player = useRef<HTMLDivElement>(null),
    npc = useRef<HTMLDivElement>(null),
    banked = useRef(false);
  const [view, setView] = useState(() => createRally());
  useEffect(() => {
    useFinalMasterStore.getState().setRallyGameOpen(true);
    return () => useFinalMasterStore.getState().setRallyGameOpen(false);
  }, []);
  useEffect(() => {
    let frame = 0,
      last = performance.now();
    const loop = () => {
      const now = performance.now(),
        delta = Math.min((now - last) / 1000, 0.05);
      last = now;
      let next = moveRallyPaddle(state.current, axis.current, delta);
      next = stepRally(next, config, delta);
      state.current = next;
      if (next.returnedThisStep) playGameSound("pickup", "interaction");
      if (next.missedThisStep || next.npcMissedThisStep)
        playGameSound("door", "interaction");
      if (ball.current) {
        ball.current.style.left = `${(next.ballX * 0.5 + 0.5) * 100}%`;
        ball.current.style.bottom = `${next.ballY * 82 + 9}%`;
      }
      if (player.current)
        player.current.style.left = `${(next.paddleX * 0.5 + 0.5) * 100}%`;
      if (npc.current)
        npc.current.style.left = `${(next.npcPaddleX * 0.5 + 0.5) * 100}%`;
      setView((v) =>
        v.rally === next.rally &&
        v.playerScore === next.playerScore &&
        v.npcScore === next.npcScore &&
        v.over === next.over
          ? v
          : { ...next },
      );
      if (next.over && !banked.current) {
        banked.current = true;
        record(id, next.bestRally, 0);
        if (next.winner === "player") award(id, matchId.current);
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [award, config, id, record]);
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
        if (e.key === "Escape") onClose();
        if (e.key === "ArrowLeft" || e.key.toLowerCase() === "a")
          axis.current = -1;
        if (e.key === "ArrowRight" || e.key.toLowerCase() === "d")
          axis.current = 1;
      },
      up = (e: KeyboardEvent) => {
        if (["arrowleft", "arrowright", "a", "d"].includes(e.key.toLowerCase()))
          axis.current = 0;
      };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [onClose]);
  const drag = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect(),
      wanted = ((e.clientX - r.left) / r.width) * 2 - 1;
    axis.current = (wanted - state.current.paddleX) * 8;
  };
  const restart = () => {
    state.current = createRally();
    matchId.current = createRallyMatchId(id);
    banked.current = false;
    setView({ ...state.current });
  };
  return (
    <div className="final-modal-backdrop" data-testid="rally-overlay">
      <section
        className={`daykare-rally is-${id}`}
        role="dialog"
        aria-modal="true"
        aria-label={config.label}
      >
        <header>
          <div>
            <small>{config.label} · Player vs NPC</small>
            <h2>
              You {view.playerScore}–{view.npcScore} Friend
            </h2>
            <p>
              First to {config.pointsToWin} · winner earns {config.rbReward} RB
              · best rally {Math.max(best, view.bestRally)}
            </p>
          </div>
          <button onClick={onClose} aria-label={`Leave ${config.label}`}>
            <X />
          </button>
        </header>
        <div
          className="daykare-rally-court"
          onPointerMove={drag}
          onPointerDown={drag}
          onPointerUp={() => {
            axis.current = 0;
          }}
          onPointerLeave={() => {
            axis.current = 0;
          }}
        >
          <span className="daykare-rally-net" />
          <div className="daykare-rally-ball" ref={ball} />
          <div className="daykare-rally-character is-npc" ref={npc}>
            <i />
            <b />
          </div>
          <div className="daykare-rally-character is-player" ref={player}>
            <i />
            <b />
          </div>
        </div>
        <footer>
          {view.over ? (
            <>
              <strong>
                {view.winner === "player"
                  ? `You win! +${config.rbReward} Rascal Bucks`
                  : "Friend wins — try the rematch!"}
              </strong>
              <button onClick={restart}>Play again</button>
              <button onClick={onClose}>Done</button>
            </>
          ) : (
            <span>
              Slide left/right to line up your character and racket. Arrow keys
              or touch drag.
            </span>
          )}
        </footer>
      </section>
    </div>
  );
}
