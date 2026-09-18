// Where each sensor physically sits, for the origins map to draw arrivals
// toward. Keyed by the sensor id the API reports; an id not listed here draws
// no arcs rather than arcs to a guessed place.
export interface Site {
  label: string;
  lat: number;
  lon: number;
}

export const SITES: Record<string, Site> = {
  "nbg-01": { label: "Nuremberg", lat: 49.45, lon: 11.08 },
  "fra-01": { label: "Frankfurt", lat: 50.11, lon: 8.68 },
};

export const siteOf = (sensor: string | undefined): Site | null =>
  sensor ? (SITES[sensor.toLowerCase()] ?? null) : null;
