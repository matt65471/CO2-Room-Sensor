// Colours and names for everything the room model draws on the charts
import type { DecayVerdict, OccupancyEventType, OccupancyLabel } from '../../../api';

// How each kind of CO2 fall is shaded on the CO2 chart and described in the decay list
// (`short` is for the chart legend, `label` for the decay list)
export const VERDICTS: Record<DecayVerdict, { label: string; short: string; color: string }> = {
  empty: { label: 'Empty-room decay (used for λ)', short: 'Empty (used for λ)', color: '#1f8a4c' },
  'settles-above-baseline': {
    label: 'Fall that levelled off (not used for λ due to person in the room)',
    short: 'Fall that levelled off (not used for λ due to person in the room)',
    color: '#8b5cf6',
  },
  ventilation: { label: 'Unusually fast (door/window open)', short: 'Door/window open', color: '#2f7de1' },
  irregular: { label: 'Not a clean decay', short: 'Not used', color: '#8a8f98' },
  inconclusive: { label: 'Too short to judge', short: 'Not used', color: '#8a8f98' },
};

// The G_est labels
export const OCCUPANCY: Record<OccupancyLabel, { label: string; color: string }> = {
  empty: { label: 'Empty', color: '#8a8f98' },
  active: { label: 'Active', color: '#f59f00' },
  asleep: { label: 'Asleep', color: '#5c7cfa' },
  unknown: { label: 'No data', color: 'transparent' },
};

// The dashed lines between G_est labels; each takes the colour of the state it starts
export const EVENTS: Record<OccupancyEventType, { label: string; to: OccupancyLabel }> = {
  arrived: { label: 'Arrived', to: 'active' },
  left: { label: 'Left', to: 'empty' },
  'fell-asleep': { label: 'Asleep', to: 'asleep' },
  'woke-up': { label: 'Awake', to: 'active' },
};
