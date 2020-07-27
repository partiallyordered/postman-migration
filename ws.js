
const WebSocket = require('ws');

module.exports = class SimWebSocket {
    constructor(url) {
        this.sock = new WebSocket(url);
        this.messages = [];
        this.sock.on('message', (data) => this.messages.push(JSON.parse(data)));
    }

    getByIdSync(id) {
        return this.messages.filter((msg) => msg.id === id);
    }

    async getLatestByIdOrWait(id) {
        const received = this.getByIdSync(id);
        if (received.length > 0) {
            return received[received.length - 1];
        }
        return this.getNext(data => data.id === id);
    }

    async getNext(filter = () => true) {
        return new Promise((resolve) => {
            // TODO: does this leak memory? Does the event need to be unsubscribed? Similarly other
            // event subscriptions.
            this.sock.on('message', (data) => {
                const parsed = JSON.parse(data);
                if (filter(parsed)) {
                    resolve(parsed);
                }
            });
        });
    }

    async close(...args) {
        return new Promise((resolve) => {
            this.sock.close(...args);
            this.sock.on('close', resolve);
        });
    }
};
