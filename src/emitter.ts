export type EmitterCallback<T> = (arg: T) => void; 

/**
 * Minimal implementation like EventTarget, EventEmitter
 */
export class Emitter<T> {
  listeners: EmitterCallback<T>[];

  constructor() {
    this.listeners = [];
  }

  listen(listener: EmitterCallback<T>) {
    this.listeners.push(listener);
  }

  stop(listener: EmitterCallback<T>) {
    this.listeners = this.listeners.filter(l => l !== listener);
  }

  emit(arg: T) {
    for (const listener of this.listeners) {
      listener(arg);
    }
  }
}
