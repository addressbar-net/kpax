// Lightweight Global Event Bus Mediator

class EventBusManager {
    constructor() {
        this.listeners = {};
    }

    on(event, callback) {
        if (!this.listeners[event]) {
            this.listeners[event] = [];
        }
        this.listeners[event].push(callback);
    }

    off(event, callback) {
        if (!this.listeners[event]) return;
        this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    }

    emit(event, data = null) {
        if (!this.listeners[event]) return;
        for (let i = 0; i < this.listeners[event].length; i++) {
            this.listeners[event][i](data);
        }
    }
}

window.EventBus = new EventBusManager();