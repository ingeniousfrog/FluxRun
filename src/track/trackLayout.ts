/** Shared track edge layout — visual barriers and physics walls use the same offset. */
export const TRACK_SHOULDER_WIDTH = 0.85;
export const TRACK_CURB_WIDTH = 0.42;
export const TRACK_BARRIER_INSET = 0.15;
/** Physics barrier box half-extent along track normal (see CarPhysics.buildTrackColliders). */
export const TRACK_BARRIER_HALF_DEPTH = 0.32;

export function getBarrierEdgeOffset(halfWidth: number): number {
  return halfWidth + TRACK_SHOULDER_WIDTH + TRACK_CURB_WIDTH + TRACK_BARRIER_INSET;
}
