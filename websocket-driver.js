///////////////////////////////////////////////////////////////////////////
// WebSocket client driver

var DEFAULT_RECONNECT_DELAY = 100;
var MAX_RECONNECT_DELAY = 30000;
var DEFAULT_IDLE_TIMEOUT = 300000; // 5 minutes
var DEFAULT_PING_INTERVAL = DEFAULT_IDLE_TIMEOUT - 10000;

function WebSocketConnection(label, wsurl, shouldReconnect) {
    this.label = label;
    this.sendsAttempted = 0;
    this.sendsTransmitted = 0;
    this.receiveCount = 0;
    this.sock = null;
    this.wsurl = wsurl;
    this.shouldReconnect = shouldReconnect ? true : false;
    this.reconnectDelay = DEFAULT_RECONNECT_DELAY;
    this.localGestalt = route.emptyGestalt;
    this.peerGestalt = route.emptyGestalt;
    this.prevLocalRoutesMessage = null;
    this.prevPeerRoutesMessage = null;
    this.deduplicator = new Deduplicator();
    this.connectionCount = 0;

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

WebSocketConnection.prototype.relayGestalt = function () {
    return this.statusRoute(this.isConnected() ? "connected" : "disconnected")
	.union(pub([this.label, __, __], 0, 10))
	.union(sub([this.label, __, __], 0, 10));
    // TODO: level 10 is ad-hoc; support infinity at some point in future
};

WebSocketConnection.prototype.aggregateGestalt = function () {
    var self = this;
    return this.peerGestalt.transform(function (m, metaLevel) {
	return route.compilePattern(true,
				    [self.label, metaLevel, route.embeddedMatcher(m)]);
    }).union(this.relayGestalt());
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
	this.sendsAttempted++;
	if (this.isConnected()) {
	    this.sock.send(m);
	    this.sendsTransmitted++;
	}
    } catch (e) {
	console.warn("Trapped exn while sending", e);
    }
};

WebSocketConnection.prototype.sendLocalRoutes = function () {
    var newLocalRoutesMessage = JSON.stringify(encodeEvent(updateRoutes([this.localGestalt])));
    if (this.prevLocalRoutesMessage !== newLocalRoutesMessage) {
	this.prevLocalRoutesMessage = newLocalRoutesMessage;
	this.safeSend(newLocalRoutesMessage);
    }
};

WebSocketConnection.prototype.collectMatchers = function (getAdvertisements, level, g) {
    var extractMetaLevels = route.compileProjection([this.label, _$, __]);
    var mls = route.matcherKeys(g.project(extractMetaLevels, getAdvertisements, 0, level));
    for (var i = 0; i < mls.length; i++) {
	var metaLevel = mls[i][0]; // only one capture in the projection
	var extractMatchers = route.compileProjection([this.label, metaLevel, _$]);
	var m = g.project(extractMatchers, getAdvertisements, 0, level);
	this.localGestalt = this.localGestalt.union(route.simpleGestalt(getAdvertisements,
									route.embeddedMatcher(m),
									metaLevel,
									level));
    }
};

WebSocketConnection.prototype.handleEvent = function (e) {
    // console.log("WebSocketConnection.handleEvent", e);
    switch (e.type) {
    case "routes":
	// TODO: GROSS - erasing by pid!
	var nLevels = e.gestalt.levelCount(0);
	var relayGestalt = route.fullGestalt(1, nLevels).label(World.activePid());
	var g = e.gestalt.erasePath(relayGestalt);
	this.localGestalt = route.emptyGestalt;
	for (var level = 0; level < nLevels; level++) {
	    this.collectMatchers(false, level, g);
	    this.collectMatchers(true, level, g);
	}

	this.sendLocalRoutes();
	break;
    case "message":
	var m = e.message;
	if (m.length && m.length === 3 && m[0] === this.label)
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
    this.connectionCount++;
    this.sock = new WebSocket(this.wsurl);
    this.sock.onopen = World.wrap(function (e) { return self.onopen(e); });
    this.sock.onmessage = World.wrap(function (e) {
	self.receiveCount++;
	return self.onmessage(e);
    });
    this.sock.onclose = World.wrap(function (e) { return self.onclose(e); });
};

WebSocketConnection.prototype.onopen = function (e) {
    console.log("connected to " + this.sock.url);
    this.reconnectDelay = DEFAULT_RECONNECT_DELAY;
    this.prevLocalRoutesMessage = null;
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
	    this.peerGestalt = e.gestalt;
	    World.updateRoutes([this.aggregateGestalt()]);
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
    World.updateRoutes([this.aggregateGestalt()]);

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
	return ["routes", e.gestalt.serialize(function (v) { return true; })];
    case "message":
	return ["message", e.message, e.metaLevel, e.isFeedback];
    }
}

function decodeAction(j) {
    switch (j[0]) {
    case "routes":
	return updateRoutes([route.deserializeGestalt(j[1], function (v) { return true; })]);
    case "message":
	return sendMessage(j[1], j[2], j[3]);
    default:
	throw { message: "Invalid JSON-encoded action: " + JSON.stringify(j) };
    }
}
