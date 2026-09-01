import { useCallback, useMemo, useRef, useState } from 'react';
import { useGameStore } from './store';
import {
  buildMapView,
  clampPan,
  clampZoom,
  visibleViewBox,
  MAX_MAP_ZOOM,
  MIN_MAP_ZOOM,
  type MapPin,
} from './worldMap';

/**
 * The Journal map.
 *
 * Pan and zoom are implemented with pointer events rather than a library so the
 * whole thing stays inside the existing bundle, and so two-finger pinch and
 * one-finger drag can share the same handlers on a phone.
 *
 * There is deliberately no fast travel here. Tapping a pin tells you where the
 * place is; it does not take you there. District travel stays diegetic through
 * the world's own gates, which is a decision the HUD zone readout is also
 * pinned to.
 */

const PIN_STYLE: Record<MapPin['kind'], { fill: string; ring: string }> = {
  activity: { fill: '#e8833a', ring: '#fff4e6' },
  business: { fill: '#2f9e8f', ring: '#e6f6f3' },
  'route-open': { fill: '#4d9a73', ring: '#e8f5ee' },
  'route-locked': { fill: '#a89684', ring: '#f1ebe4' },
  landmark: { fill: '#6f62b5', ring: '#eeebfa' },
  player: { fill: '#d94f6a', ring: '#ffffff' },
};

