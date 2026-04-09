import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ImageOrderPicker, { buildOrderedImagePayload, createExistingImageItem, createFileImageItems, revokeImageItemPreview } from '../components/common/ImageOrderPicker';
import { getCurrentUser, getToken } from '../services/authService';
import { validateImageFilesBeforeUpload } from '../utils/fileValidation';
import { parseStrictHashtagInput } from '../utils/hashtags';
import { formatTag, normalizeTagList } from '../utils/hashtags';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export default function CreateStoryPage() {
  const { id } = useParams();
  const isEditMode = Boolean(id);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState('');
  const [imageItems, setImageItems] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(false);
  const imageItemsRef = useRef([]);
  const navigate = useNavigate();
  const currentUser = getCurrentUser();
  const restrictionEndsAt = currentUser?.postingRestrictedUntil ? new Date(currentUser.postingRestrictedUntil) : null;
  const isPostingRestricted = Boolean(restrictionEndsAt) && restrictionEndsAt > new Date();

  useEffect(() => {
    if (!isEditMode) return;

    const loadStory = async () => {
      try {
        setPageLoading(true);
        const response = await fetch(`${API_URL}/api/content/${id}?type=story`, {
          headers: {
            Authorization: `Bearer ${getToken()}`
          }
        });
        const data = await response.json();

        if (!data.success) {
          setError(data.error?.message || 'Failed to load story');
          return;
        }

        setTitle(data.data.title || '');
        setDescription(data.data.description || '');
        setContent(data.data.content || '');
        setTags(normalizeTagList(data.data.tags || []).map((tag) => formatTag(tag)).join(' '));
        setImageItems((data.data.images || []).map((image, index) => createExistingImageItem(image, index)));
      } catch (err) {
        setError('Failed to load story');
      } finally {
        setPageLoading(false);
      }
    };

    loadStory();
  }, [id, isEditMode]);

  useEffect(() => {
    imageItemsRef.current = imageItems;
  }, [imageItems]);

  useEffect(() => () => {
    imageItemsRef.current.forEach((item) => revokeImageItemPreview(item));
  }, []);

  const handleFileChange = async (event) => {
    const nextFiles = Array.from(event.target.files || []);
    setError('');

    if (imageItems.length + nextFiles.length > 10) {
      setError('You can attach up to 10 images to one story.');
      event.target.value = '';
      return;
    }

    const validation = await validateImageFilesBeforeUpload(nextFiles, {
      maxFiles: 10,
      maxSizeBytes: 10 * 1024 * 1024,
      fieldLabel: 'story image'
    });

    if (!validation.valid) {
      setError(validation.error);
      event.target.value = '';
      return;
    }

    setImageItems((prev) => [...prev, ...createFileImageItems(nextFiles)]);
    event.target.value = '';
  };

  const handleReorderImage = (draggedId, targetId) => {
    setImageItems((prev) => {
      const draggedIndex = prev.findIndex((item) => item.id === draggedId);
      const targetIndex = prev.findIndex((item) => item.id === targetId);

      if (draggedIndex === -1 || targetIndex === -1 || draggedIndex === targetIndex) {
        return prev;
      }

      const nextItems = [...prev];
      const [selectedItem] = nextItems.splice(draggedIndex, 1);
      nextItems.splice(targetIndex, 0, selectedItem);
      return nextItems;
    });
  };

  const handleRemoveImage = (itemToRemove) => {
    revokeImageItemPreview(itemToRemove);
    setImageItems((prev) => prev.filter((item) => item.id !== itemToRemove.id));
  };

  const submitStory = async (status) => {
    setError('');
    setLoading(true);

    try {
      const parsedTags = parseStrictHashtagInput(tags);
      if (parsedTags.error) {
        setError(parsedTags.error);
        setLoading(false);
        return;
      }

      if (parsedTags.tags.length === 0) {
        setError('Please add at least one hashtag before publishing');
        setLoading(false);
        return;
      }

      const formData = new FormData();
      formData.append('title', title);
      formData.append('description', description);
      formData.append('content', content);
      formData.append('status', status);

      parsedTags.tags.forEach((tag) => {
        formData.append('tags', tag);
      });

      const orderedPayload = buildOrderedImagePayload(imageItems);

      orderedPayload.existingImages.forEach((image) => {
        formData.append('images', image);
      });

      orderedPayload.newFiles.forEach((file) => {
        formData.append('images', file);
      });

      orderedPayload.imageOrder.forEach((entry) => {
        formData.append('imageOrder', JSON.stringify(entry));
      });

      const response = await fetch(isEditMode ? `${API_URL}/api/content/${id}` : `${API_URL}/api/stories`, {
        method: isEditMode ? 'PUT' : 'POST',
        headers: {
          'Authorization': `Bearer ${getToken()}`
        },
        body: formData
      });

      const data = await response.json();

      if (data.success) {
        navigate(isEditMode ? `/story/${id}` : '/stories');
      } else {
        setError(data.error.message);
      }
    } catch (err) {
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    await submitStory('approved');
  };

  if (pageLoading) {
    return (
      <div className="panel flex min-h-72 items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-slate-300">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-slate-700 border-t-brand" />
          <p className="text-sm">Loading story...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="detail-title text-3xl">{isEditMode ? 'Edit Story' : 'Create New Story'}</h1>
      </div>

      <form onSubmit={handleSubmit} className="panel p-6">
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-300 px-4 py-3 rounded-2xl mb-6">
            {error}
          </div>
        )}

        {isPostingRestricted ? (
          <div className="mb-6 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            Posting is locked until {restrictionEndsAt.toLocaleString()}. Reason: {currentUser.postingRestrictionReason}
          </div>
        ) : null}

        <div className="mb-6">
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Title *
          </label>
          <input
            type="text"
            required
            maxLength={200}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="input-base"
            placeholder="Enter story title"
          />
        </div>

        <div className="mb-6">
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="input-base resize-none"
            placeholder="Brief description of your story"
          />
        </div>

        <div className="mb-6">
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Content *
          </label>
          <textarea
            required
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={15}
            className="input-base resize-none"
            placeholder="Write your story here..."
          />
        </div>

        <div className="mb-6">
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Story Images (optional)
          </label>
          <input
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            multiple
            onChange={handleFileChange}
            className="editor-upload-input"
          />
          <p className="text-xs text-slate-400 mt-2">
            You can skip images entirely or upload extra visuals directly from your device. Files are checked by byte header before upload and again on the server.
          </p>
          <div className="mt-4 rounded-[1.75rem] border border-slate-800 bg-slate-950/50 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-slate-200">Review image order before publishing</p>
                <p className="text-xs text-slate-400">If you attach multiple visuals, readers will see them in exactly this order.</p>
              </div>
              <div className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs text-slate-300">
                {imageItems.length}/10 images
              </div>
            </div>

            <ImageOrderPicker
              items={imageItems}
              apiUrl={API_URL}
              emptyLabel="Story images are optional. Upload files here if you want a visual sequence before or after the text."
              helperText="Drag cards to set the final sequence readers will see after publish."
              onReorder={handleReorderImage}
              onRemove={handleRemoveImage}
            />
          </div>
        </div>

        <div className="mb-6">
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Hashtags
          </label>
          <input
            type="text"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            className="input-base"
            placeholder="newday sunrise"
            required
          />
          <p className="text-xs text-slate-400 mt-2">
            Add at least one hashtag. You can type with or without #, use spaces or commas, and duplicate tags will be merged automatically.
          </p>
        </div>

        <div className="flex gap-4">
          <button
            type="button"
            disabled={loading || isPostingRestricted}
            onClick={() => submitStory('draft')}
            className="editor-action-secondary"
          >
            {loading ? 'Saving...' : isEditMode ? 'Save Draft' : 'Save as Draft'}
          </button>
          <button
            type="submit"
            disabled={loading || isPostingRestricted}
            className="editor-action-primary"
          >
            {loading ? 'Publishing...' : isEditMode ? 'Update Story' : 'Publish Story'}
          </button>
          <button
            type="button"
            onClick={() => navigate(isEditMode ? `/story/${id}` : '/home')}
            className="editor-action-secondary"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
