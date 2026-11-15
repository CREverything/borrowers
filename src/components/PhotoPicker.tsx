import { ImagePlus, LoaderCircle, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { ImageReadError, shrinkImage } from "../lib/shrinkImage";

/** Same limit as the server (backend/src/items/images.ts). */
export const MAX_PHOTOS = 6;

/** A photo already on the listing, or one picked in this session (not uploaded yet). */
export type PhotoEntry =
  | { key: string; kind: "existing"; id: string; url: string }
  | { key: string; kind: "new"; blob: Blob; url: string };

/** What to do with the listing's photos when the form is saved. */
export interface PhotoChanges {
  add: Blob[];
  removeIds: string[];
}

export function photoChanges(initial: { id: string }[], photos: PhotoEntry[]): PhotoChanges {
  const kept = new Set(photos.flatMap((p) => (p.kind === "existing" ? [p.id] : [])));
  return {
    add: photos.flatMap((p) => (p.kind === "new" ? [p.blob] : [])),
    removeIds: initial.filter((p) => !kept.has(p.id)).map((p) => p.id),
  };
}

let nextKey = 0;

/**
 * Pick up to six photos. They're shrunk in the browser straight away and
 * uploaded when the listing is saved. The first photo is the cover.
 */
export default function PhotoPicker({
  photos,
  onChange,
}: {
  photos: PhotoEntry[];
  onChange: (photos: PhotoEntry[]) => void;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const room = MAX_PHOTOS - photos.length;

  // Free the in-memory previews when the form goes away.
  const latest = useRef(photos);
  latest.current = photos;
  useEffect(
    () => () => latest.current.forEach((p) => p.kind === "new" && URL.revokeObjectURL(p.url)),
    [],
  );

  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setError(null);
    const picked = Array.from(files);
    const usable = picked.slice(0, room);
    setBusy(true);
    const added: PhotoEntry[] = [];
    const problems: string[] = [];
    for (const file of usable) {
      try {
        const blob = await shrinkImage(file);
        added.push({ key: `new-${nextKey++}`, kind: "new", blob, url: URL.createObjectURL(blob) });
      } catch (e) {
        problems.push(e instanceof ImageReadError ? e.message : `${file.name} couldn't be added.`);
      }
    }
    setBusy(false);
    onChange([...latest.current, ...added]);
    if (picked.length > usable.length) {
      problems.push(`A listing can have up to ${MAX_PHOTOS} photos, so ${picked.length - usable.length} weren't added.`);
    }
    if (problems.length) setError(problems.join(" "));
    if (inputRef.current) inputRef.current.value = "";
  };

  const remove = (entry: PhotoEntry) => {
    if (entry.kind === "new") URL.revokeObjectURL(entry.url);
    onChange(photos.filter((p) => p.key !== entry.key));
    setError(null);
  };

  return (
    <div className="photo-picker">
      <ul className="photo-picker__grid">
        {photos.map((p, index) => (
          <li key={p.key} className="photo-picker__item">
            <img src={p.url} alt={`Photo ${index + 1}`} />
            {index === 0 && <span className="photo-picker__cover">Cover</span>}
            <button
              type="button"
              className="photo-picker__remove"
              aria-label={`Remove photo ${index + 1}`}
              onClick={() => remove(p)}
            >
              <X size={14} aria-hidden="true" />
            </button>
          </li>
        ))}
        {room > 0 && (
          <li>
            <label htmlFor={inputId} className={`photo-picker__add${busy ? " photo-picker__add--busy" : ""}`}>
              {busy ? (
                <LoaderCircle size={22} aria-hidden="true" className="spin" />
              ) : (
                <ImagePlus size={22} aria-hidden="true" />
              )}
              <span>{busy ? "Preparing..." : photos.length ? "Add more" : "Add photos"}</span>
            </label>
            <input
              ref={inputRef}
              id={inputId}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
              multiple
              className="sr-only"
              disabled={busy}
              onChange={(e) => void addFiles(e.target.files)}
            />
          </li>
        )}
      </ul>
      <p className="muted small">
        Up to {MAX_PHOTOS} photos. The first is the cover. {room < MAX_PHOTOS && `${room} left.`}
      </p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
