var MockSocket = function() {
    this._events = {};
    this._messages = [];
    this._responders = {};
    this.readyState = 1;
};

MockSocket.prototype.on = function(event, handler) {
    this._events[event] = handler;
};

MockSocket.prototype.send = function(msg) {
    msg = JSON.parse(msg);
    this._messages.push(msg);
    if (this._responders[msg.type]) {
        setTimeout(() => {
            this.receive(this._responders[msg.type](msg));
        }, 0);
    }
};

/////////////////////////// test helpers /////////////////////////// 
MockSocket.prototype.addResponse = function(type, fn) {
    this._responders[type] = fn;
};

MockSocket.prototype.receive = function(json) {
    var msg = JSON.stringify(json);
    this._events.message(msg);
};

MockSocket.prototype.message = function(index) {
    if (index < 0) {
        return this._messages[this._messages.length+index];
    } else {
        return this._messages[index];
    }
};

MockSocket.prototype.messages = function() {
    return this._messages.slice();
};

MockSocket.prototype.reset = function() {
    this._messages = [];
    this._events = {};
};

module.exports = MockSocket;
