'use client';
import { useEffect, useRef, useState } from 'react';
import { X, Share, SquarePlus } from 'lucide-react';

const DISMISS_KEY = 'fp-a2hs-dismissed';

export default function AddToHome() {
  const [show, setShow] = useState(false);
  const [ios, setIos] = useState(false);
  const [help, setHelp] = useState(false);
  const installEvent = useRef(null);

  useEffect(() => {
    const ua = navigator.userAgent;
    const mobile = /iPhone|iPad|iPod|Android/i.test(ua);
    if (!mobile || localStorage.getItem(DISMISS_KEY)) return;
    const installed = window.matchMedia?.('(display-mode: standalone)').matches
      || window.navigator.standalone;
    if (installed) return;
    setIos(/iPhone|iPad|iPod/i.test(ua));
    setShow(true);
    // Chrome on Android fires this when the app is installable; capturing it
    // lets the banner trigger the native install prompt instead of instructions.
    const onPrompt = e => { e.preventDefault(); installEvent.current = e; };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  if (!show) return null;

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, '1');
    setShow(false);
  }

  async function add() {
    if (installEvent.current) {
      installEvent.current.prompt();
      const { outcome } = await installEvent.current.userChoice;
      installEvent.current = null;
      if (outcome === 'accepted') dismiss();
      return;
    }
    setHelp(true);
  }

  return (
    <>
      <div className="a2hs">
        <button className="a2hs-cta" onClick={add}>
          <SquarePlus size={16} strokeWidth={2.2} /> Add to Home Screen
        </button>
        <button className="a2hs-x" aria-label="Dismiss" onClick={dismiss}>
          <X size={16} />
        </button>
      </div>

      {help && (
        <div className="overlay" onClick={() => setHelp(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Add Family Phases to your Home Screen</h3>
              <button className="modal-x" aria-label="Close" onClick={() => setHelp(false)}>
                <X size={18} />
              </button>
            </div>
            {ios ? (
              <ol className="a2hs-steps">
                <li>Tap the <b>Share</b> button <Share size={14} /> in Safari&rsquo;s toolbar.</li>
                <li>Scroll down and tap <b>Add to Home Screen</b>.</li>
                <li>Tap <b>Add</b>.</li>
              </ol>
            ) : (
              <ol className="a2hs-steps">
                <li>Tap the <b>&#8942; menu</b> in the top corner of your browser.</li>
                <li>Tap <b>Add to Home screen</b> (or <b>Install app</b>).</li>
                <li>Confirm with <b>Add</b> or <b>Install</b>.</li>
              </ol>
            )}
            <p className="a2hs-note">Family Phases will open full-screen, just like a regular app.</p>
          </div>
        </div>
      )}
    </>
  );
}
