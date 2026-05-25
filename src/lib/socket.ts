import { io } from 'socket.io-client';
import { getAppOrigin } from './runtime';

// Connect to the same origin, try websocket first to avoid initial 1MB nginx payload limits during polling
export const socket = io(getAppOrigin(), {
  transports: ['websocket', 'polling'],
});
