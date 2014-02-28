/*---------------------------------------------------------------------------*/
/* Unification */

var __ = new Object(); /* wildcard marker */
__.__ = "__";

function unificationFailed() {
    throw {unificationFailed: true};
}

function unify1(a, b) {
    var i;

    if (a === __) return b;
    if (b === __) return a;

    if (a === b) return a;

    if (Array.isArray(a) && Array.isArray(b)) {
	if (a.length !== b.length) unificationFailed();
	var result = new Array(a.length);
	for (i = 0; i < a.length; i++) {
	    result[i] = unify1(a[i], b[i]);
	}
	return result;
    }

    if (typeof a === "object" && typeof b === "object") {
	/* TODO: consider other kinds of matching. I've chosen to
	   require any field mentioned by either side to be present in
	   both. Does that make sense? */
	var result = ({});
	for (i in a) { if (a.hasOwnProperty(i)) result[i] = true; }
	for (i in b) { if (b.hasOwnProperty(i)) result[i] = true; }
	for (i in result) {
	    if (result.hasOwnProperty(i)) {
		result[i] = unify1(a[i], b[i]);
	    }
	}
	return result;
    }

    unificationFailed();
}

function unify(a, b) {
    try {
	// console.log("unify", JSON.stringify(a), JSON.stringify(b));
	return {result: unify1(a, b)};
    } catch (e) {
	if (e.unificationFailed) return undefined;
	throw e;
    }
}

function anyUnify(aa, bb) {
    for (var i = 0; i < aa.length; i++) {
	for (var j = 0; j < bb.length; j++) {
	    if (unify(aa[i], bb[j])) return true;
	}
    }
    return false;
}

/*---------------------------------------------------------------------------*/
/* Events and Actions */

function Route(isSubscription, pattern, metaLevel, level) {
    this.isSubscription = isSubscription;
    this.pattern = pattern;
    this.metaLevel = (metaLevel === undefined) ? 0 : metaLevel;
    this.level = (level === undefined) ? 0 : level;
}

Route.prototype.drop = function () {
    if (this.metaLevel === 0) { return null; }
    return new Route(this.isSubscription, this.pattern, this.metaLevel - 1, this.level);
};

Route.prototype.lift = function () {
    return new Route(this.isSubscription, this.pattern, this.metaLevel + 1, this.level);
};

Route.prototype.toJSON = function () {
    return [this.isSubscription ? "sub" : "pub", this.pattern, this.metaLevel, this.level];
};

Route.fromJSON = function (j) {
    switch (j[0]) {
    case "sub": return new Route(true, j[1], j[2], j[3]);
    case "pub": return new Route(false, j[1], j[2], j[3]);
    default: throw { message: "Invalid JSON-encoded route: " + JSON.stringify(j) };
    }
};

function sub(pattern, metaLevel, level) {
    return new Route(true, pattern, metaLevel, level);
}

function pub(pattern, metaLevel, level) {
    return new Route(false, pattern, metaLevel, level);
}

function spawn(behavior, initialRoutes) {
    return { type: "spawn",
	     behavior: behavior,
	     initialRoutes: (initialRoutes === undefined) ? [] : initialRoutes };
}

function updateRoutes(routes) {
    return { type: "routes", routes: routes };
}

function sendMessage(m, metaLevel, isFeedback) {
    return { type: "message",
	     metaLevel: (metaLevel === undefined) ? 0 : metaLevel,
	     message: m,
	     isFeedback: (isFeedback === undefined) ? false : isFeedback };
}

function shutdownWorld() {
    return { type: "shutdownWorld" };
}

/*---------------------------------------------------------------------------*/
/* Metafunctions */

function dropRoutes(routes) {
    var result = [];
    for (var i = 0; i < routes.length; i++) {
	var r = routes[i].drop();
	if (r) { result.push(r); }
    }
    return result;
}

function liftRoutes(routes) {
    var result = [];
    for (var i = 0; i < routes.length; i++) {
	result.push(routes[i].lift());
    }
    return result;
}

function intersectRoutes(rs1, rs2, ignoreLevels) {
    var result = [];
    for (var i = 0; i < rs1.length; i++) {
	for (var j = 0; j < rs2.length; j++) {
	    var ri = rs1[i];
	    var rj = rs2[j];
	    if (ri.isSubscription === !rj.isSubscription
		&& ri.metaLevel === rj.metaLevel
		&& (ignoreLevels || (ri.level < rj.level)))
	    {
		var u = unify(ri.pattern, rj.pattern);
		if (u) {
		    var rk = new Route(ri.isSubscription, u.result, ri.metaLevel, ri.level);
		    result.push(rk);
		}
	    }
	}
    }
    return result;
}

