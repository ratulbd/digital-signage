import { useEffect, useRef, useState } from 'react';

export default function CustomCursor() {
  const dotRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const [isTouch, setIsTouch] = useState(false);
  const pos = useRef({ x: 0, y: 0 });
  const ringPos = useRef({ x: 0, y: 0 });
  const raf = useRef<number>(0);

  useEffect(() => {
    // Detect touch device
    const checkTouch = () => {
      setIsTouch('ontouchstart' in window || navigator.maxTouchPoints > 0);
    };
    checkTouch();

    if (isTouch) return;

    const onMove = (e: MouseEvent) => {
      pos.current = { x: e.clientX, y: e.clientY };
    };

    const onDown = () => {
      dotRef.current?.classList.add('cursor-dot--active');
      ringRef.current?.classList.add('cursor-ring--active');
    };

    const onUp = () => {
      dotRef.current?.classList.remove('cursor-dot--active');
      ringRef.current?.classList.remove('cursor-ring--active');
    };

    const animate = () => {
      ringPos.current.x += (pos.current.x - ringPos.current.x) * 0.15;
      ringPos.current.y += (pos.current.y - ringPos.current.y) * 0.15;

      if (dotRef.current) {
        dotRef.current.style.transform = `translate(${pos.current.x}px, ${pos.current.y}px) translate(-50%, -50%)`;
      }
      if (ringRef.current) {
        ringRef.current.style.transform = `translate(${ringPos.current.x}px, ${ringPos.current.y}px) translate(-50%, -50%)`;
      }

      raf.current = requestAnimationFrame(animate);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mousedown', onDown);
    window.addEventListener('mouseup', onUp);
    raf.current = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('mouseup', onUp);
      cancelAnimationFrame(raf.current);
    };
  }, [isTouch]);

  if (isTouch) return null;

  return (
    <>
      <style>{`
        @media (pointer: fine) {
          * { cursor: none !important; }
        }
        .cursor-dot {
          position: fixed;
          top: 0; left: 0;
          width: 6px; height: 6px;
          background: var(--cyan);
          border-radius: 50%;
          pointer-events: none;
          z-index: 99999;
          mix-blend-mode: screen;
          transition: width 0.15s, height 0.15s, background 0.15s;
          will-change: transform;
        }
        .cursor-dot--active {
          width: 4px; height: 4px;
          background: var(--amber);
        }
        .cursor-ring {
          position: fixed;
          top: 0; left: 0;
          width: 32px; height: 32px;
          border: 1px solid rgba(0, 240, 255, 0.3);
          border-radius: 50%;
          pointer-events: none;
          z-index: 99998;
          transition: width 0.2s, height 0.2s, border-color 0.2s, opacity 0.2s;
          will-change: transform;
        }
        .cursor-ring--active {
          width: 24px; height: 24px;
          border-color: rgba(255, 170, 51, 0.5);
        }
        /* Expand ring on hoverable elements */
        a:hover ~ .cursor-ring,
        button:hover ~ .cursor-ring,
        [role="button"]:hover ~ .cursor-ring,
        input:hover ~ .cursor-ring,
        select:hover ~ .cursor-ring,
        textarea:hover ~ .cursor-ring,
        label:hover ~ .cursor-ring {
          width: 48px !important;
          height: 48px !important;
          border-color: rgba(0, 240, 255, 0.5) !important;
          opacity: 0.6 !important;
        }
      `}</style>
      <div ref={dotRef} className="cursor-dot" />
      <div ref={ringRef} className="cursor-ring" />
    </>
  );
}
