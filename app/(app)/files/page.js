'use client';
import { useEffect, useState } from 'react';
import { useStore, mySide, childIdentity, kidName, arrName } from '@/lib/store';
import { supa } from '@/lib/supabase/client';
import { Modal, ArrTabs, useArrSelection, Explainer } from '@/components/ui';
import { toast } from '@/components/Toast';
import { confirmDelete } from '@/components/Confirm';
import { FileText, FolderOpen, Trash2, ExternalLink } from 'lucide-react';

const CATS = ['Insurance', 'Medical', 'School', 'Legal', 'Photos', 'Other'];
const MAX_BYTES = 20 * 1024 * 1024;   // matches the bucket's limit

const isImage = f => (f.mime || '').startsWith('image/');
const fmtSize = b => !b ? '' : b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`;

export default function FilesPage() {
  const store = useStore();
  const { arrangements, me } = store;
  const [sel, setSel] = useArrSelection(arrangements, true);
  const [showAdd, setShowAdd] = useState(false);
  const [viewing, setViewing] = useState(null);   // image file shown in the preview modal
  const [urls, setUrls] = useState({});           // path -> signed URL, for thumbnails

  const active = sel === 'all' ? null : arrangements.find(a => a.id === sel);
  const shown = active ? [active] : arrangements;
  const files = shown.flatMap(a => (a.files || []).map(f => ({ ...f, arr: a })));
  const imagePaths = files.filter(isImage).map(f => f.path).filter(p => !urls[p]);
  const pathsKey = imagePaths.join('|');

  // Batch-sign thumbnails for images we haven't signed yet (private bucket).
  useEffect(() => {
    if (!imagePaths.length) return;
    supa().storage.from('files').createSignedUrls(imagePaths, 3600).then(({ data }) => {
      if (!data) return;
      setUrls(u => ({ ...u, ...Object.fromEntries(data.filter(d => d.signedUrl).map(d => [d.path, d.signedUrl])) }));
    });
  }, [pathsKey]);   // eslint-disable-line react-hooks/exhaustive-deps

  if (!arrangements.length) return <div className="empty">No arrangements yet.</div>;
  if (childIdentity(arrangements, me.id)) {
    return <div className="empty">Nothing here for you — check the Calendar and To-Dos.</div>;
  }

  const uploadable = arrangements.filter(a => mySide(a, me.id));
  const when = ts => new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

  async function open(f) {
    if (isImage(f)) { setViewing(f); return; }
    const { data, error } = await supa().storage.from('files').createSignedUrl(f.path, 300);
    if (error) toast.error(`Couldn't open file: ${error.message}`);
    else window.open(data.signedUrl, '_blank');
  }

  async function remove(f) {
    if (!(await confirmDelete(`Delete "${f.name}"? This can’t be undone.`))) return;
    const { error } = await supa().from('files').delete().eq('id', f.id);
    if (error) { toast.error(`Couldn't delete: ${error.message}`); return; }
    await supa().storage.from('files').remove([f.path]);
    if (viewing?.id === f.id) setViewing(null);
    store.refresh();
  }

  return (
    <>
      <ArrTabs arrangements={arrangements} value={sel} onChange={setSel} allLabel="All" />
      <Explainer id="files" icon={<FolderOpen size={28} strokeWidth={1.8} style={{ flex: 'none', marginTop: 2 }} />}>
        Files keeps the documents both homes need on hand — insurance and copay assistance
        cards, school forms, custody paperwork, photos. Everyone in both homes can open
        them from any device; only whoever uploaded a file can delete it. Kids never see this page.
      </Explainer>
      <div className="card">
        <h2>Files {uploadable.length > 0 && <button className="btn small" onClick={() => setShowAdd(true)}>+ Upload</button>}</h2>
        {files.length === 0 && (
          <div className="empty">No files yet{uploadable.length ? ' — upload an insurance card to start' : ''}.</div>
        )}
        {CATS.map(cat => {
          const group = files.filter(f => (CATS.includes(f.category) ? f.category : 'Other') === cat);
          if (!group.length) return null;
          return (
            <div key={cat} className="file-group">
              <div className="file-group-label">{cat}</div>
              {group.map(f => (
                <div key={f.id} className="todo file-row" onClick={() => open(f)}>
                  {isImage(f) && urls[f.path]
                    ? <img className="file-thumb" src={urls[f.path]} alt="" loading="lazy" />
                    : <span className="file-thumb icon"><FileText size={20} /></span>}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="t-title">{f.name}</div>
                    <div className="t-meta">
                      {f.child_id && <>{kidName(f.arr, f.child_id)} · </>}
                      {f.profiles?.name || f.profiles?.email} · {when(f.created_at)}
                      {f.size ? <> · {fmtSize(f.size)}</> : null}
                      {arrangements.length > 1 && !active && <> · {arrName(f.arr)}</>}
                    </div>
                  </div>
                  {f.uploaded_by === me.id && (
                    <button className="btn danger small" aria-label={`Delete ${f.name}`}
                      onClick={e => { e.stopPropagation(); remove(f); }}><Trash2 size={15} /></button>
                  )}
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {viewing && (
        <Modal title={viewing.name} onClose={() => setViewing(null)}>
          {urls[viewing.path]
            ? <img className="file-preview" src={urls[viewing.path]} alt={viewing.name} />
            : <div className="empty">Loading…</div>}
          <div className="actions">
            {urls[viewing.path] && (
              <button className="btn subtle" onClick={() => window.open(urls[viewing.path], '_blank')}>
                <ExternalLink size={14} style={{ verticalAlign: '-2px' }} /> Full size
              </button>
            )}
            <button className="btn" onClick={() => setViewing(null)}>Close</button>
          </div>
        </Modal>
      )}

      {showAdd && <Upload arrangements={uploadable}
        defaultArr={active && mySide(active, me.id) ? active : uploadable[0]}
        me={me} store={store} onClose={() => setShowAdd(false)} />}
    </>
  );
}

function Upload({ arrangements, defaultArr, me, store, onClose }) {
  const [arrId, setArrId] = useState(defaultArr.id);
  const [picked, setPicked] = useState([]);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Insurance');
  const [childId, setChildId] = useState('');
  const [busy, setBusy] = useState(false);
  const arr = arrangements.find(a => a.id === arrId) || defaultArr;
  const single = picked.length === 1;

  function pick(list) {
    const chosen = [...(list || [])];
    setPicked(chosen);
    if (chosen.length === 1) setName(baseName(chosen[0].name));
  }

  async function submit() {
    if (!picked.length) { toast.error('Choose a file to upload.'); return; }
    if (single && !name.trim()) { toast.error('Give the file a name.'); return; }
    setBusy(true);
    const s = supa();
    let done = 0;
    for (const original of picked) {
      const file = await shrinkImage(original);
      if (file.size > MAX_BYTES) { toast.error(`${original.name} is over 20 MB.`); continue; }
      const id = crypto.randomUUID();
      const path = `${arr.id}/${id}-${file.name.replace(/[^\w.\-]/g, '_')}`;
      const up = await s.storage.from('files').upload(path, file, { contentType: file.type || undefined });
      if (up.error) { toast.error(`Upload failed for ${original.name}: ${up.error.message}`); continue; }
      const { error } = await s.from('files').insert({
        id, arrangement_id: arr.id, child_id: childId || null, category,
        name: single ? name.trim() : baseName(original.name),
        path, mime: file.type || null, size: file.size, uploaded_by: me.id,
      });
      if (error) {
        await s.storage.from('files').remove([path]);
        toast.error(`Couldn't save ${original.name}: ${error.message}`);
        continue;
      }
      done++;
    }
    setBusy(false);
    if (done) {
      toast.success(done === 1 ? 'File uploaded' : `${done} files uploaded`);
      store.refresh();
      onClose();
    }
  }

  return (
    <Modal title="Upload files" onClose={onClose}>
      {arrangements.length > 1 && (
        <div className="field"><label>Arrangement</label>
          <select value={arrId} onChange={e => { setArrId(e.target.value); setChildId(''); }}>
            {arrangements.map(a => <option key={a.id} value={a.id}>{arrName(a)}</option>)}
          </select></div>
      )}
      <div className="field"><label>File</label>
        <input type="file" multiple accept="image/*,.pdf,.doc,.docx,.heic,.txt"
          onChange={e => pick(e.target.files)} /></div>
      {single && (
        <div className="field"><label>Name</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Molly — BCBS card (front)" /></div>
      )}
      {picked.length > 1 && <p className="muted" style={{ fontSize: 13, marginBottom: 12 }}>{picked.length} files — each keeps its own filename.</p>}
      <div className="row">
        <div className="field"><label>Category</label>
          <select value={category} onChange={e => setCategory(e.target.value)}>{CATS.map(c => <option key={c}>{c}</option>)}</select></div>
        {arr.children?.length > 0 && (
          <div className="field"><label>Child</label>
            <select value={childId} onChange={e => setChildId(e.target.value)}>
              <option value="">All kids</option>
              {arr.children.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}
            </select></div>
        )}
      </div>
      <div className="actions">
        <button className="btn subtle" onClick={onClose}>Cancel</button>
        <button className="btn" disabled={busy || !picked.length} onClick={submit}>{busy ? 'Uploading…' : 'Upload'}</button>
      </div>
    </Modal>
  );
}

const baseName = n => n.replace(/\.[^.]+$/, '');

// Phone photos are often 3–10 MB; re-encode them to a still-legible 2400px
// JPEG so cards stay readable and thumbnails load fast. Anything the browser
// can't decode (e.g. HEIC on desktop Chrome) uploads as-is.
async function shrinkImage(file) {
  if (!/^image\/(jpeg|png|heic|heif|webp)$/.test(file.type) || file.size < 1024 * 1024) return file;
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, 2400 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.85));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch {
    return file;
  }
}