function filterEvent(e, routes) {
    switch (e.type) {
    case "routes":
	return updateRoutes(intersectRoutes(e.routes, routes));
    case "message":
	for (var i = 0; i < routes.length; i++) {
	    var r = routes[i];
	    if (e.metaLevel === r.metaLevel
		&& e.isFeedback === !r.isSubscription
		&& unify(e.message, r.pattern))
	    {
		return e;
	    }
	}
	return null;
    default:
	throw { message: "Event type " + e.type + " not filterable",
		event: e };
    }
}

/*---------------------------------------------------------------------------*/
/* Configurations */

function World(bootFn) {
    this.nextPid = 0;
    this.eventQueue = [];
    this.processTable = {};
    this.downwardRoutes = [];
    this.processActions = [];
    this.activePid = null;
    this.stepperId = null;
    this.asChild(-1, bootFn, true);
}

/* Class state / methods */

World.stack = [];

World.current = function () {
    return World.stack[World.stack.length - 1];
};

World.send = function (m, metaLevel, isFeedback) {
    World.current().enqueueAction(sendMessage(m, metaLevel, isFeedback));
};

World.updateRoutes = function (routes) {
    World.current().enqueueAction(updateRoutes(routes));
};

World.spawn = function (behavior, initialRoutes) {
    World.current().enqueueAction(spawn(behavior, initialRoutes));
};

World.exit = function (exn) {
    World.current().killActive(exn);
};

World.shutdownWorld = function () {
    World.current().enqueueAction(shutdownWorld());
};

World.withWorldStack = function (stack, f) {
    var oldStack = World.stack;
    World.stack = stack;
    var result = null;
    try {
	result = f();
    } catch (e) {
	World.stack = oldStack;
	throw e;
    }
    World.stack = oldStack;
    return result;
};

World.wrap = function (f) {
    var savedStack = World.stack.slice();
    var savedPid = World.current().activePid;
    return function () {
	var actuals = arguments;
	return World.withWorldStack(savedStack, function () {
	    var result = World.current().asChild(savedPid, function () {
		return f.apply(null, actuals);
	    });
	    World.stack[0].startStepping();
	    return result;
	});
    };
};

/* Instance methods */

World.prototype.killActive = function (exn) {
    this.kill(this.activePid, exn);
};

World.prototype.enqueueAction = function (action) {
    this.processActions.push([this.activePid, action]);
};

World.prototype.isQuiescent = function () {
    return this.eventQueue.length === 0 && this.processActions.length === 0;
};

World.prototype.step = function () {
    this.dispatchEvents();
    this.performActions();
    return this.stepChildren() || !this.isQuiescent();
};

World.prototype.startStepping = function () {
    var self = this;
    if (this.stepperId) return;
    if (this.step()) {
	this.stepperId = setTimeout(function () {
	    self.stepperId = null;
	    self.startStepping();
	}, 0);
    }
};

World.prototype.stopStepping = function () {
    if (this.stepperId) {
	clearTimeout(this.stepperId);
	this.stepperId = null;
    }
};

World.prototype.asChild = function (pid, f, omitLivenessCheck) {
    if (!(pid in this.processTable) && !omitLivenessCheck) {
	console.warn("World.asChild eliding invocation of dead process", pid);
	return;
    }

    World.stack.push(this);
    var result = null;
    this.activePid = pid;
    try {
	result = f();
    } catch (e) {
	this.kill(pid, e);
    }
    this.activePid = null;
    if (World.stack.pop() !== this) {
	throw { message: "Internal error: World stack imbalance" };
    }
    return result;
};

World.prototype.kill = function (pid, exn) {
    if (exn && exn.stack) {
	console.log("Process exited", pid, exn, exn.stack);
    } else {
	console.log("Process exited", pid, exn);
    }
    var p = this.processTable[pid];
    if (p && p.behavior.trapexit) {
	this.asChild(pid, function () { return p.behavior.trapexit(exn); });
    }
    delete this.processTable[pid];
    this.issueRoutingUpdate();
};

World.prototype.stepChildren = function () {
    var someChildBusy = false;
    for (var pid in this.processTable) {
	var p = this.processTable[pid];
	if (p.behavior.step /* exists, haven't called it yet */) {
	    var childBusy = this.asChild(pid, function () { return p.behavior.step() });
	    someChildBusy = someChildBusy || childBusy;
	}
    }
    return someChildBusy;
};

