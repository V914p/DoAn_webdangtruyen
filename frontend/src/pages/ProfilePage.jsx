import { Bookmark, Heart } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getCurrentUser, getToken, setCurrentUser, subscribeToCurrentUserChange, updateCurrentUserCollection } from '../services/authService';
import { invalidateContentMutationCaches, invalidateCreatorPresentationCaches } from '../services/appDataInvalidation';
import { emitCreatorPresentationRefresh } from '../services/creatorPresentationEvents';
import { fetchJsonWithCache, FRONTEND_CACHE_NAMESPACES, getFrontendCacheScope, invalidateFrontendCache } from '../services/frontendCache';
import { getRoutePrefetchProps } from '../services/routePrefetch';
import { formatCount, formatRelative } from '../utils/helpers';
import { validateSingleImageBeforeUpload } from '../utils/fileValidation';
import { formatTag, normalizeTagList } from '../utils/hashtags';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export default function ProfilePage() {
  const { id } = useParams();
  const currentUser = getCurrentUser();
  const resolvedUserId = id || currentUser?.id || currentUser?._id;
  const isOwnProfile = !id || id === (currentUser?.id || currentUser?._id);

  const [profile, setProfile] = useState(null);
  const [content, setContent] = useState([]);
  const [isFollowing, setIsFollowing] = useState(false);
  const [stats, setStats] = useState({ followerCount: 0, followingCount: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [followers, setFollowers] = useState([]);
  const [followingList, setFollowingList] = useState([]);
  const [history, setHistory] = useState([]);
  const [relationView, setRelationView] = useState('');
  const [authUser, setAuthUser] = useState(() => getCurrentUser());
  const [pendingInteractionKey, setPendingInteractionKey] = useState('');
  const [profileForm, setProfileForm] = useState({
    username: '',
    email: '',
    bio: ''
  });
  const [phoneNumberInput, setPhoneNumberInput] = useState('');
  const [phoneCodeInput, setPhoneCodeInput] = useState('');
  const [phoneSending, setPhoneSending] = useState(false);
  const [phoneVerifying, setPhoneVerifying] = useState(false);
  const [phoneMessage, setPhoneMessage] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const likedIds = Array.isArray(authUser?.likes) ? authUser.likes.map((value) => String(value)) : [];
  const bookmarkedIds = Array.isArray(authUser?.bookmarks) ? authUser.bookmarks.map((value) => String(value)) : [];
  const profileCacheScope = getFrontendCacheScope(authUser?.id || authUser?._id);

  useEffect(() => subscribeToCurrentUserChange(setAuthUser), []);

  useEffect(() => {
    if (!resolvedUserId) {
      setError('User ID not found. Please logout and login again.');
      setLoading(false);
      return;
    }

    fetchProfile();
    if (isOwnProfile) {
      fetchReadingHistory();
    }
    fetchFollowingPreview();
  }, [resolvedUserId, isOwnProfile]);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const token = getToken();
      const headers = token
        ? {
            Authorization: `Bearer ${token}`
          }
        : undefined;
      const data = await fetchJsonWithCache({
        namespace: FRONTEND_CACHE_NAMESPACES.PROFILE,
        key: `profile:${encodeURIComponent(String(resolvedUserId))}:own:${isOwnProfile ? '1' : '0'}`,
        url: `${API_URL}/api/users/${resolvedUserId}`,
        ttlMs: 45 * 1000,
        scope: profileCacheScope,
        options: headers ? { headers } : undefined
      });

      if (!data.success) {
        setError(data.error?.message || 'User not found');
        return;
      }

      setProfile(data.data.user);
      setContent(data.data.content || []);
      setIsFollowing(data.data.isFollowing || false);
      setStats({
        followerCount: data.data.followerCount || 0,
        followingCount: data.data.followingCount || 0
      });
      setProfileForm({
        username: data.data.user.username || '',
        email: data.data.user.email || '',
        bio: data.data.user.bio || ''
      });
      setPhoneNumberInput(data.data.user.phoneNumber || '');
      setError('');
    } catch (err) {
      setError(`Failed to load profile: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const fetchReadingHistory = async () => {
    try {
      const response = await fetch(`${API_URL}/api/users/me/history`, {
        headers: {
          Authorization: `Bearer ${getToken()}`
        }
      });

      const data = await response.json();
      if (data.success) {
        setHistory(data.data || []);
      }
    } catch (err) {
      console.error('Failed to load reading history:', err);
    }
  };

  const fetchFollowingPreview = async () => {
    try {
      const data = await fetchJsonWithCache({
        namespace: FRONTEND_CACHE_NAMESPACES.PROFILE,
        key: `following-preview:${encodeURIComponent(String(resolvedUserId))}`,
        url: `${API_URL}/api/users/${resolvedUserId}/following`,
        ttlMs: 45 * 1000,
        scope: 'shared'
      });

      if (data.success) {
        setFollowingList(data.data || []);
      }
    } catch (err) {
      console.error('Failed to load following preview:', err);
    }
  };

  const fetchRelationList = async (type) => {
    try {
      const data = await fetchJsonWithCache({
        namespace: FRONTEND_CACHE_NAMESPACES.PROFILE,
        key: `${type}:${encodeURIComponent(String(resolvedUserId))}`,
        url: `${API_URL}/api/users/${resolvedUserId}/${type}`,
        ttlMs: 45 * 1000,
        scope: 'shared'
      });

      if (!data.success) return;

      if (type === 'followers') {
        setFollowers(data.data || []);
      } else {
        setFollowingList(data.data || []);
      }

      setRelationView(type);
    } catch (err) {
      console.error(`Failed to load ${type}:`, err);
    }
  };

  const handleFollow = async () => {
    try {
      const response = await fetch(`${API_URL}/api/users/${resolvedUserId}/follow`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${getToken()}`
        }
      });

      const data = await response.json();
      if (data.success) {
        setIsFollowing(true);
        setStats((prev) => ({ ...prev, followerCount: prev.followerCount + 1 }));
        invalidateFrontendCache([
          FRONTEND_CACHE_NAMESPACES.PROFILE,
          FRONTEND_CACHE_NAMESPACES.CREATOR_SEARCH
        ]);
      }
    } catch (err) {
      console.error('Failed to follow user:', err);
    }
  };

  const handleUnfollow = async () => {
    try {
      const response = await fetch(`${API_URL}/api/users/${resolvedUserId}/follow`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${getToken()}`
        }
      });

      const data = await response.json();
      if (data.success) {
        setIsFollowing(false);
        setStats((prev) => ({ ...prev, followerCount: Math.max(0, prev.followerCount - 1) }));
        invalidateFrontendCache([
          FRONTEND_CACHE_NAMESPACES.PROFILE,
          FRONTEND_CACHE_NAMESPACES.CREATOR_SEARCH
        ]);
      }
    } catch (err) {
      console.error('Failed to unfollow user:', err);
    }
  };

  const handleAvatarUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const validation = await validateSingleImageBeforeUpload(file, {
      maxSizeBytes: 5 * 1024 * 1024,
      fieldLabel: 'avatar'
    });

    if (!validation.valid) {
      setError(validation.error);
      event.target.value = '';
      return;
    }

    setUploadingAvatar(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('avatar', file);

      const response = await fetch(`${API_URL}/api/users/avatar`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${getToken()}`
        },
        body: formData
      });

      const data = await response.json();

      if (!data.success) {
        setError(data.error?.message || 'Failed to upload avatar');
        return;
      }

      setProfile(data.data);
      setProfileForm((prev) => ({ ...prev, username: data.data.username, email: data.data.email, bio: data.data.bio || '' }));
      setCurrentUser({
        ...currentUser,
        ...data.data,
        id: data.data._id || currentUser?.id
      });
      emitCreatorPresentationRefresh(data.data);
      invalidateCreatorPresentationCaches();
    } catch (err) {
      setError('An error occurred while uploading avatar');
    } finally {
      setUploadingAvatar(false);
      event.target.value = '';
    }
  };

  const handleProfileSubmit = async (event) => {
    event.preventDefault();
    setSavingProfile(true);
    setError('');

    try {
      const response = await fetch(`${API_URL}/api/users/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`
        },
        body: JSON.stringify(profileForm)
      });

      const data = await response.json();

      if (!data.success) {
        setError(data.error?.message || 'Failed to update profile');
        return;
      }

      setProfile(data.data);
      setCurrentUser({
        ...currentUser,
        ...data.data,
        id: data.data._id || currentUser?.id
      });
      emitCreatorPresentationRefresh(data.data);
      invalidateCreatorPresentationCaches();
    } catch (err) {
      setError('Failed to update profile');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleUpdatePhone = async (e) => {
    e.preventDefault();
    setPhoneError('');
    setPhoneMessage('');
    setPhoneSending(true);

    try {
      const token = getToken();
      const response = await fetch(`${API_URL}/api/users/me/phone`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ phoneNumber: phoneNumberInput })
      });

      const data = await response.json();
      if (!data.success) {
        setPhoneError(data.error?.message || 'Failed to update phone');
        return;
      }

      setProfile(data.data);
      // update current user in localStorage
      const current = getCurrentUser();
      setCurrentUser({ ...(current || {}), ...data.data, id: data.data._id || current?.id });
      setPhoneMessage('Verification code sent. Check your SMS.');
    } catch (err) {
      setPhoneError('Failed to update phone number');
    } finally {
      setPhoneSending(false);
    }
  };

  const handleVerifyPhone = async (e) => {
    e.preventDefault();
    setPhoneError('');
    setPhoneMessage('');
    setPhoneVerifying(true);

    try {
      const response = await fetch(`${API_URL}/api/auth/verify-phone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: phoneNumberInput, code: phoneCodeInput })
      });

      const data = await response.json();
      if (!data.success) {
        setPhoneError(data.error?.message || 'Invalid code');
        return;
      }

      setPhoneMessage('Phone number verified');
      // fetch updated profile to reflect phoneVerified
      await fetchProfile();
    } catch (err) {
      setPhoneError('Failed to verify phone');
    } finally {
      setPhoneVerifying(false);
    }
  };

  const handleResendPhone = async () => {
    setPhoneError('');
    setPhoneMessage('');
    try {
      const response = await fetch(`${API_URL}/api/auth/resend-phone-verification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: phoneNumberInput })
      });

      const data = await response.json();
      if (!data.success) {
        setPhoneError(data.error?.message || 'Failed to resend code');
        return;
      }

      setPhoneMessage('Verification code resent if number exists.');
    } catch (err) {
      setPhoneError('Failed to resend code');
    }
  };

  const handleContentInteraction = async (contentId, action) => {
    if (!getToken()) {
      alert('Please login to like or bookmark posts.');
      return;
    }

    const interactionKey = `${action}:${contentId}`;
    if (pendingInteractionKey) {
      return;
    }

    const currentLikes = Array.isArray(authUser?.likes) ? authUser.likes.map((value) => String(value)) : [];
    const currentBookmarks = Array.isArray(authUser?.bookmarks) ? authUser.bookmarks.map((value) => String(value)) : [];
    const nextActive = action === 'like'
      ? !currentLikes.includes(String(contentId))
      : !currentBookmarks.includes(String(contentId));

    setPendingInteractionKey(interactionKey);

    try {
      const response = await fetch(`${API_URL}/api/content/${contentId}/${action}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${getToken()}`
        }
      });

      const data = await response.json();

      if (!data.success) {
        alert(data.error?.message || `Failed to update ${action}`);
        return;
      }

      setContent((prev) => prev.map((item) => (String(item._id) === String(contentId) ? data.data : item)));
      invalidateContentMutationCaches();
      updateCurrentUserCollection(action === 'like' ? 'likes' : 'bookmarks', contentId, nextActive);
    } catch (err) {
      alert(`Failed to update ${action}`);
    } finally {
      setPendingInteractionKey('');
    }
  };

  if (loading) {
    return (
      <div className="panel flex min-h-72 items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-slate-300">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-slate-700 border-t-brand" />
          <p className="text-sm">Loading profile...</p>
        </div>
      </div>
    );
  }

  if (error && !profile) {
    return (
      <div className="detail-empty-state">
        <div className="text-lg font-semibold text-white">Cannot load profile</div>
        <p className="max-w-md text-sm text-slate-400">{error}</p>
      </div>
    );
  }

  const relationData = relationView === 'followers' ? followers : followingList;

  return (
    <div className="detail-shell max-w-7xl">
      <div className="detail-hero">
        <div className="flex flex-col gap-8 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex flex-1 items-start gap-6">
            <div className="relative">
              {profile?.avatar ? (
                <img
                  src={`${API_URL}${profile.avatar}`}
                  alt={profile.username}
                  className="h-24 w-24 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-brand to-purple-600 text-4xl font-semibold text-white">
                  {profile?.username?.charAt(0).toUpperCase()}
                </div>
              )}

              {isOwnProfile ? (
                <label className="absolute bottom-0 right-0 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-brand text-white transition hover:bg-brand-light">
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp"
                    onChange={handleAvatarUpload}
                    disabled={uploadingAvatar}
                    className="hidden"
                  />
                  {uploadingAvatar ? (
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  ) : (
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  )}
                </label>
              ) : null}
            </div>

            <div className="flex-1 space-y-3">
              <div>
                <p className="detail-eyebrow">Profile detail</p>
                <h1 className="detail-title mt-2">{profile?.username}</h1>
                <p className="text-slate-400">{profile?.email}</p>
              </div>

              {profile?.bio ? <p className="max-w-2xl text-sm leading-6 text-slate-300">{profile.bio}</p> : null}

              <div className="flex flex-wrap gap-3 text-sm">
                <button type="button" onClick={() => fetchRelationList('followers')} className="detail-inline-button">
                  {stats.followerCount} followers
                </button>
                <button type="button" onClick={() => fetchRelationList('following')} className="detail-inline-button">
                  {stats.followingCount} following
                </button>
                <span className="detail-count-pill px-4 py-2">
                  {content.length} posts
                </span>
                {profile?.role === 'admin' ? (
                  <span className="rounded-full border border-rose-500/30 bg-rose-500/10 px-3 py-1 text-sm text-rose-300">
                    Admin
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          {!isOwnProfile ? (
            isFollowing ? (
              <button
                type="button"
                onClick={handleUnfollow}
                className="inline-flex items-center justify-center rounded-2xl border border-slate-700 bg-slate-900 px-6 py-3 text-sm font-medium text-slate-100 transition hover:bg-slate-800"
              >
                Unfollow
              </button>
            ) : (
              <button
                type="button"
                onClick={handleFollow}
                className="inline-flex items-center justify-center rounded-2xl bg-brand px-6 py-3 text-sm font-medium text-white transition hover:bg-brand-light"
              >
                Follow
              </button>
            )
          ) : null}
        </div>

        {error ? (
          <div className="mt-6 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
            {error}
          </div>
        ) : null}
      </div>

      {isOwnProfile ? (
        <form onSubmit={handleProfileSubmit} className="detail-card p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-white">Edit Profile</h2>
            <button
              type="submit"
              disabled={savingProfile}
              className="inline-flex items-center justify-center rounded-2xl bg-brand px-5 py-2.5 text-sm font-medium text-white transition hover:bg-brand-light disabled:cursor-not-allowed disabled:opacity-60"
            >
              {savingProfile ? 'Saving...' : 'Save Profile'}
            </button>
          </div>

          <div className="mt-6 grid gap-5 lg:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-300">Username</label>
              <input
                type="text"
                value={profileForm.username}
                onChange={(event) => setProfileForm((prev) => ({ ...prev, username: event.target.value }))}
                className="input-base"
                maxLength={50}
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-300">Email</label>
              <input
                type="email"
                value={profileForm.email}
                onChange={(event) => setProfileForm((prev) => ({ ...prev, email: event.target.value }))}
                className="input-base"
              />
            </div>

            <div className="lg:col-span-2">
              <label className="mb-2 block text-sm font-medium text-slate-300">Bio</label>
              <textarea
                value={profileForm.bio}
                onChange={(event) => setProfileForm((prev) => ({ ...prev, bio: event.target.value }))}
                className="input-base resize-none"
                rows={4}
                maxLength={300}
                placeholder="Tell people about yourself..."
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-300">Phone number</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={phoneNumberInput}
                  onChange={(event) => setPhoneNumberInput(event.target.value)}
                  className="input-base"
                  placeholder="+84123456789"
                />
                <button
                  type="button"
                  onClick={handleUpdatePhone}
                  disabled={phoneSending}
                  className="inline-flex items-center justify-center rounded-2xl bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-light disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {phoneSending ? 'Sending...' : 'Send verification'}
                </button>
              </div>
              {profile?.phoneVerified ? (
                <p className="mt-2 text-xs text-green-400">Verified</p>
              ) : (
                <p className="mt-2 text-xs text-slate-400">Not verified</p>
              )}
            </div>

            <div className="lg:col-span-2">
              <label className="mb-2 block text-sm font-medium text-slate-300">Verification code</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={phoneCodeInput}
                  onChange={(event) => setPhoneCodeInput(event.target.value)}
                  className="input-base"
                  placeholder="123456"
                />
                <button
                  type="button"
                  onClick={handleVerifyPhone}
                  disabled={phoneVerifying}
                  className="inline-flex items-center justify-center rounded-2xl bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-light disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {phoneVerifying ? 'Verifying...' : 'Verify'}
                </button>
                <button type="button" onClick={handleResendPhone} className="text-sm text-slate-300 hover:text-white">
                  Resend code
                </button>
              </div>
              {phoneMessage ? <p className="mt-2 text-sm text-green-400">{phoneMessage}</p> : null}
              {phoneError ? <p className="mt-2 text-sm text-rose-300">{phoneError}</p> : null}
            </div>
          </div>
        </form>
      ) : null}

      <section className="detail-card p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="detail-eyebrow">Creator network</p>
            <h2 className="mt-2 text-xl font-semibold text-white">Following creators</h2>
          </div>
          {followingList.length > 0 ? (
            <button type="button" onClick={() => fetchRelationList('following')} className="detail-inline-button px-4 py-2 text-xs">
              View all
            </button>
          ) : null}
        </div>

        {followingList.length > 0 ? (
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {followingList.slice(0, 6).map((creator) => (
              <Link key={creator._id} to={`/profile/${creator._id}`} className="panel-soft flex items-center gap-3 p-4 transition hover:border-slate-500">
                {creator.avatar ? (
                  <img src={`${API_URL}${creator.avatar}`} alt={creator.username} className="h-12 w-12 rounded-full object-cover" />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-brand to-purple-600 text-lg font-semibold text-white">
                    {creator.username?.[0]?.toUpperCase() || '?'}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="truncate font-medium text-white">{creator.username}</p>
                  <p className="truncate text-sm text-slate-400">{creator.bio || 'No bio yet'}</p>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm text-slate-400">This profile is not following any creators yet.</p>
        )}
      </section>

      {relationView ? (
        <section className="detail-card p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-white">{relationView === 'followers' ? 'Followers' : 'Following'}</h2>
            <button type="button" onClick={() => setRelationView('')} className="detail-inline-button px-3 py-2 text-xs">
              Close
            </button>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {relationData.length > 0 ? relationData.map((user) => (
              <Link key={user._id} to={`/profile/${user._id}`} className="panel-soft flex items-center gap-3 p-4 transition hover:border-slate-500">
                {user.avatar ? (
                  <img src={`${API_URL}${user.avatar}`} alt={user.username} className="h-12 w-12 rounded-full object-cover" />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-brand to-purple-600 text-lg font-semibold text-white">
                    {user.username?.[0]?.toUpperCase() || '?'}
                  </div>
                )}
                <div>
                  <p className="font-medium text-white">{user.username}</p>
                  <p className="text-sm text-slate-400">{user.bio || 'No bio yet'}</p>
                </div>
              </Link>
            )) : <p className="text-sm text-slate-400">No users to show.</p>}
          </div>
        </section>
      ) : null}

      {isOwnProfile ? (
        <section className="detail-card p-6">
          <h2 className="text-xl font-semibold text-white">Reading History</h2>
          {history.length > 0 ? (
            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {history.slice(0, 9).map((item) => {
                const isStory = item.contentType === 'Story' || item.content !== undefined;
                const detailPath = isStory ? `/story/${item._id}` : `/artwork/${item._id}`;
                return (
                  <Link
                    key={`${item._id}-${item.readAt}`}
                    to={detailPath}
                    {...getRoutePrefetchProps(detailPath)}
                    className="panel-soft p-4 transition hover:border-slate-500"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="rounded-full border border-slate-700 px-3 py-1 text-xs uppercase text-slate-300">
                        {isStory ? 'story' : 'artwork'}
                      </span>
                      <span className="text-xs text-slate-500">{formatRelative(item.readAt)}</span>
                    </div>
                    <h3 className="mt-4 text-lg font-semibold text-white">{item.title}</h3>
                    <p className="mt-2 line-clamp-2 text-sm text-slate-400">{item.description || 'No description'}</p>
                  </Link>
                );
              })}
            </div>
          ) : (
            <p className="mt-4 text-sm text-slate-400">No reading history yet.</p>
          )}
        </section>
      ) : null}

      <div>
        <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="detail-eyebrow">Published archive</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Content ({content.length})</h2>
          </div>
        </div>

        {content.length === 0 ? (
          <div className="detail-empty-state">
            <div className="text-lg font-semibold text-white">No content yet</div>
            <p className="max-w-md text-sm text-slate-400">No published content available</p>
          </div>
        ) : (
          <div className="grid gap-5 lg:grid-cols-2">
            {content.map((item) => {
              const isStory = item.content !== undefined;
              const detailPath = isStory ? `/story/${item._id}` : `/artwork/${item._id}`;
              const displayTags = normalizeTagList(item.tags || []).slice(0, 3);
              const itemId = String(item._id);
              const isLiked = likedIds.includes(itemId);
              const isBookmarked = bookmarkedIds.includes(itemId);

              return (
                <article key={item._id} className="panel overflow-hidden" {...getRoutePrefetchProps(detailPath)}>
                  <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3">
                    <div className="flex items-center gap-2">
                      <span className="rounded-full border border-slate-700 px-3 py-1 text-xs uppercase text-slate-300">
                        {isStory ? 'story' : 'artwork'}
                      </span>
                      <span className="rounded-full border border-slate-700 px-3 py-1 text-xs uppercase text-slate-300">
                        {item.status || 'approved'}
                      </span>
                    </div>
                    <span className="text-xs text-slate-500">{item.views || 0} views</span>
                  </div>

                  {!isStory && item.images && item.images[0] ? (
                    <div className="flex h-48 items-center justify-center bg-slate-950">
                      <img
                        src={item.images[0].startsWith('http') ? item.images[0] : `${API_URL}${item.images[0]}`}
                        alt={item.title}
                        className="max-h-full max-w-full object-contain"
                      />
                    </div>
                  ) : null}

                  <div className="space-y-4 p-5">
                    <h3 className="text-xl font-semibold text-white">{item.title}</h3>
                    <p className="line-clamp-3 text-slate-400">{item.description || 'No description'}</p>

                    {displayTags.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {displayTags.map((tag) => (
                          <span key={tag} className="rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-300">
                            {formatTag(tag)}
                          </span>
                        ))}
                      </div>
                    ) : null}

                    <div className="flex flex-wrap items-center gap-3 text-sm">
                      <button
                        type="button"
                        onClick={() => handleContentInteraction(itemId, 'like')}
                        disabled={pendingInteractionKey === `like:${itemId}`}
                        className={`interaction-pill ${isLiked ? 'interaction-pill-like-active' : ''}`}
                      >
                        <Heart size={15} fill={isLiked ? 'currentColor' : 'none'} />
                        {formatCount(item.likes || 0)}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleContentInteraction(itemId, 'bookmark')}
                        disabled={pendingInteractionKey === `bookmark:${itemId}`}
                        className={`interaction-pill ${isBookmarked ? 'interaction-pill-bookmark-active' : ''}`}
                      >
                        <Bookmark size={15} fill={isBookmarked ? 'currentColor' : 'none'} />
                        {formatCount(item.bookmarks || 0)}
                      </button>
                    </div>

                    <div className="flex flex-wrap items-center gap-4">
                      <Link
                        to={detailPath}
                        {...getRoutePrefetchProps(detailPath)}
                        className="inline-flex items-center gap-2 text-sm font-medium text-brand-light transition hover:text-brand"
                      >
                        {isStory ? 'Read story' : 'View artwork'} →
                      </Link>
                      {isOwnProfile ? (
                        <Link
                          to={isStory ? `/story/${item._id}/edit` : `/artwork/${item._id}/edit`}
                          {...getRoutePrefetchProps(isStory ? `/story/${item._id}/edit` : `/artwork/${item._id}/edit`)}
                          className="text-sm text-slate-300 transition hover:text-white"
                        >
                          Edit
                        </Link>
                      ) : null}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
