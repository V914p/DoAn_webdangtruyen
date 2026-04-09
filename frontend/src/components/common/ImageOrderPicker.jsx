import { GripHorizontal, Trash2 } from 'lucide-react';
import { useState } from 'react';

function getImageSource(item, apiUrl) {
  if (!item?.previewUrl) {
    return '';
  }

  return item.previewUrl.startsWith('http') || item.previewUrl.startsWith('blob:')
    ? item.previewUrl
    : `${apiUrl}${item.previewUrl}`;
}

export function createExistingImageItem(image, index = 0) {
  return {
    id: `existing:${image}:${index}`,
    source: 'existing',
    image,
    previewUrl: image,
    label: `Existing image ${index + 1}`
  };
}

export function createFileImageItems(files) {
  return files.map((file, index) => ({
    id: `file:${file.name}:${file.lastModified}:${index}`,
    source: 'file',
    file,
    previewUrl: URL.createObjectURL(file),
    label: file.name
  }));
}

export function buildOrderedImagePayload(items) {
  return {
    existingImages: items.filter((item) => item.source === 'existing').map((item) => item.image),
    newFiles: items.filter((item) => item.source === 'file').map((item) => item.file),
    imageOrder: items.map((item) => (
      item.source === 'existing'
        ? { kind: 'existing', value: item.image }
        : { kind: 'new' }
    ))
  };
}

export function revokeImageItemPreview(item) {
  if (item?.source === 'file' && item.previewUrl?.startsWith('blob:')) {
    URL.revokeObjectURL(item.previewUrl);
  }
}

export default function ImageOrderPicker({
  items,
  apiUrl,
  emptyLabel,
  helperText,
  onReorder,
  onRemove
}) {
  const [draggedItemId, setDraggedItemId] = useState(null);
  const [dropTargetId, setDropTargetId] = useState(null);

  if (!items.length) {
    return (
      <div className="rounded-[1.75rem] border border-dashed border-slate-700 bg-slate-950/40 px-5 py-8 text-center text-sm text-slate-400">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {helperText ? (
        <p className="text-xs text-slate-400">{helperText}</p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((item, index) => (
          <article
            key={item.id}
            draggable
            onDragStart={() => {
              setDraggedItemId(item.id);
              setDropTargetId(item.id);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              if (dropTargetId !== item.id) {
                setDropTargetId(item.id);
              }
            }}
            onDrop={(event) => {
              event.preventDefault();
              if (!draggedItemId || draggedItemId === item.id) {
                setDraggedItemId(null);
                setDropTargetId(null);
                return;
              }

              onReorder(draggedItemId, item.id);
              setDraggedItemId(null);
              setDropTargetId(null);
            }}
            onDragEnd={() => {
              setDraggedItemId(null);
              setDropTargetId(null);
            }}
            className={`overflow-hidden rounded-[1.75rem] border bg-slate-950/70 shadow-[0_18px_45px_rgba(2,6,23,0.26)] transition ${draggedItemId === item.id ? 'scale-[0.985] border-brand/50 opacity-70' : dropTargetId === item.id ? 'border-brand/50 ring-2 ring-brand/20' : 'border-slate-800'}`}
          >
            <div className="relative aspect-[4/3] overflow-hidden bg-slate-900">
              <img
                src={getImageSource(item, apiUrl)}
                alt={item.label || `Image ${index + 1}`}
                className="h-full w-full object-cover"
              />
              <div className="absolute left-3 top-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-slate-950/80 px-3 py-1 text-xs font-medium text-white backdrop-blur">
                <GripHorizontal size={14} />
                {index === 0 ? 'Cover / First image' : `Image ${index + 1}`}
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-200">{item.label || `Image ${index + 1}`}</p>
                <p className="text-xs text-slate-500">{item.source === 'existing' ? 'Current image' : 'New upload'}</p>
                <p className="mt-1 text-[11px] text-slate-500">Drag this card to reorder faster.</p>
              </div>

              <div className="flex items-center gap-2">
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-700 bg-slate-900/80 text-slate-400">
                  <GripHorizontal size={16} />
                </div>
                <button
                  type="button"
                  onClick={() => onRemove(item)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-red-500/30 bg-red-500/10 p-0 text-red-300 transition hover:border-red-400/40 hover:bg-red-500/15 hover:text-red-200"
                  aria-label={`Remove image ${index + 1}`}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}