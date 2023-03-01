class StubWebSocket {
  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.sent = [];
    this.listeners = {};
  }

  send(data) {
    this.sent.push(data);
  }

  close() {
    this.readyState = 3;
  }

  addEventListener(type, listener) {
    if (!this.listeners[type]) {
      this.listeners[type] = [];
    }
    this.listeners[type].push(listener);
  }

  removeEventListener(type, listener) {
    if (this.listeners[type]) {
      this.listeners[type] = this.listeners[type].filter(l => l !== listener);
    }
  }

  dispatch(type, event) {
    if (this.listeners[type]) {
      for (const listener of this.listeners[type]) {
        listener(event);
      }
    }
  }
}

global.TextEncoder = require('util').TextEncoder;
global.crypto.subtle = require('crypto').subtle;
global.WebSocket = StubWebSocket;