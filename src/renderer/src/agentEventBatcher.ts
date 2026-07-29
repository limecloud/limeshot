import type { AgentEvent } from '../../shared/desktop';

type CancelScheduledFrame = () => void;
type ScheduleFrame = (flush: () => void) => CancelScheduledFrame;

export interface AgentEventBatcher {
  push(event: AgentEvent): void;
  dispose(): void;
}

export function createAgentEventBatcher(
  consume: (events: AgentEvent[]) => void,
  schedule: ScheduleFrame = scheduleRendererFrame,
): AgentEventBatcher {
  let queued: AgentEvent[] = [];
  let cancelScheduled: CancelScheduledFrame | undefined;

  const flush = () => {
    cancelScheduled = undefined;
    const events = queued;
    queued = [];
    if (events.length > 0) consume(events);
  };

  return {
    push(event) {
      queued.push(event);
      cancelScheduled ??= schedule(flush);
    },
    dispose() {
      cancelScheduled?.();
      cancelScheduled = undefined;
      queued = [];
    },
  };
}

function scheduleRendererFrame(flush: () => void): CancelScheduledFrame {
  if (typeof window.requestAnimationFrame === 'function') {
    const frameId = window.requestAnimationFrame(flush);
    return () => window.cancelAnimationFrame(frameId);
  }
  const timeoutId = window.setTimeout(flush, 0);
  return () => window.clearTimeout(timeoutId);
}
