///////////////////////////////////////////////////////////////////////////
// WebSocket client driver

var DEFAULT_RECONNECT_DELAY = 100;
var MAX_RECONNECT_DELAY = 30000;
var DEFAULT_IDLE_TIMEOUT = 300000; // 5 minutes
var DEFAULT_PING_INTERVAL = DEFAULT_IDLE_TIMEOUT - 10000;

function WebSocketConnection(label, wsurl, shouldReconnect) {
    this.label = label;
    this.wsurl = wsurl;
    this.shouldReconnect = shouldReconnect ? true : false;
    this.reconnectDelay = DEFAULT_RECONNECT_DELAY;
    this.localRoutes = [];
    this.peerRoutes = [];
    this.prevPeerRoutesMessage = null;
    this.sock = null;
    this.deduplicator = new Deduplicator();

    this.activityTimestamp = 0;
    this.idleTimeout = DEFAULT_IDLE_TIMEOUT;
    this.pingInterval = DEFAULT_PING_INTERVAL;
    this.idleTimer = null;
    this.pingTimer = null;
}

WebSocketConnection.prototype.clearHeartbeatTimers = function () {
    if (this.idleTimer) { clearTimeout(this.idleTimer); this.idleTimer = null; }
    if (this.pingTimer) { clearTimeout(this.pingTimer); this.pingTimer = null; }
};

WebSocketConnection.prototype.recordActivity = function () {
    var self = this;
    this.activityTimestamp = +(new Date());
    this.clearHeartbeatTimers();
    this.idleTimer = setTimeout(function () { self.forceclose(); },
				this.idleTimeout);
    this.pingTimer = setTimeout(function () { self.safeSend(JSON.stringify("ping")) },
				this.pingInterval);
};

WebSocketConnection.prototype.statusRoute = function (status) {
    return pub([this.label + "_state", status]);
};

WebSocketConnection.prototype.relayRoutes = function () {
    // fresh copy each time, suitable for in-place extension/mutation
    return [this.statusRoute(this.isConnected() ? "connected" : "disconnected"),
	    pub([this.label, __, __], 0, 1000),
	    sub([this.label, __, __], 0, 1000)];
};

WebSocketConnection.prototype.aggregateRoutes = function () {
    var rs = this.relayRoutes();
    for (var i = 0; i < this.peerRoutes.length; i++) {
	var r = this.peerRoutes[i];
	rs.push(new Route(r.isSubscription,
			  // TODO: This is a horrible syntactic hack
			  // (in conjunction with the numberness-test
			  // in handleEvent's routes handler) for
			  // distinguishing routes published on behalf
			  // of the remote side from those published
			  // by the local side. See (**HACK**) mark
			  // below.
			  [this.label, __, r.pattern],
			  r.metaLevel,
			  r.level));
    }
    // console.log("WebSocketConnection.aggregateRoutes", this.label, rs);
    return rs;
};

WebSocketConnection.prototype.boot = function () {
    this.reconnect();
};

WebSocketConnection.prototype.trapexit = function () {
    this.forceclose();
};

WebSocketConnection.prototype.isConnected = function () {
    return this.sock && this.sock.readyState === this.sock.OPEN;
};

WebSocketConnection.prototype.safeSend = function (m) {
    try {
	if (this.isConnected()) { this.sock.send(m); }
    } catch (e) {
	console.warn("Trapped exn while sending", e);
    }
};

WebSocketConnection.prototype.sendLocalRoutes = function () {
    this.safeSend(JSON.stringify(encodeEvent(updateRoutes(this.localRoutes))));
};

