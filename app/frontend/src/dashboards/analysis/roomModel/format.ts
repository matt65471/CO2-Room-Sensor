// Formatting for the room-model summary and decay list

export function formatDuration(hours: number): string {
  const mins = Math.round(hours * 60);
  return mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)} h ${String(mins % 60).padStart(2, '0')} min`;
}

// e.g. "Nov 16, 09:35 AM"
export const formatWhen = (iso: string) =>
  new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

// e.g. "Nov 16"
export const formatDay = (iso: string) => new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
