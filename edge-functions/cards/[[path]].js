import { onRequest as serveCards } from './index.js';

export function onRequest(context) {
  return serveCards(context);
}
