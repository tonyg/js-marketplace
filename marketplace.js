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
    return { type: "send",
	     metaLevel: (metaLevel === undefined) ? 0 : metaLevel,
	     message: m,
	     isFeedback: (isFeedback === undefined) ? false : isFeedback };
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
    case "send":
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
    this.asChild(-1, bootFn);
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

World.prototype.asChild = function (pid, f) {
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
    case "send":
	if (action.metaLevel === 0) {
	    this.eventQueue.push(action);
	} else {
	    World.send(action.message, action.metaLevel - 1, action.isFeedback);
	}
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

World.prototype.issueRoutingUpdate = function () {
    this.eventQueue.push(updateRoutes(this.aggregateRoutes(this.downwardRoutes)));
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
	this.issueRoutingUpdate();
	break;
    case "send":
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
	    && unify(probeRoute.pattern, existingRoute.pattern))
	{
	    return true;
	}
    }
    return false;
};

/*---------------------------------------------------------------------------*/
/* Utilities: matching demand for some service */

function DemandMatcher(demandSideIsSubscription, demandIncreaseHandler, supplyDecreaseHandler) {
    this.demandSideIsSubscription = demandSideIsSubscription;
    this.demandIncreaseHandler = demandIncreaseHandler;
    this.supplyDecreaseHandler = supplyDecreaseHandler || function (r) {
	console.error("Unexpected drop in supply for route", r);
    };
    this.state = new PresenceDetector();
}

DemandMatcher.prototype.handleRoutes = function (routes) {
    var changes = this.state.handleRoutes(routes);
    for (var i = 0; i < changes.added.length; i++) {
	if (changes.added[i].isSubscription === this.demandSideIsSubscription
	    && !this.state.presenceExistsFor(changes.added[i]))
	{
	    this.demandIncreaseHandler(changes.added[i]);
	}
    }
    for (var i = 0; i < changes.removed.length; i++) {
	if (changes.removed[i].isSubscription === !this.demandSideIsSubscription
	    && this.state.presenceExistsFor(changes.removed[i]))
	{
	    this.supplyDecreaseHandler(changes.removed[i]);
	}
    }
}

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
