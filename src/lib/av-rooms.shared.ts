// P50 — AV rooms helpers.
export function canJoin(room: { status: string; max_participants: number }, currentCount: number) {
  if (room.status === "ended") return { ok: false, reason: "Room ended" };
  if (room.status === "locked") return { ok: false, reason: "Room locked" };
  if (currentCount >= room.max_participants) return { ok: false, reason: "Room is full" };
  return { ok: true as const };
}
export function pickMode(participants: number): "mesh" | "sfu" {
  // Mesh fine up to ~5 peers (n*(n-1) connections). Beyond that, SFU.
  return participants <= 5 ? "mesh" : "sfu";
}
