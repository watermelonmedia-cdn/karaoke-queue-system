/**
 * Shared code between client and server
 * Useful to share types between client and server
 * and/or small pure JS functions that can be used on both client and server
 */

/**
 * Example response type for /api/demo
 */
export interface DemoResponse {
  message: string;
}

export type RequestStatus = "pending" | "approved" | "performing" | "complete";

export interface EventItem {
  id: string;
  name: string;
  datetime: string;
  location: string;
  isPublic: boolean;
}

export interface RequestItem {
  id: string;
  eventId: string;
  singer: string;
  songTitle: string;
  artist: string;
  status: RequestStatus;
  createdAt: number;
  deviceId: string;
  ip?: string;
  order?: number;
  startedAt?: number;
  completedAt?: number;
}

export interface ArchiveItem {
  id: string; // request id
  eventId: string;
  eventName: string;
  singer: string;
  songTitle: string;
  artist: string;
  submittedAt: number;
  startedAt: number | null;
  completedAt: number;
  queueWaitMs: number | null;
}
