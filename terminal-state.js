export function canCopyResolution(resolution, now = Date.now()) {
  return Boolean(resolution?.canCopy && now >= Date.parse(resolution.config.validFrom) && now < Date.parse(resolution.config.validTo));
}

export function elapsedSession(session, now = Date.now()) {
  return Math.max(0, session.elapsed + (session.startedAt === null ? 0 : now - session.startedAt));
}

export function formatElapsed(milliseconds) {
  const seconds = Math.floor(Math.max(0, milliseconds) / 1000);
  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
    .map(value => String(value).padStart(2, '0')).join(':');
}