World.prototype.performActions = function () {
    var queue = this.processActions;
    this.processActions = [];
    var item;
    while ((item = queue.shift())) {
	this.performAction(item[0], item[1]);
    }
};

World.prototype.dispatchEvents = function () {
    var queue = this.eventQueue;
    this.eventQueue = [];
    var item;
    while ((item = queue.shift())) {
	this.dispatchEvent(item);
    }
};

World.prototype.performAction = function (pid, action) {
    switch (action.type) {
    case "spawn":
	var pid = this.nextPid++;
	this.processTable[pid] = { routes: action.initialRoutes, behavior: action.behavior };
	if (action.behavior.boot) { this.asChild(pid, function () { action.behavior.boot() }); }
	this.issueRoutingUpdate();
	break;
    case "routes":
	if (pid in this.processTable) {
	    // it may not be: this might be the routing update from a
	    // kill of the process
	    this.processTable[pid].routes = action.routes;
	}
	this.issueRoutingUpdate();
	break;
    case "message":
	if (action.metaLevel === 0) {
	    this.eventQueue.push(action);
	} else {
	    World.send(action.message, action.metaLevel - 1, action.isFeedback);
	}
	break;
    case "shutdownWorld":
	World.exit();
	break;
    default:
	throw { message: "Action type " + action.type + " not understood",
		action: action };
    }
};

World.prototype.aggregateRoutes = function (base) {
    var acc = base.slice();
    for (var pid in this.processTable) {
	var p = this.processTable[pid];
	for (var i = 0; i < p.routes.length; i++) {
	    acc.push(p.routes[i]);
	}
    }
    return acc;
};

World.prototype.issueLocalRoutingUpdate = function () {
    this.eventQueue.push(updateRoutes(this.aggregateRoutes(this.downwardRoutes)));
};

World.prototype.issueRoutingUpdate = function () {
    this.issueLocalRoutingUpdate();
    World.updateRoutes(dropRoutes(this.aggregateRoutes([])));
};

World.prototype.dispatchEvent = function (e) {
    for (var pid in this.processTable) {
	var p = this.processTable[pid];
	var e1 = filterEvent(e, p.routes);
	// console.log("filtering", e, p.routes, e1);
	if (e1) { this.asChild(pid, function () { p.behavior.handleEvent(e1) }); }
    }
};

World.prototype.handleEvent = function (e) {
    switch (e.type) {
    case "routes":
	this.downwardRoutes = liftRoutes(e.routes);
	this.issueLocalRoutingUpdate();
	break;
    case "message":
	this.eventQueue.push(sendMessage(e.message, e.metaLevel + 1, e.isFeedback));
	break;
    default:
	throw { message: "Event type " + e.type + " not understood",
		event: e };
    }
};

/*---------------------------------------------------------------------------*/
/* Utilities: detecting presence/absence events via routing events */

function PresenceDetector(initialRoutes) {
    this.state = this._digestRoutes(initialRoutes === undefined ? [] : initialRoutes);
}

PresenceDetector.prototype._digestRoutes = function (routes) {
    var newState = {};
    for (var i = 0; i < routes.length; i++) {
	newState[JSON.stringify(routes[i].toJSON())] = routes[i];
    }
    return newState;
};

PresenceDetector.prototype.getRouteList = function () {
    var rs = [];
    for (var k in this.state) { rs.push(this.state[k]); }
    return rs;
};

PresenceDetector.prototype.handleRoutes = function (routes) {
    var added = [];
    var removed = [];
    var newState = this._digestRoutes(routes);
    for (var k in newState) {
	if (!(k in this.state)) {
	    added.push(newState[k]);
	} else {
	    delete this.state[k];
	}
    }
    for (var k in this.state) {
	removed.push(this.state[k]);
    }
    this.state = newState;
    return { added: added, removed: removed };
};

PresenceDetector.prototype.presenceExistsFor = function (probeRoute) {
    for (var k in this.state) {
	var existingRoute = this.state[k];
	if (probeRoute.isSubscription === !existingRoute.isSubscription
	    && probeRoute.metaLevel === existingRoute.metaLevel
	    && probeRoute.level === existingRoute.level
	    && unify(probeRoute.pattern, existingRoute.pattern))
	{
	    return true;
	}
    }
    return false;
};

/*---------------------------------------------------------------------------*/
/* Utilities: matching demand for some service */