export function WorldMap() {
  const zone = useGameStore((state) => state.zone);
  const progression = useGameStore((state) => state.progression);
  const playerPosition = useGameStore((state) => state.playerPosition);

  const [zoom, setZoom] = useState(MIN_MAP_ZOOM);
  const [pan, setPan] = useState({ x: 0, z: 0 });
  const [selected, setSelected] = useState<string | null>(null);

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchDistance = useRef(0);
  const surfaceRef = useRef<SVGSVGElement | null>(null);

  const view = useMemo(
    () => buildMapView({
      zone,
      progression,
      playerX: playerPosition[0],
      playerZ: playerPosition[2],
    }),
    [zone, progression, playerPosition],
  );

  const box = visibleViewBox(view, zoom, pan.x, pan.z);

  const applyZoom = useCallback((next: number) => {
    setZoom(() => {
      const clamped = clampZoom(next);
      setPan((current) => ({
        x: clampPan(current.x, view.viewBox.width, clamped),
        z: clampPan(current.z, view.viewBox.height, clamped),
      }));
      return clamped;
    });
  }, [view.viewBox.height, view.viewBox.width]);

  /** World units travelled per screen pixel at the current zoom. */
  const worldPerPixel = useCallback(() => {
    const rect = surfaceRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 0;
    return view.viewBox.width / zoom / rect.width;
  }, [view.viewBox.width, zoom]);

  const onPointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    event.currentTarget.setPointerCapture(event.pointerId);
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinchDistance.current = Math.hypot(a.x - b.x, a.y - b.y);
    }
  };

  const onPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const previous = pointers.current.get(event.pointerId);
    if (!previous) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchDistance.current > 0 && distance > 0) {
        applyZoom(zoom * (distance / pinchDistance.current));
      }
      pinchDistance.current = distance;
      return;
    }

    const scale = worldPerPixel();
    if (scale === 0) return;
    const dx = (event.clientX - previous.x) * scale;
    const dz = (event.clientY - previous.y) * scale;
    setPan((current) => ({
      x: clampPan(current.x - dx, view.viewBox.width, zoom),
      z: clampPan(current.z - dz, view.viewBox.height, zoom),
    }));
  };

  const endPointer = (event: React.PointerEvent<SVGSVGElement>) => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinchDistance.current = 0;
  };

  const reset = () => {
    setZoom(MIN_MAP_ZOOM);
    setPan({ x: 0, z: 0 });
    setSelected(null);
  };

  const selectedPin = view.pins.find((pin) => pin.id === selected) ?? null;

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="text-[10px] uppercase font-black tracking-widest text-amber-900/60">
          {view.zoneLabel}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => applyZoom(zoom - 0.5)}
            disabled={zoom <= MIN_MAP_ZOOM}
            aria-label="Zoom out"
            className="daykare-map-button"
          >
            −
          </button>
          <button
            type="button"
            onClick={() => applyZoom(zoom + 0.5)}
            disabled={zoom >= MAX_MAP_ZOOM}
            aria-label="Zoom in"
            className="daykare-map-button"
          >
            +
          </button>
          <button type="button" onClick={reset} className="daykare-map-button daykare-map-button-wide">
            Reset
          </button>
        </div>
      </div>

      <div className="daykare-map-frame">
        <svg
          ref={surfaceRef}
          className="daykare-map-surface"
          viewBox={`${box.minX} ${box.minZ} ${box.width} ${box.height}`}
          role="img"
          aria-label={`Map of ${view.zoneLabel}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endPointer}
          onPointerCancel={endPointer}
        >
          {view.rooms.map((room) => (
            <g key={room.id}>
              <rect
                x={room.minX}
                y={room.minZ}
                width={room.maxX - room.minX}
                height={room.maxZ - room.minZ}
                fill="#f4ece0"
                stroke="#cbb8a4"
                strokeWidth={0.12}
                rx={0.4}
              />
              <text
                x={(room.minX + room.maxX) / 2}
                y={(room.minZ + room.maxZ) / 2}
                textAnchor="middle"
                fontSize={0.95}
                fill="#a08a72"
                className="daykare-map-room-label"
              >
                {room.label}
              </text>
            </g>
          ))}

          {view.walls.map((wall) => (
            <rect
              key={wall.id}
              x={wall.minX}
              y={wall.minZ}
              width={Math.max(0.18, wall.maxX - wall.minX)}
              height={Math.max(0.18, wall.maxZ - wall.minZ)}
              fill="#8b5a2b"
            />
          ))}

          {view.doors.map((door) => (
            <line
              key={door.id}
              x1={door.from.x}
              y1={door.from.z}
              x2={door.to.x}
              y2={door.to.z}
              stroke="#f4ece0"
              strokeWidth={0.5}
              strokeLinecap="round"
            />
          ))}

          {view.pins.map((pin) => {
            const style = PIN_STYLE[pin.kind];
            const isPlayer = pin.kind === 'player';
            const radius = isPlayer ? 0.62 : 0.5;
            return (
              <g
                key={pin.id}
                onPointerUp={(event) => {
                  event.stopPropagation();
                  setSelected((current) => (current === pin.id ? null : pin.id));
                }}
                style={{ cursor: 'pointer' }}
              >
                {/* Generous invisible hit area - a 0.5-unit dot is far under 44px. */}
                <circle cx={pin.x} cy={pin.z} r={1.6} fill="transparent" />
                <circle cx={pin.x} cy={pin.z} r={radius + 0.22} fill={style.ring} />
                <circle cx={pin.x} cy={pin.z} r={radius} fill={style.fill} />
                {pin.kind === 'route-locked' && (
                  <text x={pin.x} y={pin.z + 0.28} textAnchor="middle" fontSize={0.7} fill="#fff">
                    ?
                  </text>
                )}
                {isPlayer && <circle cx={pin.x} cy={pin.z} r={1.15} fill="none" stroke={style.fill} strokeWidth={0.14} />}
              </g>
            );
          })}
        </svg>
      </div>

      <div className="daykare-map-readout" role="status" aria-live="polite">
        {selectedPin ? (
          <>
            <strong>{selectedPin.label}</strong>
            {selectedPin.detail ? <span> — {selectedPin.detail}</span> : null}
          </>
        ) : (
          <span>Drag to pan, pinch or use + / − to zoom. Tap a marker to name it.</span>
        )}
      </div>
    </div>
  );
}
