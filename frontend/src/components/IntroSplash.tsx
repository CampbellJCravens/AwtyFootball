import { useEffect, useRef } from 'react';

// Full-screen intro that plays once on site open (after access is granted),
// ending on the club logo, then reveals the app. Tap/click to skip.
export default function IntroSplash({ onDone }: { onDone: () => void }) {
  const doneRef = useRef(false);

  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone();
  };

  // Safety net: advance even if the video's `ended` event never fires.
  useEffect(() => {
    const t = setTimeout(finish, 8000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-base cursor-pointer"
      onClick={finish}
      role="button"
      aria-label="Skip intro"
    >
      <video
        src="/afc-intro.mp4"
        poster="/afc-logo.png"
        autoPlay
        muted
        playsInline
        onEnded={finish}
        onError={finish}
        className="w-64 max-w-[80vw] h-auto rounded-2xl"
      />
    </div>
  );
}