function DemandMatcher(pattern, metaLevel, options) {
    options = $.extend({
	demandLevel: 0,
	supplyLevel: 0,
	demandSideIsSubscription: true
    }, options);
    this.pattern = pattern;
    this.metaLevel = metaLevel;
    this.demandLevel = options.demandLevel;
    this.supplyLevel = options.supplyLevel;
    this.demandSideIsSubscription = options.demandSideIsSubscription;
    this.onDemandIncrease = function (r) {
	console.error("Unhandled increase in demand for route", r);
    };
    this.onSupplyDecrease = function (r) {
	console.error("Unhandled decrease in supply for route", r);
    };
    this.state = new PresenceDetector();
}

DemandMatcher.prototype.boot = function () {
    World.updateRoutes([this.computeDetector(true),
			this.computeDetector(false)]);
};

DemandMatcher.prototype.handleEvent = function (e) {
    if (e.type === "routes") {
	this.handleRoutes(e.routes);
    }
};

DemandMatcher.prototype.computeDetector = function (demandSide) {
    var maxLevel = (this.demandLevel > this.supplyLevel ? this.demandLevel : this.supplyLevel);
    return new Route(this.demandSideIsSubscription ? !demandSide : demandSide,
		     this.pattern,
		     this.metaLevel,
		     maxLevel + 1);
};

DemandMatcher.prototype.handleRoutes = function (routes) {
    var changes = this.state.handleRoutes(routes);
    this.incorporateChanges(true, changes.added);
    this.incorporateChanges(false, changes.removed);
};

DemandMatcher.prototype.incorporateChanges = function (isArrivals, routeList) {
    var relevantChangeDetector = this.computeDetector(isArrivals);
    var expectedChangeLevel = isArrivals ? this.demandLevel : this.supplyLevel;
    var expectedPeerLevel = isArrivals ? this.supplyLevel : this.demandLevel;
    for (var i = 0; i < routeList.length; i++) {
	var changed = routeList[i];
	if (changed.level != expectedChangeLevel) continue;
	var relevantChangedN = intersectRoutes([changed], [relevantChangeDetector]);
	if (relevantChangedN.length === 0) continue;
	var relevantChanged = relevantChangedN[0]; /* there can be only one */
	var peerDetector = new Route(relevantChanged.isSubscription,
				     relevantChanged.pattern,
				     relevantChanged.metaLevel,
				     expectedPeerLevel + 1);
	var peerRoutes = intersectRoutes(this.state.getRouteList(), [peerDetector]);
	var peerExists = false;
	for (var j = 0; j < peerRoutes.length; j++) {
	    if (peerRoutes[j].level == expectedPeerLevel) {
		peerExists = true;
		break;
	    }
	}
	if (isArrivals && !peerExists) { this.onDemandIncrease(relevantChanged); }
	if (!isArrivals && peerExists) { this.onSupplyDecrease(relevantChanged); }
    }
};

/*---------------------------------------------------------------------------*/
/* Utilities: deduplicator */

function Deduplicator(ttl_ms) {
    this.ttl_ms = ttl_ms || 10000;
    this.queue = [];
    this.map = {};
    this.timerId = null;
}

Deduplicator.prototype.accept = function (m) {
    var s = JSON.stringify(m);
    if (s in this.map) return false;
    var entry = [(+new Date()) + this.ttl_ms, s, m];
    this.map[s] = entry;
    this.queue.push(entry);

    if (this.timerId === null) {
	var self = this;
	this.timerId = setInterval(function () { self.expireMessages(); },
				   this.ttl_ms > 1000 ? 1000 : this.ttl_ms);
    }
    return true;
};

Deduplicator.prototype.expireMessages = function () {
    var now = +new Date();
    while (this.queue.length > 0 && this.queue[0][0] <= now) {
	var entry = this.queue.shift();
	delete this.map[entry[1]];
    }
    if (this.queue.length === 0) {
	clearInterval(this.timerId);
	this.timerId = null;
    }
};

/*---------------------------------------------------------------------------*/
/* Ground interface */

function Ground(bootFn) {
    var self = this;
    this.stepperId = null;
    this.state = new PresenceDetector();
    World.withWorldStack([this], function () {
	self.world = new World(bootFn);
    });
}

Ground.prototype.step = function () {
    var self = this;
    return World.withWorldStack([this], function () {
	return self.world.step();
    });
};

Ground.prototype.startStepping = World.prototype.startStepping;
Ground.prototype.stopStepping = World.prototype.stopStepping;

Ground.prototype.enqueueAction = function (action) {
    if (action.type === 'routes') {
	var added = this.state.handleRoutes(action.routes).added;
	if (added.length > 0) {
	    console.error("You have subscribed to a nonexistent event source.", added);
	}
    } else {
	console.error("You have sent a message into the outer void.", action);
    }
};
