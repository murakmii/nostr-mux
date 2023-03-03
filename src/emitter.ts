export type EmitterCallback<T> = (arg: T) => void; 

export interface Emitter<T> {
  listen(listener: EmitterCallback<T>): void;
  stop(listener: EmitterCallback<T>): void;
  emit(arg: T): void
}

export class SimpleEmitter<T> implements Emitter<T> {
  private listeners: EmitterCallback<T>[];

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
