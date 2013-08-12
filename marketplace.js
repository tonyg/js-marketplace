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
	var result = [];
	for (i = 0; i < a.length; i++) {
	    result.push(unify1(a[i], b[i]));
	}
	return result;
    }

    if (typeof a === "object" && typeof b === "object") {
	/* TODO: consider other kinds of matching. I've chosen to
	   require any field mentioned by either side to be present in
	   both. Does that make sense? */
	var result = ({});
	for (i in a) { if a.hasOwnProperty(i) result[i] = true; }
	for (i in b) { if b.hasOwnProperty(i) result[i] = true; }
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
/* Relaying */

function Route(polarity, pattern, isMeta, level) {
    isMeta = isMeta ? true : false;
    level = (level === undefined) ? 0 : level;
    switch (polarity) {
    case "pub":
	this.isSubscription = false;
	break;
    case "sub":
	this.isSubscription = true;
	break;
    default:
	throw { message: "Invalid route polarity: " + polarity,
		polarity: polarity,
		pattern: pattern,
		isMeta: isMeta,
		level: level };
    }
    this.pattern = pattern;
    this.isMeta = isMeta;
    this.level = level;
}

function sub(pattern, isMeta, level) {
    return new Route("sub", pattern, isMeta, level);
}

function pub(pattern, isMeta, level) {
    return new Route("pub", pattern, isMeta, level);
}

function spawn(actor) { /* TODO: initialRoutes */
    return { type: "spawn", actor: actor };
}

function updateRoutes(routes) {
    return { type: "routes", routes: routes };
}

function sendMessage(m) {
    return { type: "send", isMeta: false, message: m };
}

function metaMessage(m) {
    return { type: "send", isMeta: true, message: m };
}

function World(bootActions) {
    this.nextPid = 0;
    this.eventQueue = [];
    this.processTable = {};
    this.downwardRoutes = [];
    this.pendingActions = [];
    this.enqueueActions(-1, bootActions);
}

World.prototype.enqueueActions = function (pid, actions) {
    for (var i = 0; i < actions.length; i++) {
	this.pendingActions.push([pid, actions[i]]);
    }
};

World.prototype.boot = function () {
    this.performPendingActions();
};

World.prototype.performPendingActions = function () {
    var queue = this.pendingActions;
    this.pendingActions = [];
    var item;
    while ((item = queue.shift())) {
	this.performAction(item[0], item[1]);
    }
};

World.prototype.performAction = function (pid, action) {
    switch (action.type) {
    case "spawn":
	this.doSpawn(action.actor);
	break;
    case "routes":
	this.doRoutes(pid, action.routes);
	break;
    case "send":
	this.doSend(pid, action.isMeta, action.message);
	break;
    default:
	throw { message: "Action type " + action.type + " not understood",
		action: action };
    }
};

World.prototype.doSpawn = function (actor) {
    this.processTable[this.nextPid++] = actor;
};

World.prototype.handleEvent = function (e) {
    this.dispatchEvent(e);
    this.performPendingActions();
};

World.prototype.dispatchEvent = function (e) {
    switch (e.type) {
    case "routes":
	break;
    case "send":
	break;
    default:
	break;
    }
};
