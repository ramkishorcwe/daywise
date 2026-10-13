import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

export default function Dialog({ title, close, children, wide = false }: { title: string; close: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current!; dialog.showModal(); return () => dialog.close(); }, []);
  return <dialog ref={ref} className={`dialog ${wide ? 'wide' : ''}`} onCancel={e => { e.preventDefault(); close(); }}>
    <div className="dialog-heading"><div><span className="eyebrow">MAKE IT YOURS</span><h2>{title}</h2></div><button className="icon-button" aria-label="Close dialog" onClick={close}><X size={20} /></button></div>
    {children}
  </dialog>;
}
