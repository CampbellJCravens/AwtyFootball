import { useEffect, useRef, useState } from 'react';

// Full-screen intro that plays once on site open (after access is granted),
// ending on the club logo, then fades to reveal the app. Tap/click to skip.
// Full-bleed so the video's own (animated) background fills the screen with no
// contrasting border. Rendered over the app so the fade reveals the real app.
export default function IntroSplash({ onDone }: { onDone: () => void }) {
  const doneRef = useRef(false);
  const [fading, setFading] = useState(false);

  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    setFading(true);
    setTimeout(onDone, 600); // let the fade play before unmounting
  };

  // Safety net: advance even if the video's `ended` event never fires.
  useEffect(() => {
    const t = setTimeout(finish, 8000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className={`fixed inset-0 z-[100] flex items-center justify-center bg-black transition-opacity duration-[600ms] ${
        fading ? 'opacity-0' : 'opacity-100'
      }`}
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
        className="h-full w-full object-cover"
      />
    </div>
  );
}
