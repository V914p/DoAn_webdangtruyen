import ArtistSubscription from '../models/ArtistSubscription.js';

export function canPublishSubscriberOnlyContent(user) {
  return Boolean(
    user &&
    user.creatorPlan === 'premium_artist' &&
    user.premiumStatus === 'active' &&
    user.subscriptionEnabled === true &&
    typeof user.subscriptionPrice === 'number' &&
    user.subscriptionPrice >= 0
  );
}

export async function hasActiveArtistSubscription(subscriberId, artistId) {
  if (!subscriberId || !artistId) {
    return false;
  }

  const subscription = await ArtistSubscription.findOne({
    subscriber: subscriberId,
    artist: artistId,
    status: 'active',
    expiresAt: { $gt: new Date() }
  }).lean();

  return Boolean(subscription);
}