WebSocketConnection.prototype.handleEvent = function (e) {
    // console.log("WebSocketConnection.handleEvent", e);
    switch (e.type) {
    case "routes":
	this.localRoutes = [];
	for (var i = 0; i < e.routes.length; i++) {
	    var r = e.routes[i];
	    if (r.pattern.length && r.pattern.length === 3
		&& r.pattern[0] === this.label
		// TODO: This is a horrible syntactic hack (in
		// conjunction with the use of __ in in
		// aggregateRoutes) for distinguishing routes
		// published on behalf of the remote side from those
		// published by the local side. See (**HACK**) mark
		// above.
		&& typeof(r.pattern[1]) === "number")
	    {
		this.localRoutes.push(new Route(r.isSubscription,
						r.pattern[2],
						r.pattern[1],
						r.level));
	    }
	}
	this.sendLocalRoutes();
	break;
    case "message":
	var m = e.message;
	if (m.length && m.length === 3
	    && m[0] === this.label
	    && typeof(m[1]) === "number")
	{
	    var encoded = JSON.stringify(encodeEvent(sendMessage(m[2], m[1], e.isFeedback)));
	    if (this.deduplicator.accept(encoded)) {
		this.safeSend(encoded);
	    }
	}
	break;
    }
};

WebSocketConnection.prototype.forceclose = function (keepReconnectDelay) {
    if (!keepReconnectDelay) {
	this.reconnectDelay = DEFAULT_RECONNECT_DELAY;
    }
    this.clearHeartbeatTimers();
    if (this.sock) {
	console.log("WebSocketConnection.forceclose called");
	this.sock.close();
	this.sock = null;
    }
};

WebSocketConnection.prototype.reconnect = function () {
    var self = this;
    this.forceclose(true);
    this.sock = new WebSocket(this.wsurl);
    this.sock.onopen = World.wrap(function (e) { return self.onopen(e); });
    this.sock.onmessage = World.wrap(function (e) { return self.onmessage(e); });
    this.sock.onclose = World.wrap(function (e) { return self.onclose(e); });
};

WebSocketConnection.prototype.onopen = function (e) {
    console.log("connected to " + this.sock.url);
    this.reconnectDelay = DEFAULT_RECONNECT_DELAY;
    this.sendLocalRoutes();
};

WebSocketConnection.prototype.onmessage = function (wse) {
    // console.log("onmessage", wse);
    this.recordActivity();

    var j = JSON.parse(wse.data);
    if (j === "ping") {
	this.safeSend(JSON.stringify("pong"));
	return;
    } else if (j === "pong") {
	return; // recordActivity already took care of our timers
    }

    var e = decodeAction(j);
    switch (e.type) {
    case "routes":
	if (this.prevPeerRoutesMessage !== wse.data) {
	    this.prevPeerRoutesMessage = wse.data;
	    this.peerRoutes = e.routes;
	    World.updateRoutes(this.aggregateRoutes());
	}
	break;
    case "message":
	if (this.deduplicator.accept(wse.data)) {
	    World.send([this.label, e.metaLevel, e.message], 0, e.isFeedback);
	}
	break;
    }
};

WebSocketConnection.prototype.onclose = function (e) {
    var self = this;
    console.log("onclose", e);

    // Update routes to give clients some indication of the discontinuity
    World.updateRoutes(this.aggregateRoutes());

    if (this.shouldReconnect) {
	console.log("reconnecting to " + this.wsurl + " in " + this.reconnectDelay + "ms");
	setTimeout(World.wrap(function () { self.reconnect(); }), this.reconnectDelay);
	this.reconnectDelay = this.reconnectDelay * 1.618 + (Math.random() * 1000);
	this.reconnectDelay =
	    this.reconnectDelay > MAX_RECONNECT_DELAY
	    ? MAX_RECONNECT_DELAY + (Math.random() * 1000)
	    : this.reconnectDelay;
    }
};

///////////////////////////////////////////////////////////////////////////
// Wire protocol representation of events and actions

function encodeEvent(e) {
    switch (e.type) {
    case "routes":
	var rs = [];
	for (var i = 0; i < e.routes.length; i++) {
	    rs.push(e.routes[i].toJSON());
	}
	return ["routes", rs];
    case "message":
	return ["message", e.message, e.metaLevel, e.isFeedback];
    }
}

function decodeAction(j) {
    switch (j[0]) {
    case "routes":
	var rs = [];
	for (var i = 0; i < j[1].length; i++) {
	    rs.push(Route.fromJSON(j[1][i]));
	}
	return updateRoutes(rs);
    case "message":
	return sendMessage(j[1], j[2], j[3]);
    default:
	throw { message: "Invalid JSON-encoded action: " + JSON.stringify(j) };
    }
}
