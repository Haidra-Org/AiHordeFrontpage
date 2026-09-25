/**
 * In-memory stand-in for `BroadcastChannel`, installed with
 * `vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel)`. Delivery is
 * synchronous so a spec can assert straight after posting, and every message
 * goes through `structuredClone` as it would between real tabs, so a payload
 * that cannot cross a tab boundary fails here too.
 */
export class FakeBroadcastChannel {
  public static instances: FakeBroadcastChannel[] = [];

  public onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  public readonly posted: unknown[] = [];
  public closed = false;

  constructor(public readonly name: string) {
    FakeBroadcastChannel.instances.push(this);
  }

  /** Forget every channel, between specs. */
  public static reset(): void {
    FakeBroadcastChannel.instances = [];
  }

  public postMessage(data: unknown): void {
    const clone: unknown = structuredClone(data);
    this.posted.push(clone);
    for (const other of FakeBroadcastChannel.instances) {
      if (other !== this && !other.closed && other.name === this.name) {
        other.onmessage?.({ data: clone } as MessageEvent<unknown>);
      }
    }
  }

  public close(): void {
    this.closed = true;
  }
}

/**
 * A channel standing in for another tab, on the same name as the first
 * channel the app opened.
 */
export function openPeerChannel(): FakeBroadcastChannel {
  const app = FakeBroadcastChannel.instances[0];
  if (!app) {
    throw new Error('The app has not opened a channel yet');
  }
  return new FakeBroadcastChannel(app.name);
}

/** Post as a peer tab would, wrapped the way the app's bus wraps messages. */
export function postFromPeer(
  peer: FakeBroadcastChannel,
  topic: string,
  payload: unknown,
): void {
  peer.postMessage({ topic, payload, sender: 'peer-tab', sentAt: Date.now() });
}
