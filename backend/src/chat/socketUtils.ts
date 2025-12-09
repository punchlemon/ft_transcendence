export function sendToSockets(sockets: Iterable<any> | undefined, payload: string) {
  if (!sockets) return
  for (const ws of sockets) {
    try {
      if (!ws) continue
      // readyState 1 == OPEN
      if (ws.readyState === 1 && typeof ws.send === 'function') {
        ws.send(payload)
      }
    } catch (e) {
      // ignore individual socket send errors
    }
  }
}
