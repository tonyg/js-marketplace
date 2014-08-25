!function(e){if("object"==typeof exports)module.exports=e();else if("function"==typeof define&&define.amd)define(e);else{var f;"undefined"!=typeof window?f=window:"undefined"!=typeof global?f=global:"undefined"!=typeof self&&(f=self),f.Minimart=e()}}(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(_dereq_,module,exports){
var Reflect = _dereq_("./reflect.js");
var Minimart = _dereq_("./minimart.js");
var World = Minimart.World;
var Route = Minimart.Route;

Actor._chunks = null;

function Actor(ctor) {
    var oldChunks = Actor._chunks;
    try {
	Actor._chunks = [];
	var behavior = new ctor();
	return finalizeActor(behavior, Actor._chunks);
    } catch (e) {
	Actor._chunks = oldChunks;
	throw e;
    }
}

function checkChunks(type) {
    if (!Actor._chunks) {
	throw new Error("Call to Actor."+type+" outside of Actor constructor");
    }
}

function extractChunk(type, kind, defaultOptions, args) {
    var rawProjectionFn = args[0]
    var options = null;
    var handler = null;
    if (typeof rawProjectionFn !== 'function') {
	throw new Error("Actor."+type+" expects a function producing a pattern as first argument");
    }
    for (var i = 1; i < args.length; i++) { // NB: skip the first arg - it's rawProjectionFn
	if (typeof args[i] === 'function') {
	    if (handler !== null) { throw new Error("Too many handler functions in Actor."+type); }
	    handler = args[i];
	} else if (typeof args[i] === 'object') {
	    if (options !== null) { throw new Error("Too many options arguments in Actor."+type); }
	    options = args[i];
	} else {
	    throw new Error("Unrecognised argument in Actor."+type);
	}
    }
    options = options || {};
    for (var k in options) {
	if (!(k in defaultOptions)) {
	    throw new Error("Unrecognised option '"+k+"' in Actor."+type);
	}
    }
    for (var k in defaultOptions) {
	if (!(k in options)) {
	    options[k] = defaultOptions[k];
	}
    }
    return {
	type: type,
	kind: kind,
	rawProjectionFn: rawProjectionFn,
	options: options,
	handler: handler
    };
}

function recordChunk(chunk) {
    Actor._chunks.push(chunk);
}

function chunkExtractor(type, kind, defaultOptions) {
    return function (/* ... */) {
	checkChunks(type);
	recordChunk(extractChunk(type,
				 kind,
				 defaultOptions,
				 Array.prototype.slice.call(arguments)));
    };
}

var participantDefaults = {
    metaLevel: 0,
    when: function () { return true; }
};

var observerDefaults = {
    metaLevel: 0,
    level: 0,
    when: function () { return true; },
    presence: null,
    name: null,
    singleton: null,
    set: null,
    added: null,
    removed: null
};

Actor.advertise = chunkExtractor('advertise', 'participant', participantDefaults);
Actor.subscribe = chunkExtractor('subscribe', 'participant', participantDefaults);

Actor.observeAdvertisers = chunkExtractor('observeAdvertisers', 'observer', observerDefaults);
Actor.observeSubscribers = chunkExtractor('observeSubscribers', 'observer', observerDefaults);

Actor.observeGestalt = function (gestaltFn, eventHandlerFn) {
    checkChunks('observeGestalt');
    recordChunk({
	type: 'observeGestalt',
	kind: 'raw',
	gestaltFn: gestaltFn,
	options: {
	    when: function () { return true; }
	},
	eventHandlerFn: eventHandlerFn
    });
};

function finalizeActor(behavior, chunks) {
    var oldBoot = behavior.boot;
    var oldHandleEvent = behavior.handleEvent;
    var projections = {};
    var compiledProjections = {};
    var previousObjs = {};

    behavior.boot = function () {
	if (oldBoot) { oldBoot.call(this); }
	for (var i = 0; i < chunks.length; i++) {
	    var chunk = chunks[i];
	    if (chunk.kind === 'observer') {
		if (chunk.options.presence) { this[chunk.options.presence] = false; }
		if (chunk.options.name) { this[chunk.options.name] = []; }
		if (chunk.options.singleton) { this[chunk.options.singleton] = undefined; }
		if (chunk.options.added) { this[chunk.options.added] = []; }
		if (chunk.options.removed) { this[chunk.options.removed] = []; }
	    }
	}
	this.updateRoutes();
    };

    behavior.updateRoutes = function () {
	var newRoutes = Route.emptyGestalt;
	for (var i = 0; i < chunks.length; i++) {
	    var chunk = chunks[i];
	    if (chunk.options.when.call(this)) {
		switch (chunk.kind) {
		case 'raw':
		    newRoutes = newRoutes.union(chunk.gestaltFn.call(this));
		    break;
		case 'participant':
		    var proj = chunk.rawProjectionFn.call(this);
		    projections[i] = proj;
		    var g = Route.simpleGestalt(chunk.type === 'advertise',
						Route.projectionToPattern(proj),
						chunk.options.metaLevel,
						0);
		    newRoutes = newRoutes.union(g);
		    break;
		case 'observer':
		    var proj = chunk.rawProjectionFn.call(this);
		    projections[i] = proj;
		    compiledProjections[i] = Route.compileProjection(proj);
		    var g = Route.simpleGestalt(chunk.type === 'observeSubscribers',
						Route.projectionToPattern(proj),
						chunk.options.metaLevel,
						chunk.options.level + 1);
		    newRoutes = newRoutes.union(g);
		    if (chunk.options.added || chunk.options.removed) {
			previousObjs[i] = Route.arrayToSet([]);
		    }
		    break;
		default:
		    throw new Error("Unsupported chunk type/kind: "+chunk.type+"/"+chunk.kind);
		}
	    }
	}
	World.updateRoutes([newRoutes]);
    };

    behavior.handleEvent = function (e) {
	if (oldHandleEvent) { oldHandleEvent.call(this, e); }
	for (var i = 0; i < chunks.length; i++) {
	    var chunk = chunks[i];
	    switch (chunk.kind) {
	    case 'raw':
		chunk.eventHandlerFn.call(this, e);
		break;
	    case 'participant':
		if (chunk.handler
		    && (e.type === 'message')
		    && (e.metaLevel === chunk.options.metaLevel)
		    && (e.isFeedback === (chunk.type === 'advertise')))
		{
		    var matchResult = Route.matchPattern(e.message, projections[i]);
		    if (matchResult) {
			kwApply(chunk.handler, this, matchResult);
		    }
		}
		break;
	    case 'observer':
		if (e.type === 'routes') {
		    var projectionResult = e.gestalt.project(compiledProjections[i],
							     chunk.type !== 'observeSubscribers',
							     chunk.options.metaLevel,
							     chunk.options.level);

		    var isPresent = !Route.is_emptyMatcher(projectionResult);
		    if (chunk.options.presence) {
			this[chunk.options.presence] = isPresent;
		    }

		    var objs = [];
		    if (isPresent) {
			var keys = Route.matcherKeys(projectionResult);
			if (keys === null) {
			    console.warn("Wildcard detected while projecting ("
					 +JSON.stringify(chunk.options)+")");
			} else {
			    objs = Route.matcherKeysToObjects(keys, compiledProjections[i]);
			    if (chunk.options.set) {
				for (var j = 0; j < objs.length; j++) {
				    objs[j] = chunk.options.set.call(this, objs[j]);
				}
			    }
			}
		    }
		    if (chunk.options.name) {
			this[chunk.options.name] = objs;
		    }
		    if (chunk.options.singleton) {
			this[chunk.options.singleton] = objs.length === 1 ? objs[0] : undefined;
		    }

		    if (chunk.options.added || chunk.options.removed) {
			var objSet = Route.arrayToSet(objs);

			if (chunk.options.added) {
			    this[chunk.options.added] =
				Route.setToArray(Route.setSubtract(objSet, previousObjs[i]));
			}

			if (chunk.options.removed) {
			    this[chunk.options.removed] =
				Route.setToArray(Route.setSubtract(previousObjs[i], objSet));
			}

			previousObjs[i] = objSet;
		    }

		    if (chunk.handler) {
			chunk.handler.call(this);
		    }
		}
		break;
	    default:
		throw new Error("Unsupported chunk type/kind: "+chunk.type+"/"+chunk.kind);
	    }
	}
    };

    return behavior;
}

function kwApply(f, thisArg, args) {
    var formals = Reflect.formalParameters(f);
    var actuals = []
    for (var i = 0; i < formals.length; i++) {
	var formal = formals[i];
	if (!(formal in args)) {
	    throw new Error("Function parameter '"+formal+"' not present in args");
	}
	actuals.push(args[formal]);
    }
    return f.apply(thisArg, actuals);
}

///////////////////////////////////////////////////////////////////////////

module.exports.Actor = Actor;
module.exports.kwApply = kwApply;

},{"./minimart.js":7,"./reflect.js":8}],2:[function(_dereq_,module,exports){
// Wire protocol representation of events and actions

var Route = _dereq_("./route.js");

function _encode(e) {
    switch (e.type) {
    case "routes":
	return ["routes", e.gestalt.serialize(function (v) { return true; })];
    case "message":
	return ["message", e.message, e.metaLevel, e.isFeedback];
    }
}

function _decode(what) {
  return function (j) {
    switch (j[0]) {
    case "routes":
      return Minimart.updateRoutes([
	Route.deserializeGestalt(j[1], function (v) { return true; })]);
    case "message":
      return Minimart.sendMessage(j[1], j[2], j[3]);
    default:
      throw { message: "Invalid JSON-encoded " + what + ": " + JSON.stringify(j) };
    }
  };
}

///////////////////////////////////////////////////////////////////////////

module.exports.encodeEvent = _encode;
module.exports.decodeEvent = _decode("event");
module.exports.encodeAction = _encode;
module.exports.decodeAction = _decode("action");

},{"./route.js":9}],3:[function(_dereq_,module,exports){
// DOM fragment display driver
var Minimart = _dereq_("./minimart.js");
var World = Minimart.World;
var sub = Minimart.sub;
var pub = Minimart.pub;
var __ = Minimart.__;
var _$ = Minimart._$;

function spawnDOMDriver(domWrapFunction, jQueryWrapFunction) {
    domWrapFunction = domWrapFunction || defaultWrapFunction;
    var d = new Minimart.DemandMatcher(domWrapFunction(_$, _$, _$));
    d.onDemandIncrease = function (captures) {
	var selector = captures[0];
	var fragmentClass = captures[1];
	var fragmentSpec = captures[2];
	World.spawn(new DOMFragment(selector,
				    fragmentClass,
				    fragmentSpec,
				    domWrapFunction,
				    jQueryWrapFunction),
		    [sub(domWrapFunction(selector, fragmentClass, fragmentSpec)),
		     sub(domWrapFunction(selector, fragmentClass, fragmentSpec), 0, 1)]);
    };
    World.spawn(d);
}

function defaultWrapFunction(selector, fragmentClass, fragmentSpec) {
    return ["DOM", selector, fragmentClass, fragmentSpec];
}

function DOMFragment(selector, fragmentClass, fragmentSpec, domWrapFunction, jQueryWrapFunction) {
    this.selector = selector;
    this.fragmentClass = fragmentClass;
    this.fragmentSpec = fragmentSpec;
    this.domWrapFunction = domWrapFunction;
    this.jQueryWrapFunction = jQueryWrapFunction;
    this.nodes = this.buildNodes();
}

DOMFragment.prototype.boot = function () {
    var self = this;
    var monitoring =
	sub(this.domWrapFunction(self.selector, self.fragmentClass, self.fragmentSpec), 1, 2);
    World.spawn(new World(function () {
	Minimart.JQuery.spawnJQueryDriver(self.selector+" > ."+self.fragmentClass,
					  1,
					  self.jQueryWrapFunction);
	World.spawn({
	    handleEvent: function (e) {
		if (e.type === "routes") {
		    var level = e.gestalt.getLevel(1, 0); // find participant peers
		    if (!e.gestalt.isEmpty() && level.isEmpty()) {
			World.shutdownWorld();
		    }
		}
	    }
	}, [monitoring]);
    }));
};

DOMFragment.prototype.handleEvent = function (e) {
    if (e.type === "routes" && e.gestalt.isEmpty()) {
	for (var i = 0; i < this.nodes.length; i++) {
	    var n = this.nodes[i];
	    n.parentNode.removeChild(n);
	}
	World.exit();
    }
};

function isAttributes(x) {
    return Array.isArray(x) && ((x.length === 0) || Array.isArray(x[0]));
}

DOMFragment.prototype.interpretSpec = function (spec) {
    // Fragment specs are roughly JSON-equivalents of SXML.
    // spec ::== ["tag", [["attr", "value"], ...], spec, spec, ...]
    //         | ["tag", spec, spec, ...]
    //         | "cdata"
    if (typeof(spec) === "string" || typeof(spec) === "number") {
	return document.createTextNode(spec);
    } else if ($.isArray(spec)) {
	var tagName = spec[0];
	var hasAttrs = isAttributes(spec[1]);
	var attrs = hasAttrs ? spec[1] : {};
	var kidIndex = hasAttrs ? 2 : 1;

	// Wow! Such XSS! Many hacks! So vulnerability! Amaze!
	var n = document.createElement(tagName);
	for (var i = 0; i < attrs.length; i++) {
	    n.setAttribute(attrs[i][0], attrs[i][1]);
	}
	for (var i = kidIndex; i < spec.length; i++) {
	    n.appendChild(this.interpretSpec(spec[i]));
	}
	return n;
    } else {
        throw new Error("Ill-formed DOM specification");
    }
};

DOMFragment.prototype.buildNodes = function () {
    var self = this;
    var nodes = [];
    $(self.selector).each(function (index, domNode) {
	var n = self.interpretSpec(self.fragmentSpec);
	n.classList.add(self.fragmentClass);
	domNode.appendChild(n);
	nodes.push(n);
    });
    return nodes;
};

///////////////////////////////////////////////////////////////////////////

module.exports.spawnDOMDriver = spawnDOMDriver;
module.exports.defaultWrapFunction = defaultWrapFunction;

},{"./minimart.js":7}],4:[function(_dereq_,module,exports){
/* Ground interface */
var Minimart = _dereq_("./minimart.js");
var World = Minimart.World;

function Ground(bootFn) {
    var self = this;
    this.stepperId = null;
    World.withWorldStack([[this, -1]], function () {
	self.world = new World(bootFn);
    });
}

Ground.prototype.step = function () {
    var self = this;
    return World.withWorldStack([[this, -1]], function () {
	return self.world.step();
    });
};

Ground.prototype.checkPid = function (pid) {
    if (pid !== -1) console.error("Weird pid in Ground markPidRunnable", pid);
};

Ground.prototype.markPidRunnable = function (pid) {
    this.checkPid(pid);
    this.startStepping();
};

Ground.prototype.startStepping = function () {
    var self = this;
    if (this.stepperId) return;
    if (this.step()) {
	this.stepperId = setTimeout(function () {
	    self.stepperId = null;
	    self.startStepping();
	}, 0);
    }
};

Ground.prototype.stopStepping = function () {
    if (this.stepperId) {
	clearTimeout(this.stepperId);
	this.stepperId = null;
    }
};

Ground.prototype.enqueueAction = function (pid, action) {
    this.checkPid(pid);
    if (action.type === 'routes') {
	if (!action.gestalt.isEmpty()) {
	    console.error("You have subscribed to a nonexistent event source.",
			  action.gestalt.pretty());
	}
    } else {
	console.error("You have sent a message into the outer void.", action);
    }
};

///////////////////////////////////////////////////////////////////////////

module.exports.Ground = Ground;

},{"./minimart.js":7}],5:[function(_dereq_,module,exports){
// JQuery event driver
var Minimart = _dereq_("./minimart.js");
var World = Minimart.World;
var sub = Minimart.sub;
var pub = Minimart.pub;
var __ = Minimart.__;
var _$ = Minimart._$;

function spawnJQueryDriver(baseSelector, metaLevel, wrapFunction) {
    metaLevel = metaLevel || 0;
    wrapFunction = wrapFunction || defaultWrapFunction;
    var d = new Minimart.DemandMatcher(wrapFunction(_$, _$, __), metaLevel,
				       {demandSideIsSubscription: true});
    d.onDemandIncrease = function (captures) {
	var selector = captures[0];
	var eventName = captures[1];
	World.spawn(new JQueryEventRouter(baseSelector,
					  selector,
					  eventName,
					  metaLevel,
					  wrapFunction),
		    [pub(wrapFunction(selector, eventName, __), metaLevel),
		     pub(wrapFunction(selector, eventName, __), metaLevel, 1)]);
    };
    World.spawn(d);
}

function defaultWrapFunction(selector, eventName, eventValue) {
    return ["jQuery", selector, eventName, eventValue];
}

function JQueryEventRouter(baseSelector, selector, eventName, metaLevel, wrapFunction) {
    var self = this;
    this.baseSelector = baseSelector || null;
    this.selector = selector;
    this.eventName = eventName;
    this.metaLevel = metaLevel || 0;
    this.wrapFunction = wrapFunction || defaultWrapFunction;
    this.preventDefault = (this.eventName.charAt(0) !== "+");
    this.handler =
	World.wrap(function (e) {
	    World.send(self.wrapFunction(self.selector, self.eventName, e), self.metaLevel);
	    if (self.preventDefault) e.preventDefault();
	    return !self.preventDefault;
	});
    this.computeNodes().on(this.preventDefault ? this.eventName : this.eventName.substring(1),
			   this.handler);
}

JQueryEventRouter.prototype.handleEvent = function (e) {
    if (e.type === "routes" && e.gestalt.isEmpty()) {
	this.computeNodes().off(this.eventName, this.handler);
	World.exit();
    }
};

JQueryEventRouter.prototype.computeNodes = function () {
    if (this.baseSelector) {
	return $(this.baseSelector).children(this.selector).addBack(this.selector);
    } else {
	return $(this.selector);
    }
};

function simplifyDOMEvent(e) {
    var keys = [];
    for (var k in e) {
	var v = e[k];
	if (typeof v === 'object') continue;
	if (typeof v === 'function') continue;
	keys.push(k);
    }
    keys.sort();
    var simplified = [];
    for (var i = 0; i < keys.length; i++) {
	simplified.push([keys[i], e[keys[i]]]);
    }
    return simplified;
}

///////////////////////////////////////////////////////////////////////////

module.exports.spawnJQueryDriver = spawnJQueryDriver;
module.exports.simplifyDOMEvent = simplifyDOMEvent;
module.exports.defaultWrapFunction = defaultWrapFunction;

},{"./minimart.js":7}],6:[function(_dereq_,module,exports){
module.exports = _dereq_("./minimart.js");

module.exports.DOM = _dereq_("./dom-driver.js");
module.exports.JQuery = _dereq_("./jquery-driver.js");
module.exports.RoutingTableWidget = _dereq_("./routing-table-widget.js");
module.exports.WebSocket = _dereq_("./websocket-driver.js");
module.exports.Reflect = _dereq_("./reflect.js");

module.exports.Ground = _dereq_("./ground.js").Ground;
module.exports.Actor = _dereq_("./actor.js").Actor;
module.exports.Spy = _dereq_("./spy.js").Spy;
module.exports.WakeDetector = _dereq_("./wake-detector.js").WakeDetector;

var Worker = _dereq_("./worker.js");
module.exports.Worker = Worker.Worker;
module.exports.WorkerGround = Worker.WorkerGround;

},{"./actor.js":1,"./dom-driver.js":3,"./ground.js":4,"./jquery-driver.js":5,"./minimart.js":7,"./reflect.js":8,"./routing-table-widget.js":10,"./spy.js":11,"./wake-detector.js":13,"./websocket-driver.js":14,"./worker.js":15}],7:[function(_dereq_,module,exports){
var Route = _dereq_("./route.js");
var Util = _dereq_("./util.js");

///////////////////////////////////////////////////////////////////////////

// TODO: trigger-guards as per minimart

/*---------------------------------------------------------------------------*/
/* Events and Actions */

var __ = Route.__;
var _$ = Route._$;

function sub(pattern, metaLevel, level) {
    return Route.simpleGestalt(false, pattern, metaLevel, level);
}

function pub(pattern, metaLevel, level) {
    return Route.simpleGestalt(true, pattern, metaLevel, level);
}

function spawn(behavior, initialGestalts) {
    return { type: "spawn",
	     behavior: behavior,
	     initialGestalt: Route.gestaltUnion(initialGestalts || []) };
}

function updateRoutes(gestalts) {
    return { type: "routes", gestalt: Route.gestaltUnion(gestalts) };
}

function pendingRoutingUpdate(aggregate, affectedSubgestalt, knownTarget) {
    return { type: "pendingRoutingUpdate",
	     aggregate: aggregate,
	     affectedSubgestalt: affectedSubgestalt,
	     knownTarget: knownTarget };
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
/* Configurations */

function World(bootFn) {
    this.alive = true;
    this.eventQueue = [];
    this.runnablePids = {};
    this.partialGestalt = Route.emptyGestalt; // Only gestalt from local processes
    this.fullGestalt = Route.emptyGestalt ;; // partialGestalt unioned with downwardGestalt
    this.processTable = {};
    this.tombstones = {};
    this.downwardGestalt = Route.emptyGestalt;
    this.processActions = [];
    this.asChild(-1, bootFn, true);
}

/* Class state / methods */

World.nextPid = 0;

World.stack = [];

World.current = function () {
    return World.stack[World.stack.length - 1][0];
};

World.activePid = function () {
    return World.stack[World.stack.length - 1][1];
};

World.send = function (m, metaLevel, isFeedback) {
    World.current().enqueueAction(World.activePid(), sendMessage(m, metaLevel, isFeedback));
};

World.updateRoutes = function (gestalts) {
    World.current().enqueueAction(World.activePid(), updateRoutes(gestalts));
};

World.spawn = function (behavior, initialGestalts) {
    World.current().enqueueAction(World.activePid(), spawn(behavior, initialGestalts));
};

World.exit = function (exn) {
    World.current().kill(World.activePid(), exn);
};

World.shutdownWorld = function () {
    World.current().enqueueAction(World.activePid(), shutdownWorld());
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
    return function () {
	var actuals = arguments;
	return World.withWorldStack(savedStack, function () {
	    var result = World.current().asChild(World.activePid(), function () {
		return f.apply(null, actuals);
	    });
	    for (var i = World.stack.length - 1; i >= 0; i--) {
		World.stack[i][0].markPidRunnable(World.stack[i][1]);
	    }
	    return result;
	});
    };
};

/* Instance methods */

World.prototype.enqueueAction = function (pid, action) {
    this.processActions.push([pid, action]);
};

// The code is written to maintain the runnablePids set carefully, to
// ensure we can locally decide whether we're inert or not without
// having to search the whole deep process tree.
World.prototype.isInert = function () {
    return this.eventQueue.length === 0
	&& this.processActions.length === 0
	&& Route.is_emptySet(this.runnablePids);
};

World.prototype.markPidRunnable = function (pid) {
    this.runnablePids[pid] = [pid];
};

World.prototype.step = function () {
    this.dispatchEvents();
    this.performActions();
    this.stepChildren();
    return this.alive && !this.isInert();
};

World.prototype.asChild = function (pid, f, omitLivenessCheck) {
    if (!(pid in this.processTable) && !omitLivenessCheck) {
	console.warn("World.asChild eliding invocation of dead process", pid);
	return;
    }

    World.stack.push([this, pid]);
    var result = null;
    try {
	result = f();
    } catch (e) {
	this.kill(pid, e);
    }
    if (World.stack.pop()[0] !== this) {
	throw new Error("Internal error: World stack imbalance");
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
    if (p) {
	if (exn) {
	    p.exitReason = exn;
	    this.tombstones[pid] = p;
	}
	this.applyAndIssueRoutingUpdate(p.gestalt, Route.emptyGestalt);
    }
};

World.prototype.stepChildren = function () {
    var pids = this.runnablePids;
    this.runnablePids = {};
    for (var pid in pids) {
	var p = this.processTable[pid];
	if (p && p.behavior.step /* exists, haven't called it yet */) {
	    var childBusy = this.asChild(pid | 0, function () { return p.behavior.step() });
	    if (childBusy) this.markPidRunnable(pid);
	}
    }
};

World.prototype.performActions = function () {
    var queue = this.processActions;
    this.processActions = [];
    var item;
    while ((item = queue.shift()) && this.alive) {
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
	var pid = World.nextPid++;
	var newGestalt = action.initialGestalt.label(pid);
	this.processTable[pid] = { gestalt: newGestalt, behavior: action.behavior };
	if (action.behavior.boot) {
	    this.asChild(pid, function () { action.behavior.boot() });
	    this.markPidRunnable(pid);
	}
	this.applyAndIssueRoutingUpdate(Route.emptyGestalt, newGestalt, pid);
	break;
    case "routes":
	if (pid in this.processTable) {
	    // it may not be: this might be the routing update from a
	    // kill of the process
	    var oldGestalt = this.processTable[pid].gestalt;
	    var newGestalt = action.gestalt.label(pid|0);
	    // ^ pid|0: convert pid from string (table key!) to integer
	    this.processTable[pid].gestalt = newGestalt;
	    this.applyAndIssueRoutingUpdate(oldGestalt, newGestalt, pid);
	}
	break;
    case "message":
	if (action.metaLevel === 0) {
	    this.eventQueue.push(action);
	} else {
	    World.send(action.message, action.metaLevel - 1, action.isFeedback);
	}
	break;
    case "shutdownWorld":
	this.alive = false; // force us to stop doing things immediately
	World.exit();
	break;
    default:
	var exn = new Error("Action type " + action.type + " not understood");
	exn.action = action;
	throw exn;
    }
};

World.prototype.updateFullGestalt = function () {
    this.fullGestalt = this.partialGestalt.union(this.downwardGestalt);
};

World.prototype.issueLocalRoutingUpdate = function (affectedSubgestalt, knownTarget) {
    this.eventQueue.push(pendingRoutingUpdate(this.fullGestalt,
					      affectedSubgestalt,
					      knownTarget));
};

World.prototype.applyAndIssueRoutingUpdate = function (oldg, newg, knownTarget) {
    knownTarget = typeof knownTarget === 'undefined' ? null : knownTarget;
    this.partialGestalt = this.partialGestalt.erasePath(oldg).union(newg);
    this.updateFullGestalt();
    this.issueLocalRoutingUpdate(oldg.union(newg), knownTarget);
    World.updateRoutes([this.partialGestalt.drop()]);
};

World.prototype.dispatchEvent = function (e) {
    switch (e.type) {
    case "pendingRoutingUpdate":
	var pids = e.affectedSubgestalt.match(e.aggregate);
	if (e.knownTarget !== null) pids.unshift(e.knownTarget);
	for (var i = 0; i < pids.length; i++) {
	    var pid = pids[i];
	    if (pid === "out") console.warn("Would have delivered a routing update to environment");
	    var p = this.processTable[pid];
	    if (p) {
		var g = e.aggregate.filter(p.gestalt);
		this.asChild(pid, function () { p.behavior.handleEvent(updateRoutes([g])) });
		this.markPidRunnable(pid);
	    }
	}
	break;

    case "message":
	var pids = this.partialGestalt.matchValue(e.message, e.metaLevel, e.isFeedback);
	for (var i = 0; i < pids.length; i++) {
	    var pid = pids[i];
	    var p = this.processTable[pid];
	    this.asChild(pid, function () { p.behavior.handleEvent(e) });
	    this.markPidRunnable(pid);
	}
	break;

    default:
	var exn = new Error("Event type " + e.type + " not dispatchable");
	exn.event = e;
	throw exn;
    }
};

World.prototype.handleEvent = function (e) {
    switch (e.type) {
    case "routes":
	var oldDownward = this.downwardGestalt;
	this.downwardGestalt = e.gestalt.label("out").lift();
	this.updateFullGestalt();
	this.issueLocalRoutingUpdate(oldDownward.union(this.downwardGestalt), null);
	break;
    case "message":
	this.eventQueue.push(sendMessage(e.message, e.metaLevel + 1, e.isFeedback));
	break;
    default:
	var exn = new Error("Event type " + e.type + " not understood");
	exn.event = e;
	throw exn;
    }
};

/* Debugging, management, and monitoring */

World.prototype.processTree = function () {
    var kids = [];
    for (var pid in this.processTable) {
	var p = this.processTable[pid];
	if (p.behavior instanceof World) {
	    kids.push([pid, p.behavior.processTree()]);
	} else {
	    kids.push([pid, p]);
	}
    }
    for (var pid in this.tombstones) {
	kids.push([pid, this.tombstones[pid]]);
    }
    kids.sort(function (a, b) { return a[0] - b[0] });
    return kids;
};

World.prototype.textProcessTree = function (ownPid) {
    var lines = [];

    function dumpProcess(prefix, pid, p) {
	if (Array.isArray(p)) {
	    lines.push(prefix + '--+ ' + pid);
	    for (var i = 0; i < p.length; i++) {
		dumpProcess(prefix + '  |', p[i][0], p[i][1]);
	    }
	    lines.push(prefix);
	} else {
	    var label = p.behavior.name || p.behavior.constructor.name || '';
	    var tombstoneString = p.exitReason ? ' (EXITED: ' + p.exitReason + ') ' : '';
	    var stringifiedState;
	    try {
	      var rawState = p.behavior.debugState ? p.behavior.debugState() : p.behavior;
	      stringifiedState = JSON.stringify(rawState, function (k, v) {
		return (k === 'name') ? undefined : v;
	      });
	    } catch (e) {
	      stringifiedState = "(cannot convert process state to JSON)";
	    }
	    lines.push(prefix + '-- ' + pid + ': ' + label + tombstoneString + stringifiedState);
	}
    }

    dumpProcess('', ownPid || '', this.processTree());
    return lines.join('\n');
};

World.prototype.clearTombstones = function () {
    this.tombstones = {};
    for (var pid in this.processTable) {
	var p = this.processTable[pid];
	if (p.behavior instanceof World) {
	    p.behavior.clearTombstones();
	}
    }
};

/*---------------------------------------------------------------------------*/
/* Utilities: matching demand for some service */

function DemandMatcher(projection, metaLevel, options) {
    options = Util.extend({
	demandLevel: 0,
	supplyLevel: 0,
	demandSideIsSubscription: false,
	supplyProjection: projection
    }, options);
    this.demandPattern = Route.projectionToPattern(projection);
    this.supplyPattern = Route.projectionToPattern(options.supplyProjection);
    this.demandProjectionSpec = Route.compileProjection(projection);
    this.supplyProjectionSpec = Route.compileProjection(options.supplyProjection);
    this.metaLevel = metaLevel | 0;
    this.demandLevel = options.demandLevel;
    this.supplyLevel = options.supplyLevel;
    this.demandSideIsSubscription = options.demandSideIsSubscription;
    this.onDemandIncrease = function (captures) {
	console.error("Unhandled increase in demand for route", captures);
    };
    this.onSupplyDecrease = function (captures) {
	console.error("Unhandled decrease in supply for route", captures);
    };
    this.currentDemand = {};
    this.currentSupply = {};
}

DemandMatcher.prototype.debugState = function () {
  return {
    demandPattern: this.demandPattern,
    supplyPattern: this.supplyPattern,
    metaLevel: this.metaLevel,
    demandLevel: this.demandLevel,
    supplyLevel: this.supplyLevel,
    demandSideIsSubscription: this.demandSideIsSubscription

    // , currentDemand: this.currentDemand
    // , currentSupply: this.currentSupply
  };
};

DemandMatcher.prototype.boot = function () {
    var observerLevel = 1 + Math.max(this.demandLevel, this.supplyLevel);
    World.updateRoutes([sub(this.demandPattern, this.metaLevel, observerLevel),
			pub(this.supplyPattern, this.metaLevel, observerLevel)]);
};

DemandMatcher.prototype.handleEvent = function (e) {
    if (e.type === "routes") {
	this.handleGestalt(e.gestalt);
    }
};

DemandMatcher.prototype.handleGestalt = function (gestalt) {
    var newDemandMatcher = gestalt.project(this.demandProjectionSpec,
					   !this.demandSideIsSubscription,
					   this.metaLevel,
					   this.demandLevel);
    var newSupplyMatcher = gestalt.project(this.supplyProjectionSpec,
					   this.demandSideIsSubscription,
					   this.metaLevel,
					   this.supplyLevel);
    var newDemand = Route.arrayToSet(Route.matcherKeys(newDemandMatcher));
    var newSupply = Route.arrayToSet(Route.matcherKeys(newSupplyMatcher));
    var demandDelta = Route.setSubtract(newDemand, this.currentDemand);
    var supplyDelta = Route.setSubtract(this.currentSupply, newSupply);
    var demandIncr = Route.setSubtract(demandDelta, newSupply);
    var supplyDecr = Route.setIntersect(supplyDelta, newDemand);
    this.currentDemand = newDemand;
    this.currentSupply = newSupply;
    for (var k in demandIncr) this.onDemandIncrease(demandIncr[k]);
    for (var k in supplyDecr) this.onSupplyDecrease(supplyDecr[k]);
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

///////////////////////////////////////////////////////////////////////////

module.exports.__ = __;
module.exports._$ = _$;

module.exports.sub = sub;
module.exports.pub = pub;
module.exports.spawn = spawn;
module.exports.updateRoutes = updateRoutes;
module.exports.sendMessage = sendMessage;
module.exports.shutdownWorld = shutdownWorld;

module.exports.World = World;
module.exports.DemandMatcher = DemandMatcher;
module.exports.Deduplicator = Deduplicator;
module.exports.Route = Route;

},{"./route.js":9,"./util.js":12}],8:[function(_dereq_,module,exports){
// Reflection on function formal parameter lists.
// This module is based on Angular's "injector" code,
// https://github.com/angular/angular.js/blob/master/src/auto/injector.js,
// MIT licensed, and hence:
// Copyright (c) 2010-2014 Google, Inc. http://angularjs.org
// Copyright (c) 2014 Tony Garnock-Jones

var FN_ARGS = /^function\s*[^\(]*\(\s*([^\)]*)\)/m;
var FN_ARG_SPLIT = /,/;
var STRIP_COMMENTS = /((\/\/.*$)|(\/\*[\s\S]*?\*\/))/mg;

function formalParameters(fn) {
    var result = [];

    var fnText = fn.toString().replace(STRIP_COMMENTS, '');
    var argDecl = fnText.match(FN_ARGS);
    var args = argDecl[1].split(FN_ARG_SPLIT);
    for (var i = 0; i < args.length; i++) {
	var trimmed = args[i].trim();
	if (trimmed) { result.push(trimmed); }
    }

    return result;
}

module.exports.formalParameters = formalParameters;

},{}],9:[function(_dereq_,module,exports){
var __ = "__"; /* wildcard marker */

var SOA = "__["; // start of array
var EOA = "__]"; // end of array

function die(message) {
    throw new Error(message);
}

function $Embedded(matcher) {
    this.matcher = matcher;
}

function embeddedMatcher(matcher) {
    return new $Embedded(matcher);
}

// The name argument should be a string or null; it defaults to null.
// The pattern argument defaults to wildcard, __.
function $Capture(name, pattern) {
    this.name = name || null;
    this.pattern = (typeof pattern === 'undefined' ? __ : pattern);
}

// Abbreviation: _$(...) <==> new $Capture(...)
function _$(name, pattern) {
    return new $Capture(name, pattern);
}

function isCapture(x) { return x instanceof $Capture || x === _$; }
function captureName(x) { return x instanceof $Capture ? x.name : null; }
function capturePattern(x) { return x instanceof $Capture ? x.pattern : __; }

var SOC = "__{{"; // start of capture
var EOC = "__}}"; // end of capture

function $Success(value) {
    this.value = value;
}

function $WildcardSequence(matcher) {
    this.matcher = matcher;
}

function $Dict() {
    this.length = 0;
    this.entries = {};
}

$Dict.prototype.get = function (key) {
    return this.entries[key] || emptyMatcher;
};

$Dict.prototype.set = function (key, val) {
    if (!(key in this.entries)) this.length++;
    this.entries[key] = val;
};

$Dict.prototype.clear = function (key) {
    if (key in this.entries) this.length--;
    delete this.entries[key];
};

$Dict.prototype.isEmpty = function () {
    return this.length === 0;
};

$Dict.prototype.copy = function () {
    var other = new $Dict();
    other.length = this.length;
    for (var key in this.entries) {
	if (this.entries.hasOwnProperty(key)) {
	    other.entries[key] = this.entries[key];
	}
    }
    return other;
};

$Dict.prototype.emptyGuard = function () {
    if (this.isEmpty()) return emptyMatcher;
    return this;
};

$Dict.prototype.has = function (key) {
    return key in this.entries;
};

$Dict.prototype.sortedKeys = function () {
    var ks = [];
    for (var k in this.entries) ks.push(k);
    ks.sort();
    return ks;
}

function is_emptyMatcher(m) {
    return (m === emptyMatcher);
}

///////////////////////////////////////////////////////////////////////////
// Constructors

var emptyMatcher = null;

function rsuccess(v) {
    return (v === emptyMatcher) ? emptyMatcher : new $Success(v);
}

function rseq(e, r) {
    if (r === emptyMatcher) return emptyMatcher;
    var s = new $Dict();
    s.set(e, r);
    return s;
}

function rwild(r) {
    return rseq(__, r);
}

function rwildseq(r) {
    return (r === emptyMatcher) ? emptyMatcher : new $WildcardSequence(r);
}

///////////////////////////////////////////////////////////////////////////

function compilePattern(v, p) {
    if (!p) die("compilePattern: missing pattern");
    return walk(p, rseq(EOA, rsuccess(v)));

    function walk(p, acc) {
	if (p === __) return rwild(acc);

	if (Array.isArray(p)) {
	    acc = rseq(EOA, acc);
	    for (var i = p.length - 1; i >= 0; i--) {
		acc = walk(p[i], acc);
	    }
	    return rseq(SOA, acc);
	}

	if (p instanceof $Embedded) {
	    return appendMatcher(p.matcher, function (v) { return acc; });
	} else {
	    return rseq(JSON.stringify(p), acc);
	}
    }
}

function matchPattern(v, p) {
    var captureCount = 0;
    var result = {};
    try {
	walk(v, p);
    } catch (e) {
	if (e.matchPatternFailed) return null;
	throw e;
    }
    result.length = captureCount;
    return result;

    function walk(v, p) {
	if (p === v) return;

	if (p === __) return;

	if (Array.isArray(p) && Array.isArray(v) && p.length === v.length) {
	    for (var i = 0; i < p.length; i++) {
		walk(v[i], p[i]);
	    }
	    return;
	}

	if (isCapture(p)) {
	    var thisCapture = captureCount++;
	    walk(v, capturePattern(p));
	    result[captureName(p) || ('$' + thisCapture)] = v;
	    return;
	}

	if (p instanceof $Embedded) {
	    die("$Embedded patterns not supported in matchPattern()");
	}

	throw {matchPatternFailed: true};
    }
}

function shallowCopyArray(s) {
    return s.slice();
}

function rupdateInplace(r, key, k) {
    if (is_emptyMatcher(k)) {
	r.clear(key);
    } else {
	r.set(key, k);
    }
}

function matcherEquals(a, b) {
    if (a === null) {
	return (b === null);
    }
    if (b === null) return false;

    if (a instanceof $WildcardSequence) {
	if (!(b instanceof $WildcardSequence)) return false;
	a = a.matcher;
	b = b.matcher;
    } else if (b instanceof $WildcardSequence) return false;

    if (a instanceof $Success) {
	if (!(b instanceof $Success)) return false;
	return valuesEqual(a.value, b.value);
    }
    if (b instanceof $Success) return false;

    for (var key in a.entries) {
	if (!b.has(key)) return false;
	if (!matcherEquals(a.entries[key], b.entries[key])) return false;
    }
    return true;
}

function is_keyOpen(k) {
    return k === SOA;
}

function is_keyClose(k) {
    return k === EOA;
}

function is_keyNormal(k) {
    return !(is_keyOpen(k) || is_keyClose(k));
}

///////////////////////////////////////////////////////////////////////////
// Enough of sets to get by with

function arrayToSet(xs) {
    var s = {};
    for (var i = 0; i < xs.length; i++) {
	s[JSON.stringify(xs[i])] = xs[i];
    }
    return s;
}

function setToArray(s) {
    var r = [];
    for (var k in s) r.push(s[k]);
    return r;
}

function setUnion(s1, s2) {
    var s = {};
    setUnionInplace(s, s1);
    setUnionInplace(s, s2);
    return s;
}

function is_emptySet(s) {
    for (var k in s) {
	if (s.hasOwnProperty(k))
	    return false;
    }
    return true;
}

function setSubtract(s1, s2) {
    var s = {};
    for (var key in s1) {
	if (s1.hasOwnProperty(key) && !s2.hasOwnProperty(key)) {
	    s[key] = s1[key];
	}
    }
    return s;
}

function setIntersect(s1, s2) {
    var s = {};
    for (var key in s1) {
	if (s1.hasOwnProperty(key) && s2.hasOwnProperty(key)) {
	    s[key] = s1[key];
	}
    }
    return s;
}

function setUnionInplace(acc, s) {
    for (var key in s) {
	if (s.hasOwnProperty(key)) {
	    acc[key] = s[key];
	}
    }
}

function setEqual(s1, s2) {
    for (var key in s1) {
	if (s1.hasOwnProperty(key)) {
	    if (s1[key] !== s2[key]) return false;
	}
    }
    for (var key in s2) {
	if (s2.hasOwnProperty(key)) {
	    if (s1[key] !== s2[key]) return false;
	}
    }
    return true;
}

///////////////////////////////////////////////////////////////////////////

var unionSuccesses = function (v1, v2) {
    if (v1 === true) return v2;
    if (v2 === true) return v1;
    return setUnion(v1, v2);
};

var intersectSuccesses = function (v1, v2) {
    return v1;
};

var erasePathSuccesses = function (v1, v2) {
    var r = setSubtract(v1, v2);
    if (is_emptySet(r)) return null;
    return r;
};

var matchMatcherSuccesses = function (v1, v2, acc) {
    setUnionInplace(acc, v2);
};

var projectSuccess = function (v) {
    return v;
};

var valuesEqual = function (a, b) {
    return setEqual(a, b);
};

///////////////////////////////////////////////////////////////////////////

function expandWildseq(r) {
    return union(rwild(rwildseq(r)), rseq(EOA, r));
}

function union(o1, o2) {
    return merge(o1, o2);

    function merge(o1, o2) {
	if (is_emptyMatcher(o1)) return o2;
	if (is_emptyMatcher(o2)) return o1;
	return walk(o1, o2);
    }

    function walk(r1, r2) {
	if (r1 instanceof $WildcardSequence) {
	    if (r2 instanceof $WildcardSequence) {
		return rwildseq(walk(r1.matcher, r2.matcher));
	    }
	    r1 = expandWildseq(r1.matcher);
	} else if (r2 instanceof $WildcardSequence) {
	    r2 = expandWildseq(r2.matcher);
	}

	if (r1 instanceof $Success && r2 instanceof $Success) {
	    return rsuccess(unionSuccesses(r1.value, r2.value));
	}

	var w = merge(r1.get(__), r2.get(__));
	if (is_emptyMatcher(w)) {
	    var smaller = r1.length < r2.length ? r1 : r2;
	    var larger  = r1.length < r2.length ? r2 : r1;
	    var target = larger.copy();
	    for (var key in smaller.entries) {
		var k = merge(smaller.get(key), larger.get(key));
		rupdateInplace(target, key, k);
	    }
	    return target.emptyGuard();
	} else {
	    function examineKey(rA, key, rB) {
		if ((key !== __) && !target.has(key)) {
		    var k = merge(rA.get(key), rB.get(key));
		    if (is_keyOpen(key)) {
			rupdateInplace(target, key, merge(rwildseq(w), k));
		    } else if (is_keyClose(key)) {
			if (w instanceof $WildcardSequence) {
			    rupdateInplace(target, key, merge(w.matcher, k));
			} else {
			    rupdateInplace(target, key, k);
			}
		    } else {
			rupdateInplace(target, key, merge(w, k));
		    }
		}
	    }
	    var target = rwild(w).copy();
	    for (var key in r1.entries) { examineKey(r1, key, r2); }
	    for (var key in r2.entries) { examineKey(r2, key, r1); }
	    return target;
	}
    }
}

function unionN() {
    var acc = emptyMatcher;
    for (var i = 0; i < arguments.length; i++) {
	acc = union(acc, arguments[i]);
    }
    return acc;
}

function intersect(o1, o2) {
    if (is_emptyMatcher(o1)) return emptyMatcher;
    if (is_emptyMatcher(o2)) return emptyMatcher;
    return walk(o1, o2);

    function walkFlipped(r2, r1) { return walk(r1, r2); }

    function walk(r1, r2) {
	// INVARIANT: r1 is a part of the original o1, and
	// likewise for r2. This is so that the first arg to
	// intersectSuccesses always comes from r1, and the second
	// from r2.
	if (is_emptyMatcher(r1)) return emptyMatcher;
	if (is_emptyMatcher(r2)) return emptyMatcher;

	if (r1 instanceof $WildcardSequence) {
	    if (r2 instanceof $WildcardSequence) {
		return rwildseq(walk(r1.matcher, r2.matcher));
	    }
	    r1 = expandWildseq(r1.matcher);
	} else if (r2 instanceof $WildcardSequence) {
	    r2 = expandWildseq(r2.matcher);
	}

	if (r1 instanceof $Success && r2 instanceof $Success) {
	    return rsuccess(intersectSuccesses(r1.value, r2.value));
	}

	var w1 = r1.get(__);
	var w2 = r2.get(__);
	var w = walk(w1, w2);

	var target = new $Dict();

	function examineKey(key) {
	    if ((key !== __) && !target.has(key)) {
		var k1 = r1.get(key);
		var k2 = r2.get(key);
		if (is_emptyMatcher(k1)) {
		    if (is_emptyMatcher(k2)) {
			rupdateInplace(target, key, emptyMatcher);
		    } else {
			rupdateInplace(target, key, walkWild(walk, w1, key, k2));
		    }
		} else {
		    if (is_emptyMatcher(k2)) {
			rupdateInplace(target, key, walkWild(walkFlipped, w2, key, k1));
		    } else {
			rupdateInplace(target, key, walk(k1, k2));
		    }
		}
	    }
	}

	if (is_emptyMatcher(w1)) {
	    if (is_emptyMatcher(w2)) {
		for (var key in (r1.length < r2.length ? r1 : r2).entries) examineKey(key);
	    } else {
		for (var key in r1.entries) examineKey(key);
	    }
	} else {
	    if (is_emptyMatcher(w2)) {
		for (var key in r2.entries) examineKey(key);
	    } else {
		rupdateInplace(target, __, w);
		for (var key in r1.entries) examineKey(key);
		for (var key in r2.entries) examineKey(key);
	    }
	}
	return target.emptyGuard();
    }

    function walkWild(walker, w, key, k) {
	if (is_emptyMatcher(w)) return emptyMatcher;
	if (is_keyOpen(key)) return walker(rwildseq(w), k);
	if (is_keyClose(key)) {
	    if (w instanceof $WildcardSequence) return walker(w.matcher, k);
	    return emptyMatcher;
	}
	return walker(w, k);
    }
}

// Removes r2's mappings from r1. Assumes r2 has previously been
// union'd into r1. The erasePathSuccesses function should return
// null to signal "no remaining success values".
function erasePath(o1, o2) {
    return walk(o1, o2);

    function walk(r1, r2) {
	if (is_emptyMatcher(r1)) {
	    return emptyMatcher;
	} else {
	    if (is_emptyMatcher(r2)) {
		return r1;
	    }
	}

	if (r1 instanceof $WildcardSequence) {
	    if (r2 instanceof $WildcardSequence) {
		return rwildseq(walk(r1.matcher, r2.matcher));
	    }
	    r1 = expandWildseq(r1.matcher);
	} else if (r2 instanceof $WildcardSequence) {
	    r2 = expandWildseq(r2.matcher);
	}

	if (r1 instanceof $Success && r2 instanceof $Success) {
	    return rsuccess(erasePathSuccesses(r1.value, r2.value));
	}

	var w1 = r1.get(__);
	var w2 = r2.get(__);
	var w = walk(w1, w2);
	var target;

	function examineKey(key) {
	    if (key !== __) {
		var k1 = r1.get(key);
		var k2 = r2.get(key);
		var updatedK;
		if (is_emptyMatcher(k2)) {
		    updatedK = walkWild(key, k1, w2);
		} else {
		    updatedK = walk(k1, k2);
		}
		// Here we ensure a "minimal" remainder in cases
		// where after an erasure, a particular key's
		// continuation is the same as the wildcard's
		// continuation. TODO: the matcherEquals check may
		// be expensive. If so, how can it be made
		// cheaper?
		if (is_keyOpen(key)) {
		    rupdateInplace(target, key,
				   ((updatedK instanceof $WildcardSequence) &&
				    matcherEquals(updatedK.matcher, w))
				   ? emptyMatcher
				   : updatedK);
		} else if (is_keyClose(key)) {
		    // We take care of this case later, after the
		    // target is fully constructed/rebuilt.
		    rupdateInplace(target, key, updatedK);
		} else {
		    rupdateInplace(target, key,
				   (matcherEquals(updatedK, w) ? emptyMatcher : updatedK));
		}
	    }
	}

	if (is_emptyMatcher(w2)) {
	    target = r1.copy();
	    for (var key in r2.entries) examineKey(key);
	} else {
	    target = new $Dict();
	    rupdateInplace(target, __, w);
	    for (var key in r1.entries) examineKey(key);
	    for (var key in r2.entries) examineKey(key);
	}

	// Here, the target is complete. If it has only two keys,
	// one wild and one is_keyClose, and wild's continuation
	// is a $WildcardSequence and the other continuation is
	// identical to the sequence's continuation, then replace
	// the whole thing with a nested $WildcardSequence.
	// (We know w === target.get(__) from before.)
	//
	// TODO: I suspect actually this applies even if there are
	// more than two keys, so long as all their continuations
	// are identical and there's at least one is_keyClose
	// alongside a wild.
	if (target.length === 2) {
	    var finalW = target.get(__);
	    if (finalW instanceof $WildcardSequence) {
		for (var key in target.entries) {
		    if ((key !== __) && is_keyClose(key)) {
			var k = target.get(key);
			if (matcherEquals(k, finalW.matcher)) {
			    return finalW;
			}
		    }
		}
	    }
	}

	return target.emptyGuard();
    }

    function walkWild(key, k, w) {
	if (is_emptyMatcher(w)) return k;
	if (is_keyOpen(key)) return walk(k, rwildseq(w));
	if (is_keyClose(key)) {
	    if (w instanceof $WildcardSequence) return walk(k, w.matcher);
	    return k;
	}
	return walk(k, w);
    }
}

// Returns null on failed match, otherwise the appropriate success
// value contained in the matcher r.
function matchValue(r, v) {
    var failureResult = null;

    var vs = [v];
    var stack = [[]];

    while (!is_emptyMatcher(r)) {
	if (r instanceof $WildcardSequence) {
	    if (stack.length === 0) return failureResult;
	    vs = stack.pop();
	    r = r.matcher;
	    continue;
	}

	if (r instanceof $Success) {
	    if (vs.length === 0 && stack.length === 0) return r.value;
	    return failureResult;
	}

	if (vs.length === 0) {
	    if (stack.length === 0) return failureResult;
	    vs = stack.pop();
	    r = r.get(EOA);
	    continue;
	}

	var v = vs.shift();

	if (typeof v === 'string' && v.substring(0, 2) === '__') {
	    die("Cannot match special string starting with __");
	}

	if (Array.isArray(v)) {
	    if (SOA in r.entries) {
		r = r.get(SOA);
		stack.push(vs);
		vs = shallowCopyArray(v);
	    } else {
		r = r.get(__);
	    }
	} else {
	    var key;
	    try {
		key = JSON.stringify(v);
	    } catch (exn) {
		// For example, v might be cyclic, as in DOM events.
		key = null;
	    }
	    if (key in r.entries) {
		r = r.get(key);
	    } else {
		r = r.get(__);
	    }
	}
    }

    return failureResult;
}

// TODO: better name for this
function matchMatcher(o1, o2, seed) {
    var acc = typeof seed === 'undefined' ? {} : seed; // will be modified in place
    walk(o1, o2);
    return acc;

    function walkFlipped(r2, r1) { return walk(r1, r2); }

    function walk(r1, r2) {
	if (is_emptyMatcher(r1) || is_emptyMatcher(r2)) return;

	if (r1 instanceof $WildcardSequence) {
	    if (r2 instanceof $WildcardSequence) {
		walk(r1.matcher, r2.matcher);
		return;
	    }
	    r1 = expandWildseq(r1.matcher);
	} else if (r2 instanceof $WildcardSequence) {
	    r2 = expandWildseq(r2.matcher);
	}

	if (r1 instanceof $Success && r2 instanceof $Success) {
	    matchMatcherSuccesses(r1.value, r2.value, acc);
	    return;
	}

	var w1 = r1.get(__);
	var w2 = r2.get(__);
	walk(w1, w2);

	function examineKey(key) {
	    if (key !== __) {
		var k1 = r1.get(key);
		var k2 = r2.get(key);
		if (is_emptyMatcher(k1)) {
		    if (is_emptyMatcher(k2)) {
			return;
		    } else {
			walkWild(walk, w1, key, k2);
		    }
		} else {
		    if (is_emptyMatcher(k2)) {
			walkWild(walkFlipped, w2, key, k1);
		    } else {
			walk(k1, k2);
		    }
		}
	    }
	}

	// Optimize similarly to intersect().
	if (is_emptyMatcher(w1)) {
	    if (is_emptyMatcher(w2)) {
		for (var key in (r1.length < r2.length ? r1 : r2).entries) examineKey(key);
	    } else {
		for (var key in r1.entries) examineKey(key);
	    }
	} else {
	    if (is_emptyMatcher(w2)) {
		for (var key in r2.entries) examineKey(key);
	    } else {
		for (var key in r1.entries) examineKey(key);
		for (var key in r2.entries) examineKey(key);
	    }
	}
    }

    function walkWild(walker, w, key, k) {
	if (is_emptyMatcher(w)) return;
	if (is_keyOpen(key)) {
	    walker(rwildseq(w), k);
	    return;
	}
	if (is_keyClose(key)) {
	    if (w instanceof $WildcardSequence) walker(w.matcher, k);
	    return;
	}
	walker(w, k);
    }
}

function appendMatcher(m, mTailFn) {
    return walk(m);

    function walk(m) {
	if (is_emptyMatcher(m)) return emptyMatcher;
	if (m instanceof $WildcardSequence) return rwildseq(walk(m.matcher));
	if (m instanceof $Success) die("Ill-formed matcher");

	var target = new $Dict();
	for (var key in m.entries) {
	    var k = m.get(key);
	    if (is_keyClose(key) && (k instanceof $Success)) {
		target = union(target, mTailFn(k.value));
	    } else {
		rupdateInplace(target, key, walk(k));
	    }
	}
	return target.emptyGuard();
    }
}

function relabel(m, f) {
    return walk(m);

    function walk(m) {
	if (is_emptyMatcher(m)) return emptyMatcher;
	if (m instanceof $WildcardSequence) return rwildseq(walk(m.matcher));
	if (m instanceof $Success) return rsuccess(f(m.value));

	var target = new $Dict();
	for (var key in m.entries) {
	    rupdateInplace(target, key, walk(m.get(key)));
	}
	return target.emptyGuard();
    }
}

function compileProjection(/* projection, projection, ... */) {
    var names = [];
    var acc = [];
    for (var i = 0; i < arguments.length; i++) {
	walk(arguments[i]);
    }
    acc.push(EOA);
    return {names: names, spec: acc};

    function walk(p) {
	if (isCapture(p)) {
	    names.push(captureName(p));
	    acc.push(SOC);
	    walk(capturePattern(p));
	    acc.push(EOC);
	    return;
	}

	if (Array.isArray(p)) {
	    acc.push(SOA);
	    for (var i = 0; i < p.length; i++) {
		walk(p[i]);
	    }
	    acc.push(EOA);
	    return;
	}

	if (p instanceof $Embedded) {
	    die("Cannot embed matcher in projection");
	} else {
	    if (p === __) {
		acc.push(p);
	    } else {
		acc.push(JSON.stringify(p));
	    }
	}
    }
}

function projectionToPattern(p) {
    return walk(p);

    function walk(p) {
	if (isCapture(p)) return walk(capturePattern(p));

	if (Array.isArray(p)) {
	    var result = [];
	    for (var i = 0; i < p.length; i++) {
		result.push(walk(p[i]));
	    }
	    return result;
	}

	if (p instanceof $Embedded) {
	    return p.matcher;
	} else {
	    return p;
	}
    }
}

function project(m, compiledProjection) {
    var spec = compiledProjection.spec;
    return walk(false, m, 0);

    function walk(isCapturing, m, specIndex) {
	if (specIndex >= spec.length) {
	    if (isCapturing) die("Bad specification: unclosed capture");
	    if (m instanceof $Success) {
		return rseq(EOA, rsuccess(projectSuccess(m.value)));
	    } else {
		return emptyMatcher;
	    }
	}

	if (is_emptyMatcher(m)) return emptyMatcher;

	var item = spec[specIndex];
	var nextIndex = specIndex + 1;

	if (item === EOC) {
	    if (!isCapturing) die("Bad specification: unepxected EOC");
	    return walk(false, m, nextIndex);
	}

	if (item === SOC) {
	    if (isCapturing) die("Bad specification: nested capture");
	    return walk(true, m, nextIndex);
	}

	if (item === __) {
	    if (m instanceof $WildcardSequence) {
		if (isCapturing) {
		    return rwild(walk(isCapturing, m, nextIndex));
		} else {
		    return walk(isCapturing, m, nextIndex);
		}
	    }

	    if (m instanceof $Success) {
		return emptyMatcher;
	    }

	    var target;
	    if (isCapturing) {
		target = new $Dict();
		rupdateInplace(target, __, walk(isCapturing, m.get(__), nextIndex));
		for (var key in m.entries) {
		    if (key !== __) {
			var mk = m.get(key);
			if (is_keyOpen(key)) {
			    function cont(mk2) { return walk(isCapturing, mk2, nextIndex); }
			    rupdateInplace(target, key, captureNested(mk, cont));
			} else if (is_keyClose(key)) {
			    // do nothing
			} else {
			    rupdateInplace(target, key, walk(isCapturing, mk, nextIndex));
			}
		    }
		}
	    } else {
		target = walk(isCapturing, m.get(__), nextIndex);
		for (var key in m.entries) {
		    if (key !== __) {
			var mk = m.get(key);
			if (is_keyOpen(key)) {
			    function cont(mk2) { return walk(isCapturing, mk2, nextIndex); }
			    target = union(target, skipNested(mk, cont));
			} else if (is_keyClose(key)) {
			    // do nothing
			} else {
			    target = union(target, walk(isCapturing, mk, nextIndex));
			}
		    }
		}
	    }
	    return target;
	}

	var result;
	if (m instanceof $WildcardSequence) {
	    if (is_keyOpen(item)) {
		result = walk(isCapturing, rwildseq(m), nextIndex);
	    } else if (is_keyClose(item)) {
		result = walk(isCapturing, m.matcher, nextIndex);
	    } else {
		result = walk(isCapturing, m, nextIndex);
	    }
	} else if (m instanceof $Success) {
	    result = emptyMatcher;
	} else {
	    if (is_keyOpen(item)) {
		result = walk(isCapturing, rwildseq(m.get(__)), nextIndex);
	    } else if (is_keyClose(item)) {
		result = emptyMatcher;
	    } else {
		result = walk(isCapturing, m.get(__), nextIndex);
	    }
	    result = union(result, walk(isCapturing, m.get(item), nextIndex));
	}
	if (isCapturing) {
	    result = rseq(item, result);
	}
	return result;
    }

    function captureNested(m, cont) {
	if (m instanceof $WildcardSequence) {
	    return rwildseq(cont(m.matcher));
	}

	if (is_emptyMatcher(m) || (m instanceof $Success)) {
	    return emptyMatcher;
	}

	var target = new $Dict();
	rupdateInplace(target, __, captureNested(m.get(__), cont));
	for (var key in m.entries) {
	    if (key !== __) {
		var mk = m.get(key);
		if (is_keyOpen(key)) {
		    function cont2(mk2) { return captureNested(mk2, cont); }
		    rupdateInplace(target, key, captureNested(mk, cont2));
		} else if (is_keyClose(key)) {
		    rupdateInplace(target, key, cont(mk));
		} else {
		    rupdateInplace(target, key, captureNested(mk, cont));
		}
	    }
	}
	return target.emptyGuard();
    }

    function skipNested(m, cont) {
	if (m instanceof $WildcardSequence) {
	    return cont(m.matcher);
	}

	if (is_emptyMatcher(m) || (m instanceof $Success)) {
	    return emptyMatcher;
	}

	var target = skipNested(m.get(__), cont);
	for (var key in m.entries) {
	    if (key !== __) {
		var mk = m.get(key);
		if (is_keyOpen(key)) {
		    function cont2(mk2) { return skipNested(mk2, cont); }
		    target = union(target, skipNested(mk, cont2));
		} else if (is_keyClose(key)) {
		    target = union(target, cont(mk));
		} else {
		    target = union(target, skipNested(mk, cont));
		}
	    }
	}
	return target;
    }
}

function matcherKeys(m) {
    if (is_emptyMatcher(m)) return [];
    return walkSeq(m, function (vss, vsk) { return vss; });

    function walk(m, k) {
	if (m instanceof $WildcardSequence) return null;
	if (m instanceof $Success) return [];
	if (m.has(__)) return null;
	var acc = [];
	for (var key in m.entries) {
	    var mk = m.get(key);
	    var piece;
	    if (is_keyOpen(key)) {
		function seqK(vss, vsk) {
		    var acc = [];
		    for (var i = 0; i < vss.length; i++) {
			var vs = vss[i];
			acc = acc.concat(k(transformSeqs(vs, key), vsk));
		    }
		    return acc;
		}
		piece = walkSeq(mk, seqK);
	    } else if (is_keyClose(key)) {
		die("matcherKeys: internal error: unexpected key-close");
	    } else {
		piece = k(JSON.parse(key), mk);
	    }
	    if (piece == null) return null;
	    acc = acc.concat(piece);
	}
	return acc;
    }

    function walkSeq(m, k) {
	if (m instanceof $WildcardSequence) return null;
	if (m instanceof $Success) return k([], emptyMatcher); // TODO: ??
	if (m.has(__)) return null;
	var acc = [];
	for (var key in m.entries) {
	    var mk = m.get(key);
	    var piece;
	    if (is_keyClose(key)) {
		piece = k([[]], mk);
	    } else {
		function outerK(v, vk) {
		    return walkSeq(vk, innerK);
		    function innerK(vss, vsk) {
			var acc = [];
			for (var i = 0; i < vss.length; i++) {
			    var vs = shallowCopyArray(vss[i]);
			    vs.unshift(v);
			    acc.push(vs);
			}
			return k(acc, vsk);
		    }
		}
		piece = walk(rseq(key, mk), outerK);
	    }
	    if (piece == null) return null;
	    acc = acc.concat(piece);
	}
	return acc;
    }

    function transformSeqs(vs, opener) {
	if (opener === SOA) return vs;
	die("Internal error: unknown opener " + opener);
    }
}

function matcherKeysToObjects(matcherKeysResult, compiledProjection) {
    if (matcherKeysResult === null) return null;
    var result = [];
    for (var i = 0; i < matcherKeysResult.length; i++) {
	var e = matcherKeysResult[i];
	var d = {};
	for (var j = 0; j < e.length; j++) {
	    d[compiledProjection.names[j] || ('$' + j)] = e[j];
	}
	result.push(d);
    }
    return result;
}

function projectObjects(m, compiledProjection) {
    return matcherKeysToObjects(matcherKeys(project(m, compiledProjection)), compiledProjection);
}

function prettyMatcher(m, initialIndent) {
    var acc = [];
    walk(initialIndent || 0, m);
    return acc.join('');

    function walk(i, m) {
	if (is_emptyMatcher(m)) {
	    acc.push("::: no further matches possible");
	    return;
	}
	if (m instanceof $WildcardSequence) {
	    acc.push("...>");
	    walk(i + 4, m.matcher);
	    return;
	}
	if (m instanceof $Success) {
	    var vs = JSON.stringify(typeof m.value === 'object'
				    ? setToArray(m.value)
				    : m.value);
	    acc.push("{" + vs + "}");
	    return;
	}

	if (m.length === 0) {
	    acc.push(" ::: empty hash!");
	    return;
	}

	var needSep = false;
	var keys = m.sortedKeys();
	for (var keyi = 0; keyi < keys.length; keyi++) {
	    var key = keys[keyi];
	    var k = m.entries[key];
	    if (needSep) {
		acc.push("\n");
		acc.push(indentStr(i));
	    } else {
		needSep = true;
	    }
	    acc.push(" ");
	    if (key === __) key = '★';
	    if (key === SOA) key = '<';
	    if (key === EOA) key = '>';
	    acc.push(key);
	    walk(i + key.length + 1, k);
	}
    }

    function indentStr(i) {
	return new Array(i + 1).join(' '); // eww
    }
}

function serializeMatcher(m, serializeSuccess) {
    return walk(m);
    function walk(m) {
	if (is_emptyMatcher(m)) return [];
	if (m instanceof $WildcardSequence) {
	    return ["...)", walk(m.matcher)];
	}
	if (m instanceof $Success) {
	    return ["", serializeSuccess(m.value)];
	}
	var acc = [];
	for (var key in m.entries) {
	    var k = m.entries[key];
	    if (key === __) key = ["__"];
	    else if (key === SOA) key = ["("];
	    else if (key === EOA) key = [")"];
	    else key = JSON.parse(key);
	    acc.push([key, walk(k)]);
	}
	return acc;
    }
}

function deserializeMatcher(r, deserializeSuccess) {
    return walk(r);
    function walk(r) {
	if (r.length === 0) return emptyMatcher;
	if (r[0] === "...)") return rwildseq(walk(r[1]));
	if (r[0] === "") return rsuccess(deserializeSuccess(r[1]));
	var acc = new $Dict();
	for (var i = 0; i < r.length; i++) {
	    var rkey = r[i][0];
	    var rk = r[i][1];
	    var key;
	    if (Array.isArray(rkey)) {
		switch (rkey[0]) {
		case "__": key = __; break;
		case "(": key = SOA; break;
		case ")": key = EOA; break;
		default: die("Invalid serialized special key: " + rkey[0]);
		}
	    } else {
		key = JSON.stringify(rkey);
	    }
	    rupdateInplace(acc, key, walk(rk));
	}
	return acc;
    }
}

///////////////////////////////////////////////////////////////////////////
// Gestalts.
// TODO: support Infinity as a level number

function GestaltLevel(subs, advs) {
    this.subscriptions = subs;
    this.advertisements = advs;
}

GestaltLevel.prototype.isEmpty = function () {
    return is_emptyMatcher(this.subscriptions) && is_emptyMatcher(this.advertisements);
};

GestaltLevel.prototype.equals = function (other) {
    return matcherEquals(this.subscriptions, other.subscriptions)
	&& matcherEquals(this.advertisements, other.advertisements);
};

GestaltLevel.prototype.pretty = function () {
    var acc = [];
    if (!is_emptyMatcher(this.subscriptions)) {
	acc.push("  - subs:");
	acc.push(prettyMatcher(this.subscriptions, 9));
	acc.push("\n");
    }
    if (!is_emptyMatcher(this.advertisements)) {
	acc.push("  - advs:");
	acc.push(prettyMatcher(this.advertisements, 9));
	acc.push("\n");
    }
    return acc.join('');
};

function straightGestaltLevelOp(op) {
    return function (p1, p2) {
	return new GestaltLevel(op(p1.subscriptions, p2.subscriptions),
				op(p1.advertisements, p2.advertisements));
    };
};

var emptyLevel = new GestaltLevel(emptyMatcher, emptyMatcher);
var emptyMetaLevel = [];

function Gestalt(metaLevels) {
    this.metaLevels = metaLevels;
}

Gestalt.prototype.getMetaLevel = function (n) {
    return this.metaLevels[n] || emptyMetaLevel;
};

Gestalt.prototype.getLevel = function (metaLevel, level) {
    return this.getMetaLevel(metaLevel)[level] || emptyLevel;
};

Gestalt.prototype.metaLevelCount = function () { return this.metaLevels.length; };
Gestalt.prototype.levelCount = function (n) { return this.getMetaLevel(n).length; };

Gestalt.prototype.matchValue = function (body, metaLevel, isFeedback) {
    var levels = this.getMetaLevel(metaLevel);
    var pids = {};
    for (var i = 0; i < levels.length; i++) {
	var matcher = (isFeedback ? levels[i].advertisements : levels[i].subscriptions);
	setUnionInplace(pids, matchValue(matcher, body));
    }
    return setToArray(pids);
};

Gestalt.prototype.project = function (spec, getAdvertisements, metaLevel, level) {
    var l = this.getLevel(metaLevel | 0, level | 0);
    var matcher = (getAdvertisements ? l.advertisements : l.subscriptions);
    return project(matcher, spec);
};

Gestalt.prototype.drop = function () {
    var mls = shallowCopyArray(this.metaLevels);
    mls.shift();
    return new Gestalt(mls);
};

Gestalt.prototype.lift = function () {
    var mls = shallowCopyArray(this.metaLevels);
    mls.unshift(emptyMetaLevel);
    return new Gestalt(mls);
};

Gestalt.prototype.equals = function (other) {
    if (this.metaLevels.length !== other.metaLevels.length) return false;
    for (var i = 0; i < this.metaLevels.length; i++) {
	var ls1 = this.metaLevels[i];
	var ls2 = other.metaLevels[i];
	if (ls1.length !== ls2.length) return false;
	for (var j = 0; j < ls1.length; j++) {
	    var p1 = ls1[j];
	    var p2 = ls2[j];
	    if (!p1.equals(p2)) return false;
	}
    }
    return true;
};

function simpleGestalt(isAdv, pat, metaLevel, level) {
    metaLevel = metaLevel || 0;
    level = level || 0;
    var matcher = compilePattern(true, pat);
    var l = new GestaltLevel(isAdv ? emptyMatcher : matcher,
			     isAdv ? matcher : emptyMatcher);
    var levels = [l];
    while (level--) { levels.unshift(emptyLevel); }
    var metaLevels = [levels];
    while (metaLevel--) { metaLevels.unshift(emptyMetaLevel); }
    return new Gestalt(metaLevels);
}

var emptyGestalt = new Gestalt([]);

// Not quite what it says on the tin - the true fullGestalt
// wouldn't be parameterized on the number of levels and
// metalevels, but instead would be full at *all* levels and
// metalevels. Our representation leaks through into the interface
// here :-/
function fullGestalt(nMetalevels, nLevels) {
    var matcher = compilePattern(true, __);
    var l = new GestaltLevel(matcher, matcher);
    var levels = [];
    while (nLevels--) { levels.push(l); }
    var metaLevels = [];
    while (nMetalevels--) { metaLevels.push(levels); }
    return new Gestalt(metaLevels);
}

Gestalt.prototype.isEmpty = function () {
    for (var i = 0; i < this.metaLevels.length; i++) {
	var levels = this.metaLevels[i];
	for (var j = 0; j < levels.length; j++) {
	    if (!levels[j].isEmpty()) return false;
	}
    }
    return true;
};

function maybePushLevel(levels, i, level) {
    if (!level.isEmpty()) {
	while (levels.length < i) levels.push(emptyLevel);
	levels.push(level);
    }
}

function maybePushMetaLevel(metaLevels, i, metaLevel) {
    if (metaLevel.length > 0) {
	while (metaLevels.length < i) metaLevels.push(emptyMetaLevel);
	metaLevels.push(metaLevel);
    }
}

Gestalt.prototype.mapZip = function (other, lengthCombiner, f) {
    var metaLevels = [];
    var mls1 = this.metaLevels;
    var mls2 = other.metaLevels;
    var nm = lengthCombiner(mls1.length, mls2.length);
    for (var i = 0; i < nm; i++) {
	var levels = [];
	var ls1 = mls1[i] || emptyMetaLevel;
	var ls2 = mls2[i] || emptyMetaLevel;
	var nl = lengthCombiner(ls1.length, ls2.length);
	for (var j = 0; j < nl; j++) {
	    var p1 = ls1[j] || emptyLevel;
	    var p2 = ls2[j] || emptyLevel;
	    var p = f(p1, p2);
	    maybePushLevel(levels, j, p);
	}
	maybePushMetaLevel(metaLevels, i, levels);
    }
    return new Gestalt(metaLevels);
};

Gestalt.prototype.union1 = function (other) {
    return this.mapZip(other, Math.max, straightGestaltLevelOp(union));
};

function gestaltUnion(gs) {
    if (gs.length === 0) return emptyGestalt;
    var acc = gs[0];
    for (var i = 1; i < gs.length; i++) {
	acc = acc.union1(gs[i]);
    }
    return acc;
}

Gestalt.prototype.union = function () {
    return arguments.length > 0 ? this.union1(gestaltUnion(arguments)) : this;
};

// Accumulates matchers from higher-numbered levels into
// lower-numbered levels.
function telescopeLevels(levels) {
    var result = shallowCopyArray(levels);
    for (var i = result.length - 2; i >= 0; i--) {
	result[i] =
	    new GestaltLevel(union(result[i].subscriptions, result[i+1].subscriptions),
			     union(result[i].advertisements, result[i+1].advertisements));
    }
    return result;
};

Gestalt.prototype.telescoped = function () {
    var mls = [];
    for (var i = 0; i < this.metaLevels.length; i++) {
	mls.push(telescopeLevels(this.metaLevels[i]));
    }
    return new Gestalt(mls);
};

Gestalt.prototype.filter = function (perspective) {
    var metaLevels = [];
    var mls1 = this.metaLevels;
    var mls2 = perspective.metaLevels;
    var nm = Math.min(mls1.length, mls2.length);
    for (var i = 0; i < nm; i++) {
	var levels = [];
	var ls1 = mls1[i] || emptyMetaLevel;
	var ls2 = mls2[i] || emptyMetaLevel;
	var nl = Math.min(ls1.length, ls2.length - 1);
	for (var j = 0; j < nl; j++) {
	    var p1 = ls1[j] || emptyLevel;
	    var subs = emptyMatcher;
	    var advs = emptyMatcher;
	    for (var k = j + 1; k < ls2.length; k++) {
		var p2 = ls2[k] || emptyLevel;
		subs = union(subs, intersect(p1.subscriptions, p2.advertisements));
		advs = union(advs, intersect(p1.advertisements, p2.subscriptions));
	    }
	    maybePushLevel(levels, j, new GestaltLevel(subs, advs));
	}
	maybePushMetaLevel(metaLevels, i, levels);
    }
    return new Gestalt(metaLevels);
};

Gestalt.prototype.match = function (perspective) {
    var pids = {};
    var nm = Math.min(this.metaLevels.length, perspective.metaLevels.length);
    for (var i = 0; i < nm; i++) {
	var ls1 = this.metaLevels[i] || emptyMetaLevel;
	var ls2 = perspective.metaLevels[i] || emptyMetaLevel;
	var nl = Math.min(ls1.length, ls2.length - 1);
	for (var j = 0; j < nl; j++) {
	    var p1 = ls1[j] || emptyLevel;
	    for (var k = j + 1; k < ls2.length; k++) {
		var p2 = ls2[k] || emptyLevel;
		matchMatcher(p1.subscriptions, p2.advertisements, pids);
		matchMatcher(p1.advertisements, p2.subscriptions, pids);
	    }
	}
    }
    return setToArray(pids);
};

Gestalt.prototype.erasePath = function (path) {
    return this.mapZip(path, Math.max, straightGestaltLevelOp(erasePath));
};

function mapLevels(inputMetaLevels, f, emptyCheck, inputEmptyLevel, outputEmptyLevel) {
    var outputMetaLevels = [];
    for (var i = 0; i < inputMetaLevels.length; i++) {
	var ls = inputMetaLevels[i];
	var levels = [];
	for (var j = 0; j < ls.length; j++) {
	    var p = f(ls[j] || inputEmptyLevel, i, j);
	    if (!emptyCheck(p, i, j)) {
		while (levels.length < j) levels.push(outputEmptyLevel);
		levels.push(p);
	    }
	}
	if (levels.length > 0) {
	    while (outputMetaLevels.length < i) outputMetaLevels.push(emptyMetaLevel);
	    outputMetaLevels.push(levels);
	}
    }
    return outputMetaLevels;
};

Gestalt.prototype.transform = function (f) {
    return new Gestalt(mapLevels(this.metaLevels, function (p, ml, l) {
	return new GestaltLevel(f(p.subscriptions, ml, l, false),
				f(p.advertisements, ml, l, true));
    }, function (p) {
	return p.isEmpty();
    }, emptyLevel, emptyLevel));
};

Gestalt.prototype.stripLabel = function () {
    return this.transform(function (m) { return relabel(m, function (v) { return true; }); });
};

Gestalt.prototype.label = function (pid) {
    var pids = arrayToSet([pid]);
    return this.transform(function (m) { return relabel(m, function (v) { return pids; }); });
};

Gestalt.prototype.pretty = function () {
    var acc = [];
    if (this.isEmpty()) {
	acc.push("EMPTY GESTALT\n");
    } else {
	for (var i = 0; i < this.metaLevels.length; i++) {
	    var ls = this.metaLevels[i];
	    for (var j = 0; j < ls.length; j++) {
		var p = ls[j];
		if (!p.isEmpty()) {
		    acc.push("GESTALT metalevel " + i + " level " + j + ":\n");
		    acc.push(p.pretty());
		}
	    }
	}
    }
    return acc.join('');
};

Gestalt.prototype.serialize = function (serializeSuccess) {
    if (typeof serializeSuccess === 'undefined') {
	serializeSuccess = function (v) { return v === true ? true : setToArray(v); };
    }
    return ["gestalt", mapLevels(this.metaLevels, function (p) {
	return [serializeMatcher(p.subscriptions, serializeSuccess),
		serializeMatcher(p.advertisements, serializeSuccess)];
    }, function (pr) {
	return pr.length === 2 && pr[0].length === 0 && pr[1].length === 0;
    }, emptyLevel, [[],[]])];
};

function deserializeGestalt(r, deserializeSuccess) {
    if (typeof deserializeSuccess === 'undefined') {
	deserializeSuccess = function (v) { return v === true ? true : arrayToSet(v); };
    }
    if (r[0] !== "gestalt") die("Invalid gestalt serialization: " + r);
    return new Gestalt(mapLevels(r[1], function (pr) {
	return new GestaltLevel(deserializeMatcher(pr[0], deserializeSuccess),
				deserializeMatcher(pr[1], deserializeSuccess));
    }, function (p) {
	return p.isEmpty();
    }, [[],[]], emptyLevel));
}

///////////////////////////////////////////////////////////////////////////

module.exports.__ = __;
module.exports.arrayToSet = arrayToSet;
module.exports.setToArray = setToArray;
module.exports.setUnion = setUnion;
module.exports.setSubtract = setSubtract;
module.exports.setIntersect = setIntersect;
module.exports.setEqual = setEqual;
module.exports.is_emptySet = is_emptySet;
module.exports.$Capture = $Capture;
module.exports._$ = _$;
module.exports.is_emptyMatcher = is_emptyMatcher;
module.exports.emptyMatcher = emptyMatcher;
module.exports.embeddedMatcher = embeddedMatcher;
module.exports.compilePattern = compilePattern;
module.exports.matchPattern = matchPattern;
module.exports.union = unionN;
module.exports.intersect = intersect;
module.exports.erasePath = erasePath;
module.exports.matchValue = matchValue;
module.exports.matchMatcher = matchMatcher;
module.exports.appendMatcher = appendMatcher;
module.exports.relabel = relabel;
module.exports.compileProjection = compileProjection;
module.exports.projectionToPattern = projectionToPattern;
module.exports.project = project;
module.exports.matcherKeys = matcherKeys;
module.exports.matcherKeysToObjects = matcherKeysToObjects;
module.exports.projectObjects = projectObjects;
module.exports.matcherEquals = matcherEquals;
module.exports.prettyMatcher = prettyMatcher;
module.exports.serializeMatcher = serializeMatcher;
module.exports.deserializeMatcher = deserializeMatcher;

module.exports.GestaltLevel = GestaltLevel;
module.exports.Gestalt = Gestalt;
module.exports.simpleGestalt = simpleGestalt;
module.exports.emptyGestalt = emptyGestalt;
module.exports.fullGestalt = fullGestalt;
module.exports.gestaltUnion = gestaltUnion;
module.exports.deserializeGestalt = deserializeGestalt;

},{}],10:[function(_dereq_,module,exports){
var Minimart = _dereq_("./minimart.js");
var Route = Minimart.Route;
var World = Minimart.World;
var sub = Minimart.sub;
var pub = Minimart.pub;
var __ = Minimart.__;

function spawnRoutingTableWidget(selector, fragmentClass, domWrap, observationLevel) {
    observationLevel = observationLevel || 10;
    // ^ arbitrary: should be Infinity, when route.js supports it. TODO
    domWrap = domWrap || Minimart.DOM.defaultWrapFunction;

    World.spawn({
	boot: function () { this.updateState(); },

	state: Route.emptyGestalt.serialize(),
	nextState: Route.emptyGestalt.serialize(),
	timer: false,

	localGestalt: (sub(       domWrap(selector, fragmentClass, __), 0, 2)
		       .union(pub(domWrap(selector, fragmentClass, __), 0, 2))
		       .telescoped()),

	digestGestalt: function (g) {
	    return g.stripLabel().erasePath(this.localGestalt).serialize();
	},

	updateState: function () {
	    var elts = ["pre", Route.deserializeGestalt(this.state).pretty()];
	    World.updateRoutes([sub(__, 0, observationLevel),
				pub(__, 0, observationLevel),
				pub(domWrap(selector, fragmentClass, elts))]);
	},

	handleEvent: function (e) {
	    var self = this;
	    if (e.type === "routes") {
		self.nextState = self.digestGestalt(e.gestalt);
		if (self.timer) {
		    clearTimeout(self.timer);
		    self.timer = false;
		}
		self.timer = setTimeout(World.wrap(function () {
		    if (JSON.stringify(self.nextState) !== JSON.stringify(self.state)) {
			self.state = self.nextState;
			self.updateState();
		    }
		    self.timer = false;
		}), 50);
	    }
	}
    });

}

module.exports.spawnRoutingTableWidget = spawnRoutingTableWidget;

},{"./minimart.js":7}],11:[function(_dereq_,module,exports){
// Generic Spy
var Minimart = _dereq_("./minimart.js");
var World = Minimart.World;
var sub = Minimart.sub;
var pub = Minimart.pub;
var __ = Minimart.__;

function Spy(label, useJson, observationLevel) {
    this.label = label || "SPY";
    this.observationLevel = observationLevel || 10; // arbitrary. Should be Infinity. TODO
    this.useJson = useJson;
}

Spy.prototype.boot = function () {
    World.updateRoutes([sub(__, 0, this.observationLevel), pub(__, 0, this.observationLevel)]);
};

Spy.prototype.handleEvent = function (e) {
    switch (e.type) {
    case "routes":
	console.log(this.label, "routes", e.gestalt.pretty());
	break;
    case "message":
	var messageRepr;
	try {
	    messageRepr = this.useJson ? JSON.stringify(e.message) : e.message;
	} catch (exn) {
	    messageRepr = e.message;
	}
	console.log(this.label, "message", messageRepr, e.metaLevel, e.isFeedback);
	break;
    default:
	console.log(this.label, "unknown", e);
	break;
    }
};

module.exports.Spy = Spy;

},{"./minimart.js":7}],12:[function(_dereq_,module,exports){
// Minimal jQueryish utilities. Reimplemented because jQuery needs
// window to exist, and we want to run in Web Worker context as well.

function extend(what, _with) {
  for (var prop in _with) {
    if (_with.hasOwnProperty(prop)) {
      what[prop] = _with[prop];
    }
  }
  return what;
}

module.exports.extend = extend;

},{}],13:[function(_dereq_,module,exports){
// Wake detector - notices when something (such as
// suspension/sleeping!) has caused periodic activities to be
// interrupted, and warns others about it
// Inspired by http://blog.alexmaccaw.com/javascript-wake-event
var Minimart = _dereq_("./minimart.js");
var World = Minimart.World;
var sub = Minimart.sub;
var pub = Minimart.pub;
var __ = Minimart.__;

function WakeDetector(period) {
    this.message = "wake";
    this.period = period || 10000;
    this.mostRecentTrigger = +(new Date());
    this.timerId = null;
}

WakeDetector.prototype.boot = function () {
    var self = this;
    World.updateRoutes([pub(this.message)]);
    this.timerId = setInterval(World.wrap(function () { self.trigger(); }), this.period);
};

WakeDetector.prototype.handleEvent = function (e) {};

WakeDetector.prototype.trigger = function () {
    var now = +(new Date());
    if (now - this.mostRecentTrigger > this.period * 1.5) {
	World.send(this.message);
    }
    this.mostRecentTrigger = now;
};

module.exports.WakeDetector = WakeDetector;

},{"./minimart.js":7}],14:[function(_dereq_,module,exports){
var Minimart = _dereq_("./minimart.js");
var Codec = _dereq_("./codec.js");
var Route = Minimart.Route;
var World = Minimart.World;
var sub = Minimart.sub;
var pub = Minimart.pub;
var __ = Minimart.__;
var _$ = Minimart._$;

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
    this.localGestalt = Route.emptyGestalt;
    this.peerGestalt = Route.emptyGestalt;
    this.prevLocalRoutesMessage = null;
    this.prevPeerRoutesMessage = null;
    this.deduplicator = new Minimart.Deduplicator();
    this.connectionCount = 0;

    this.activityTimestamp = 0;
    this.idleTimeout = DEFAULT_IDLE_TIMEOUT;
    this.pingInterval = DEFAULT_PING_INTERVAL;
    this.idleTimer = null;
    this.pingTimer = null;
}

WebSocketConnection.prototype.debugState = function () {
  return {
    label: this.label,
    sendsAttempted: this.sendsAttempted,
    sendsTransmitted: this.sendsTransmitted,
    receiveCount: this.receiveCount,
    wsurl: this.wsurl,
    shouldReconnect: this.shouldReconnect,
    reconnectDelay: this.reconnectDelay,
    connectionCount: this.connectionCount,
    activityTimestamp: this.activityTimestamp
  };
};

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
	return Route.compilePattern(true,
				    [self.label, metaLevel, Route.embeddedMatcher(m)]);
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
    var newLocalRoutesMessage =
	JSON.stringify(Codec.encodeEvent(Minimart.updateRoutes([this.localGestalt])));
    if (this.prevLocalRoutesMessage !== newLocalRoutesMessage) {
	this.prevLocalRoutesMessage = newLocalRoutesMessage;
	this.safeSend(newLocalRoutesMessage);
    }
};

WebSocketConnection.prototype.collectMatchers = function (getAdvertisements, level, g) {
    var extractMetaLevels = Route.compileProjection([this.label, _$, __]);
    var mls = Route.matcherKeys(g.project(extractMetaLevels, getAdvertisements, 0, level));
    for (var i = 0; i < mls.length; i++) {
	var metaLevel = mls[i][0]; // only one capture in the projection
	var extractMatchers = Route.compileProjection([this.label, metaLevel, _$]);
	var m = g.project(extractMatchers, getAdvertisements, 0, level);
	this.localGestalt = this.localGestalt.union(Route.simpleGestalt(getAdvertisements,
									Route.embeddedMatcher(m),
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
	var relayGestalt = Route.fullGestalt(1, nLevels).label(World.activePid());
	var g = e.gestalt.erasePath(relayGestalt);
	this.localGestalt = Route.emptyGestalt;
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
	    var encoded = JSON.stringify(Codec.encodeEvent(
		Minimart.sendMessage(m[2], m[1], e.isFeedback)));
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

    var e = Codec.decodeAction(j);
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

module.exports.WebSocketConnection = WebSocketConnection;

},{"./codec.js":2,"./minimart.js":7}],15:[function(_dereq_,module,exports){
/* Web Worker interface */
var Ground = _dereq_("./ground.js").Ground;
var Util = _dereq_("./util.js");
var Codec = _dereq_("./codec.js");

var Minimart = _dereq_("./minimart.js");
var World = Minimart.World;
var sub = Minimart.sub;
var pub = Minimart.pub;
var __ = Minimart.__;

var BuiltinWorker = typeof window !== 'undefined' && window.Worker;

///////////////////////////////////////////////////////////////////////////

function Worker(scriptUrl) {
  this.scriptUrl = scriptUrl;
  this.w = new BuiltinWorker(scriptUrl);
}

Worker.prototype.boot = function () {
  this.w.onmessage = World.wrap(function (e) {
    console.log("Received from worker", JSON.stringify(e.data));
    World.current().enqueueAction(World.activePid(), Codec.decodeAction(e.data));
  });
};

Worker.prototype.handleEvent = function (e) {
  console.log("Sending to worker", JSON.stringify(Codec.encodeEvent(e)));
  this.w.postMessage(Codec.encodeEvent(e));
};

///////////////////////////////////////////////////////////////////////////

function WorkerGround(bootFn) {
  var self = this;
  Ground.call(this, bootFn);
  onmessage = function (e) {
    console.log("Received from main page", JSON.stringify(e.data));
    self.world.handleEvent(Codec.decodeEvent(e.data));
    self.startStepping();
  };
}

WorkerGround.prototype = Util.extend({}, Ground.prototype);

WorkerGround.prototype.enqueueAction = function (pid, action) {
  console.log("Sending to main page", JSON.stringify(Codec.encodeAction(action)));
  postMessage(Codec.encodeAction(action));
  console.log("Sent to main page");
};

///////////////////////////////////////////////////////////////////////////

module.exports.Worker = Worker;
module.exports.WorkerGround = WorkerGround;

},{"./codec.js":2,"./ground.js":4,"./minimart.js":7,"./util.js":12}]},{},[6])
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi9Vc2Vycy90b255Zy9zcmMvanMtbWFya2V0cGxhY2Uvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXItcGFjay9fcHJlbHVkZS5qcyIsIi9Vc2Vycy90b255Zy9zcmMvanMtbWFya2V0cGxhY2Uvc3JjL2FjdG9yLmpzIiwiL1VzZXJzL3RvbnlnL3NyYy9qcy1tYXJrZXRwbGFjZS9zcmMvY29kZWMuanMiLCIvVXNlcnMvdG9ueWcvc3JjL2pzLW1hcmtldHBsYWNlL3NyYy9kb20tZHJpdmVyLmpzIiwiL1VzZXJzL3RvbnlnL3NyYy9qcy1tYXJrZXRwbGFjZS9zcmMvZ3JvdW5kLmpzIiwiL1VzZXJzL3RvbnlnL3NyYy9qcy1tYXJrZXRwbGFjZS9zcmMvanF1ZXJ5LWRyaXZlci5qcyIsIi9Vc2Vycy90b255Zy9zcmMvanMtbWFya2V0cGxhY2Uvc3JjL21haW4uanMiLCIvVXNlcnMvdG9ueWcvc3JjL2pzLW1hcmtldHBsYWNlL3NyYy9taW5pbWFydC5qcyIsIi9Vc2Vycy90b255Zy9zcmMvanMtbWFya2V0cGxhY2Uvc3JjL3JlZmxlY3QuanMiLCIvVXNlcnMvdG9ueWcvc3JjL2pzLW1hcmtldHBsYWNlL3NyYy9yb3V0ZS5qcyIsIi9Vc2Vycy90b255Zy9zcmMvanMtbWFya2V0cGxhY2Uvc3JjL3JvdXRpbmctdGFibGUtd2lkZ2V0LmpzIiwiL1VzZXJzL3RvbnlnL3NyYy9qcy1tYXJrZXRwbGFjZS9zcmMvc3B5LmpzIiwiL1VzZXJzL3RvbnlnL3NyYy9qcy1tYXJrZXRwbGFjZS9zcmMvdXRpbC5qcyIsIi9Vc2Vycy90b255Zy9zcmMvanMtbWFya2V0cGxhY2Uvc3JjL3dha2UtZGV0ZWN0b3IuanMiLCIvVXNlcnMvdG9ueWcvc3JjL2pzLW1hcmtldHBsYWNlL3NyYy93ZWJzb2NrZXQtZHJpdmVyLmpzIiwiL1VzZXJzL3RvbnlnL3NyYy9qcy1tYXJrZXRwbGFjZS9zcmMvd29ya2VyLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25SQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckhBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDN0RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFnQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pqREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDYkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2UEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3Rocm93IG5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIil9dmFyIGY9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGYuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sZixmLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsInZhciBSZWZsZWN0ID0gcmVxdWlyZShcIi4vcmVmbGVjdC5qc1wiKTtcbnZhciBNaW5pbWFydCA9IHJlcXVpcmUoXCIuL21pbmltYXJ0LmpzXCIpO1xudmFyIFdvcmxkID0gTWluaW1hcnQuV29ybGQ7XG52YXIgUm91dGUgPSBNaW5pbWFydC5Sb3V0ZTtcblxuQWN0b3IuX2NodW5rcyA9IG51bGw7XG5cbmZ1bmN0aW9uIEFjdG9yKGN0b3IpIHtcbiAgICB2YXIgb2xkQ2h1bmtzID0gQWN0b3IuX2NodW5rcztcbiAgICB0cnkge1xuXHRBY3Rvci5fY2h1bmtzID0gW107XG5cdHZhciBiZWhhdmlvciA9IG5ldyBjdG9yKCk7XG5cdHJldHVybiBmaW5hbGl6ZUFjdG9yKGJlaGF2aW9yLCBBY3Rvci5fY2h1bmtzKTtcbiAgICB9IGNhdGNoIChlKSB7XG5cdEFjdG9yLl9jaHVua3MgPSBvbGRDaHVua3M7XG5cdHRocm93IGU7XG4gICAgfVxufVxuXG5mdW5jdGlvbiBjaGVja0NodW5rcyh0eXBlKSB7XG4gICAgaWYgKCFBY3Rvci5fY2h1bmtzKSB7XG5cdHRocm93IG5ldyBFcnJvcihcIkNhbGwgdG8gQWN0b3IuXCIrdHlwZStcIiBvdXRzaWRlIG9mIEFjdG9yIGNvbnN0cnVjdG9yXCIpO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gZXh0cmFjdENodW5rKHR5cGUsIGtpbmQsIGRlZmF1bHRPcHRpb25zLCBhcmdzKSB7XG4gICAgdmFyIHJhd1Byb2plY3Rpb25GbiA9IGFyZ3NbMF1cbiAgICB2YXIgb3B0aW9ucyA9IG51bGw7XG4gICAgdmFyIGhhbmRsZXIgPSBudWxsO1xuICAgIGlmICh0eXBlb2YgcmF3UHJvamVjdGlvbkZuICE9PSAnZnVuY3Rpb24nKSB7XG5cdHRocm93IG5ldyBFcnJvcihcIkFjdG9yLlwiK3R5cGUrXCIgZXhwZWN0cyBhIGZ1bmN0aW9uIHByb2R1Y2luZyBhIHBhdHRlcm4gYXMgZmlyc3QgYXJndW1lbnRcIik7XG4gICAgfVxuICAgIGZvciAodmFyIGkgPSAxOyBpIDwgYXJncy5sZW5ndGg7IGkrKykgeyAvLyBOQjogc2tpcCB0aGUgZmlyc3QgYXJnIC0gaXQncyByYXdQcm9qZWN0aW9uRm5cblx0aWYgKHR5cGVvZiBhcmdzW2ldID09PSAnZnVuY3Rpb24nKSB7XG5cdCAgICBpZiAoaGFuZGxlciAhPT0gbnVsbCkgeyB0aHJvdyBuZXcgRXJyb3IoXCJUb28gbWFueSBoYW5kbGVyIGZ1bmN0aW9ucyBpbiBBY3Rvci5cIit0eXBlKTsgfVxuXHQgICAgaGFuZGxlciA9IGFyZ3NbaV07XG5cdH0gZWxzZSBpZiAodHlwZW9mIGFyZ3NbaV0gPT09ICdvYmplY3QnKSB7XG5cdCAgICBpZiAob3B0aW9ucyAhPT0gbnVsbCkgeyB0aHJvdyBuZXcgRXJyb3IoXCJUb28gbWFueSBvcHRpb25zIGFyZ3VtZW50cyBpbiBBY3Rvci5cIit0eXBlKTsgfVxuXHQgICAgb3B0aW9ucyA9IGFyZ3NbaV07XG5cdH0gZWxzZSB7XG5cdCAgICB0aHJvdyBuZXcgRXJyb3IoXCJVbnJlY29nbmlzZWQgYXJndW1lbnQgaW4gQWN0b3IuXCIrdHlwZSk7XG5cdH1cbiAgICB9XG4gICAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG4gICAgZm9yICh2YXIgayBpbiBvcHRpb25zKSB7XG5cdGlmICghKGsgaW4gZGVmYXVsdE9wdGlvbnMpKSB7XG5cdCAgICB0aHJvdyBuZXcgRXJyb3IoXCJVbnJlY29nbmlzZWQgb3B0aW9uICdcIitrK1wiJyBpbiBBY3Rvci5cIit0eXBlKTtcblx0fVxuICAgIH1cbiAgICBmb3IgKHZhciBrIGluIGRlZmF1bHRPcHRpb25zKSB7XG5cdGlmICghKGsgaW4gb3B0aW9ucykpIHtcblx0ICAgIG9wdGlvbnNba10gPSBkZWZhdWx0T3B0aW9uc1trXTtcblx0fVxuICAgIH1cbiAgICByZXR1cm4ge1xuXHR0eXBlOiB0eXBlLFxuXHRraW5kOiBraW5kLFxuXHRyYXdQcm9qZWN0aW9uRm46IHJhd1Byb2plY3Rpb25Gbixcblx0b3B0aW9uczogb3B0aW9ucyxcblx0aGFuZGxlcjogaGFuZGxlclxuICAgIH07XG59XG5cbmZ1bmN0aW9uIHJlY29yZENodW5rKGNodW5rKSB7XG4gICAgQWN0b3IuX2NodW5rcy5wdXNoKGNodW5rKTtcbn1cblxuZnVuY3Rpb24gY2h1bmtFeHRyYWN0b3IodHlwZSwga2luZCwgZGVmYXVsdE9wdGlvbnMpIHtcbiAgICByZXR1cm4gZnVuY3Rpb24gKC8qIC4uLiAqLykge1xuXHRjaGVja0NodW5rcyh0eXBlKTtcblx0cmVjb3JkQ2h1bmsoZXh0cmFjdENodW5rKHR5cGUsXG5cdFx0XHRcdCBraW5kLFxuXHRcdFx0XHQgZGVmYXVsdE9wdGlvbnMsXG5cdFx0XHRcdCBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMpKSk7XG4gICAgfTtcbn1cblxudmFyIHBhcnRpY2lwYW50RGVmYXVsdHMgPSB7XG4gICAgbWV0YUxldmVsOiAwLFxuICAgIHdoZW46IGZ1bmN0aW9uICgpIHsgcmV0dXJuIHRydWU7IH1cbn07XG5cbnZhciBvYnNlcnZlckRlZmF1bHRzID0ge1xuICAgIG1ldGFMZXZlbDogMCxcbiAgICBsZXZlbDogMCxcbiAgICB3aGVuOiBmdW5jdGlvbiAoKSB7IHJldHVybiB0cnVlOyB9LFxuICAgIHByZXNlbmNlOiBudWxsLFxuICAgIG5hbWU6IG51bGwsXG4gICAgc2luZ2xldG9uOiBudWxsLFxuICAgIHNldDogbnVsbCxcbiAgICBhZGRlZDogbnVsbCxcbiAgICByZW1vdmVkOiBudWxsXG59O1xuXG5BY3Rvci5hZHZlcnRpc2UgPSBjaHVua0V4dHJhY3RvcignYWR2ZXJ0aXNlJywgJ3BhcnRpY2lwYW50JywgcGFydGljaXBhbnREZWZhdWx0cyk7XG5BY3Rvci5zdWJzY3JpYmUgPSBjaHVua0V4dHJhY3Rvcignc3Vic2NyaWJlJywgJ3BhcnRpY2lwYW50JywgcGFydGljaXBhbnREZWZhdWx0cyk7XG5cbkFjdG9yLm9ic2VydmVBZHZlcnRpc2VycyA9IGNodW5rRXh0cmFjdG9yKCdvYnNlcnZlQWR2ZXJ0aXNlcnMnLCAnb2JzZXJ2ZXInLCBvYnNlcnZlckRlZmF1bHRzKTtcbkFjdG9yLm9ic2VydmVTdWJzY3JpYmVycyA9IGNodW5rRXh0cmFjdG9yKCdvYnNlcnZlU3Vic2NyaWJlcnMnLCAnb2JzZXJ2ZXInLCBvYnNlcnZlckRlZmF1bHRzKTtcblxuQWN0b3Iub2JzZXJ2ZUdlc3RhbHQgPSBmdW5jdGlvbiAoZ2VzdGFsdEZuLCBldmVudEhhbmRsZXJGbikge1xuICAgIGNoZWNrQ2h1bmtzKCdvYnNlcnZlR2VzdGFsdCcpO1xuICAgIHJlY29yZENodW5rKHtcblx0dHlwZTogJ29ic2VydmVHZXN0YWx0Jyxcblx0a2luZDogJ3JhdycsXG5cdGdlc3RhbHRGbjogZ2VzdGFsdEZuLFxuXHRvcHRpb25zOiB7XG5cdCAgICB3aGVuOiBmdW5jdGlvbiAoKSB7IHJldHVybiB0cnVlOyB9XG5cdH0sXG5cdGV2ZW50SGFuZGxlckZuOiBldmVudEhhbmRsZXJGblxuICAgIH0pO1xufTtcblxuZnVuY3Rpb24gZmluYWxpemVBY3RvcihiZWhhdmlvciwgY2h1bmtzKSB7XG4gICAgdmFyIG9sZEJvb3QgPSBiZWhhdmlvci5ib290O1xuICAgIHZhciBvbGRIYW5kbGVFdmVudCA9IGJlaGF2aW9yLmhhbmRsZUV2ZW50O1xuICAgIHZhciBwcm9qZWN0aW9ucyA9IHt9O1xuICAgIHZhciBjb21waWxlZFByb2plY3Rpb25zID0ge307XG4gICAgdmFyIHByZXZpb3VzT2JqcyA9IHt9O1xuXG4gICAgYmVoYXZpb3IuYm9vdCA9IGZ1bmN0aW9uICgpIHtcblx0aWYgKG9sZEJvb3QpIHsgb2xkQm9vdC5jYWxsKHRoaXMpOyB9XG5cdGZvciAodmFyIGkgPSAwOyBpIDwgY2h1bmtzLmxlbmd0aDsgaSsrKSB7XG5cdCAgICB2YXIgY2h1bmsgPSBjaHVua3NbaV07XG5cdCAgICBpZiAoY2h1bmsua2luZCA9PT0gJ29ic2VydmVyJykge1xuXHRcdGlmIChjaHVuay5vcHRpb25zLnByZXNlbmNlKSB7IHRoaXNbY2h1bmsub3B0aW9ucy5wcmVzZW5jZV0gPSBmYWxzZTsgfVxuXHRcdGlmIChjaHVuay5vcHRpb25zLm5hbWUpIHsgdGhpc1tjaHVuay5vcHRpb25zLm5hbWVdID0gW107IH1cblx0XHRpZiAoY2h1bmsub3B0aW9ucy5zaW5nbGV0b24pIHsgdGhpc1tjaHVuay5vcHRpb25zLnNpbmdsZXRvbl0gPSB1bmRlZmluZWQ7IH1cblx0XHRpZiAoY2h1bmsub3B0aW9ucy5hZGRlZCkgeyB0aGlzW2NodW5rLm9wdGlvbnMuYWRkZWRdID0gW107IH1cblx0XHRpZiAoY2h1bmsub3B0aW9ucy5yZW1vdmVkKSB7IHRoaXNbY2h1bmsub3B0aW9ucy5yZW1vdmVkXSA9IFtdOyB9XG5cdCAgICB9XG5cdH1cblx0dGhpcy51cGRhdGVSb3V0ZXMoKTtcbiAgICB9O1xuXG4gICAgYmVoYXZpb3IudXBkYXRlUm91dGVzID0gZnVuY3Rpb24gKCkge1xuXHR2YXIgbmV3Um91dGVzID0gUm91dGUuZW1wdHlHZXN0YWx0O1xuXHRmb3IgKHZhciBpID0gMDsgaSA8IGNodW5rcy5sZW5ndGg7IGkrKykge1xuXHQgICAgdmFyIGNodW5rID0gY2h1bmtzW2ldO1xuXHQgICAgaWYgKGNodW5rLm9wdGlvbnMud2hlbi5jYWxsKHRoaXMpKSB7XG5cdFx0c3dpdGNoIChjaHVuay5raW5kKSB7XG5cdFx0Y2FzZSAncmF3Jzpcblx0XHQgICAgbmV3Um91dGVzID0gbmV3Um91dGVzLnVuaW9uKGNodW5rLmdlc3RhbHRGbi5jYWxsKHRoaXMpKTtcblx0XHQgICAgYnJlYWs7XG5cdFx0Y2FzZSAncGFydGljaXBhbnQnOlxuXHRcdCAgICB2YXIgcHJvaiA9IGNodW5rLnJhd1Byb2plY3Rpb25Gbi5jYWxsKHRoaXMpO1xuXHRcdCAgICBwcm9qZWN0aW9uc1tpXSA9IHByb2o7XG5cdFx0ICAgIHZhciBnID0gUm91dGUuc2ltcGxlR2VzdGFsdChjaHVuay50eXBlID09PSAnYWR2ZXJ0aXNlJyxcblx0XHRcdFx0XHRcdFJvdXRlLnByb2plY3Rpb25Ub1BhdHRlcm4ocHJvaiksXG5cdFx0XHRcdFx0XHRjaHVuay5vcHRpb25zLm1ldGFMZXZlbCxcblx0XHRcdFx0XHRcdDApO1xuXHRcdCAgICBuZXdSb3V0ZXMgPSBuZXdSb3V0ZXMudW5pb24oZyk7XG5cdFx0ICAgIGJyZWFrO1xuXHRcdGNhc2UgJ29ic2VydmVyJzpcblx0XHQgICAgdmFyIHByb2ogPSBjaHVuay5yYXdQcm9qZWN0aW9uRm4uY2FsbCh0aGlzKTtcblx0XHQgICAgcHJvamVjdGlvbnNbaV0gPSBwcm9qO1xuXHRcdCAgICBjb21waWxlZFByb2plY3Rpb25zW2ldID0gUm91dGUuY29tcGlsZVByb2plY3Rpb24ocHJvaik7XG5cdFx0ICAgIHZhciBnID0gUm91dGUuc2ltcGxlR2VzdGFsdChjaHVuay50eXBlID09PSAnb2JzZXJ2ZVN1YnNjcmliZXJzJyxcblx0XHRcdFx0XHRcdFJvdXRlLnByb2plY3Rpb25Ub1BhdHRlcm4ocHJvaiksXG5cdFx0XHRcdFx0XHRjaHVuay5vcHRpb25zLm1ldGFMZXZlbCxcblx0XHRcdFx0XHRcdGNodW5rLm9wdGlvbnMubGV2ZWwgKyAxKTtcblx0XHQgICAgbmV3Um91dGVzID0gbmV3Um91dGVzLnVuaW9uKGcpO1xuXHRcdCAgICBpZiAoY2h1bmsub3B0aW9ucy5hZGRlZCB8fCBjaHVuay5vcHRpb25zLnJlbW92ZWQpIHtcblx0XHRcdHByZXZpb3VzT2Jqc1tpXSA9IFJvdXRlLmFycmF5VG9TZXQoW10pO1xuXHRcdCAgICB9XG5cdFx0ICAgIGJyZWFrO1xuXHRcdGRlZmF1bHQ6XG5cdFx0ICAgIHRocm93IG5ldyBFcnJvcihcIlVuc3VwcG9ydGVkIGNodW5rIHR5cGUva2luZDogXCIrY2h1bmsudHlwZStcIi9cIitjaHVuay5raW5kKTtcblx0XHR9XG5cdCAgICB9XG5cdH1cblx0V29ybGQudXBkYXRlUm91dGVzKFtuZXdSb3V0ZXNdKTtcbiAgICB9O1xuXG4gICAgYmVoYXZpb3IuaGFuZGxlRXZlbnQgPSBmdW5jdGlvbiAoZSkge1xuXHRpZiAob2xkSGFuZGxlRXZlbnQpIHsgb2xkSGFuZGxlRXZlbnQuY2FsbCh0aGlzLCBlKTsgfVxuXHRmb3IgKHZhciBpID0gMDsgaSA8IGNodW5rcy5sZW5ndGg7IGkrKykge1xuXHQgICAgdmFyIGNodW5rID0gY2h1bmtzW2ldO1xuXHQgICAgc3dpdGNoIChjaHVuay5raW5kKSB7XG5cdCAgICBjYXNlICdyYXcnOlxuXHRcdGNodW5rLmV2ZW50SGFuZGxlckZuLmNhbGwodGhpcywgZSk7XG5cdFx0YnJlYWs7XG5cdCAgICBjYXNlICdwYXJ0aWNpcGFudCc6XG5cdFx0aWYgKGNodW5rLmhhbmRsZXJcblx0XHQgICAgJiYgKGUudHlwZSA9PT0gJ21lc3NhZ2UnKVxuXHRcdCAgICAmJiAoZS5tZXRhTGV2ZWwgPT09IGNodW5rLm9wdGlvbnMubWV0YUxldmVsKVxuXHRcdCAgICAmJiAoZS5pc0ZlZWRiYWNrID09PSAoY2h1bmsudHlwZSA9PT0gJ2FkdmVydGlzZScpKSlcblx0XHR7XG5cdFx0ICAgIHZhciBtYXRjaFJlc3VsdCA9IFJvdXRlLm1hdGNoUGF0dGVybihlLm1lc3NhZ2UsIHByb2plY3Rpb25zW2ldKTtcblx0XHQgICAgaWYgKG1hdGNoUmVzdWx0KSB7XG5cdFx0XHRrd0FwcGx5KGNodW5rLmhhbmRsZXIsIHRoaXMsIG1hdGNoUmVzdWx0KTtcblx0XHQgICAgfVxuXHRcdH1cblx0XHRicmVhaztcblx0ICAgIGNhc2UgJ29ic2VydmVyJzpcblx0XHRpZiAoZS50eXBlID09PSAncm91dGVzJykge1xuXHRcdCAgICB2YXIgcHJvamVjdGlvblJlc3VsdCA9IGUuZ2VzdGFsdC5wcm9qZWN0KGNvbXBpbGVkUHJvamVjdGlvbnNbaV0sXG5cdFx0XHRcdFx0XHRcdCAgICAgY2h1bmsudHlwZSAhPT0gJ29ic2VydmVTdWJzY3JpYmVycycsXG5cdFx0XHRcdFx0XHRcdCAgICAgY2h1bmsub3B0aW9ucy5tZXRhTGV2ZWwsXG5cdFx0XHRcdFx0XHRcdCAgICAgY2h1bmsub3B0aW9ucy5sZXZlbCk7XG5cblx0XHQgICAgdmFyIGlzUHJlc2VudCA9ICFSb3V0ZS5pc19lbXB0eU1hdGNoZXIocHJvamVjdGlvblJlc3VsdCk7XG5cdFx0ICAgIGlmIChjaHVuay5vcHRpb25zLnByZXNlbmNlKSB7XG5cdFx0XHR0aGlzW2NodW5rLm9wdGlvbnMucHJlc2VuY2VdID0gaXNQcmVzZW50O1xuXHRcdCAgICB9XG5cblx0XHQgICAgdmFyIG9ianMgPSBbXTtcblx0XHQgICAgaWYgKGlzUHJlc2VudCkge1xuXHRcdFx0dmFyIGtleXMgPSBSb3V0ZS5tYXRjaGVyS2V5cyhwcm9qZWN0aW9uUmVzdWx0KTtcblx0XHRcdGlmIChrZXlzID09PSBudWxsKSB7XG5cdFx0XHQgICAgY29uc29sZS53YXJuKFwiV2lsZGNhcmQgZGV0ZWN0ZWQgd2hpbGUgcHJvamVjdGluZyAoXCJcblx0XHRcdFx0XHQgK0pTT04uc3RyaW5naWZ5KGNodW5rLm9wdGlvbnMpK1wiKVwiKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHQgICAgb2JqcyA9IFJvdXRlLm1hdGNoZXJLZXlzVG9PYmplY3RzKGtleXMsIGNvbXBpbGVkUHJvamVjdGlvbnNbaV0pO1xuXHRcdFx0ICAgIGlmIChjaHVuay5vcHRpb25zLnNldCkge1xuXHRcdFx0XHRmb3IgKHZhciBqID0gMDsgaiA8IG9ianMubGVuZ3RoOyBqKyspIHtcblx0XHRcdFx0ICAgIG9ianNbal0gPSBjaHVuay5vcHRpb25zLnNldC5jYWxsKHRoaXMsIG9ianNbal0pO1xuXHRcdFx0XHR9XG5cdFx0XHQgICAgfVxuXHRcdFx0fVxuXHRcdCAgICB9XG5cdFx0ICAgIGlmIChjaHVuay5vcHRpb25zLm5hbWUpIHtcblx0XHRcdHRoaXNbY2h1bmsub3B0aW9ucy5uYW1lXSA9IG9ianM7XG5cdFx0ICAgIH1cblx0XHQgICAgaWYgKGNodW5rLm9wdGlvbnMuc2luZ2xldG9uKSB7XG5cdFx0XHR0aGlzW2NodW5rLm9wdGlvbnMuc2luZ2xldG9uXSA9IG9ianMubGVuZ3RoID09PSAxID8gb2Jqc1swXSA6IHVuZGVmaW5lZDtcblx0XHQgICAgfVxuXG5cdFx0ICAgIGlmIChjaHVuay5vcHRpb25zLmFkZGVkIHx8IGNodW5rLm9wdGlvbnMucmVtb3ZlZCkge1xuXHRcdFx0dmFyIG9ialNldCA9IFJvdXRlLmFycmF5VG9TZXQob2Jqcyk7XG5cblx0XHRcdGlmIChjaHVuay5vcHRpb25zLmFkZGVkKSB7XG5cdFx0XHQgICAgdGhpc1tjaHVuay5vcHRpb25zLmFkZGVkXSA9XG5cdFx0XHRcdFJvdXRlLnNldFRvQXJyYXkoUm91dGUuc2V0U3VidHJhY3Qob2JqU2V0LCBwcmV2aW91c09ianNbaV0pKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGNodW5rLm9wdGlvbnMucmVtb3ZlZCkge1xuXHRcdFx0ICAgIHRoaXNbY2h1bmsub3B0aW9ucy5yZW1vdmVkXSA9XG5cdFx0XHRcdFJvdXRlLnNldFRvQXJyYXkoUm91dGUuc2V0U3VidHJhY3QocHJldmlvdXNPYmpzW2ldLCBvYmpTZXQpKTtcblx0XHRcdH1cblxuXHRcdFx0cHJldmlvdXNPYmpzW2ldID0gb2JqU2V0O1xuXHRcdCAgICB9XG5cblx0XHQgICAgaWYgKGNodW5rLmhhbmRsZXIpIHtcblx0XHRcdGNodW5rLmhhbmRsZXIuY2FsbCh0aGlzKTtcblx0XHQgICAgfVxuXHRcdH1cblx0XHRicmVhaztcblx0ICAgIGRlZmF1bHQ6XG5cdFx0dGhyb3cgbmV3IEVycm9yKFwiVW5zdXBwb3J0ZWQgY2h1bmsgdHlwZS9raW5kOiBcIitjaHVuay50eXBlK1wiL1wiK2NodW5rLmtpbmQpO1xuXHQgICAgfVxuXHR9XG4gICAgfTtcblxuICAgIHJldHVybiBiZWhhdmlvcjtcbn1cblxuZnVuY3Rpb24ga3dBcHBseShmLCB0aGlzQXJnLCBhcmdzKSB7XG4gICAgdmFyIGZvcm1hbHMgPSBSZWZsZWN0LmZvcm1hbFBhcmFtZXRlcnMoZik7XG4gICAgdmFyIGFjdHVhbHMgPSBbXVxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgZm9ybWFscy5sZW5ndGg7IGkrKykge1xuXHR2YXIgZm9ybWFsID0gZm9ybWFsc1tpXTtcblx0aWYgKCEoZm9ybWFsIGluIGFyZ3MpKSB7XG5cdCAgICB0aHJvdyBuZXcgRXJyb3IoXCJGdW5jdGlvbiBwYXJhbWV0ZXIgJ1wiK2Zvcm1hbCtcIicgbm90IHByZXNlbnQgaW4gYXJnc1wiKTtcblx0fVxuXHRhY3R1YWxzLnB1c2goYXJnc1tmb3JtYWxdKTtcbiAgICB9XG4gICAgcmV0dXJuIGYuYXBwbHkodGhpc0FyZywgYWN0dWFscyk7XG59XG5cbi8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuXG5tb2R1bGUuZXhwb3J0cy5BY3RvciA9IEFjdG9yO1xubW9kdWxlLmV4cG9ydHMua3dBcHBseSA9IGt3QXBwbHk7XG4iLCIvLyBXaXJlIHByb3RvY29sIHJlcHJlc2VudGF0aW9uIG9mIGV2ZW50cyBhbmQgYWN0aW9uc1xuXG52YXIgUm91dGUgPSByZXF1aXJlKFwiLi9yb3V0ZS5qc1wiKTtcblxuZnVuY3Rpb24gX2VuY29kZShlKSB7XG4gICAgc3dpdGNoIChlLnR5cGUpIHtcbiAgICBjYXNlIFwicm91dGVzXCI6XG5cdHJldHVybiBbXCJyb3V0ZXNcIiwgZS5nZXN0YWx0LnNlcmlhbGl6ZShmdW5jdGlvbiAodikgeyByZXR1cm4gdHJ1ZTsgfSldO1xuICAgIGNhc2UgXCJtZXNzYWdlXCI6XG5cdHJldHVybiBbXCJtZXNzYWdlXCIsIGUubWVzc2FnZSwgZS5tZXRhTGV2ZWwsIGUuaXNGZWVkYmFja107XG4gICAgfVxufVxuXG5mdW5jdGlvbiBfZGVjb2RlKHdoYXQpIHtcbiAgcmV0dXJuIGZ1bmN0aW9uIChqKSB7XG4gICAgc3dpdGNoIChqWzBdKSB7XG4gICAgY2FzZSBcInJvdXRlc1wiOlxuICAgICAgcmV0dXJuIE1pbmltYXJ0LnVwZGF0ZVJvdXRlcyhbXG5cdFJvdXRlLmRlc2VyaWFsaXplR2VzdGFsdChqWzFdLCBmdW5jdGlvbiAodikgeyByZXR1cm4gdHJ1ZTsgfSldKTtcbiAgICBjYXNlIFwibWVzc2FnZVwiOlxuICAgICAgcmV0dXJuIE1pbmltYXJ0LnNlbmRNZXNzYWdlKGpbMV0sIGpbMl0sIGpbM10pO1xuICAgIGRlZmF1bHQ6XG4gICAgICB0aHJvdyB7IG1lc3NhZ2U6IFwiSW52YWxpZCBKU09OLWVuY29kZWQgXCIgKyB3aGF0ICsgXCI6IFwiICsgSlNPTi5zdHJpbmdpZnkoaikgfTtcbiAgICB9XG4gIH07XG59XG5cbi8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuXG5tb2R1bGUuZXhwb3J0cy5lbmNvZGVFdmVudCA9IF9lbmNvZGU7XG5tb2R1bGUuZXhwb3J0cy5kZWNvZGVFdmVudCA9IF9kZWNvZGUoXCJldmVudFwiKTtcbm1vZHVsZS5leHBvcnRzLmVuY29kZUFjdGlvbiA9IF9lbmNvZGU7XG5tb2R1bGUuZXhwb3J0cy5kZWNvZGVBY3Rpb24gPSBfZGVjb2RlKFwiYWN0aW9uXCIpO1xuIiwiLy8gRE9NIGZyYWdtZW50IGRpc3BsYXkgZHJpdmVyXG52YXIgTWluaW1hcnQgPSByZXF1aXJlKFwiLi9taW5pbWFydC5qc1wiKTtcbnZhciBXb3JsZCA9IE1pbmltYXJ0LldvcmxkO1xudmFyIHN1YiA9IE1pbmltYXJ0LnN1YjtcbnZhciBwdWIgPSBNaW5pbWFydC5wdWI7XG52YXIgX18gPSBNaW5pbWFydC5fXztcbnZhciBfJCA9IE1pbmltYXJ0Ll8kO1xuXG5mdW5jdGlvbiBzcGF3bkRPTURyaXZlcihkb21XcmFwRnVuY3Rpb24sIGpRdWVyeVdyYXBGdW5jdGlvbikge1xuICAgIGRvbVdyYXBGdW5jdGlvbiA9IGRvbVdyYXBGdW5jdGlvbiB8fCBkZWZhdWx0V3JhcEZ1bmN0aW9uO1xuICAgIHZhciBkID0gbmV3IE1pbmltYXJ0LkRlbWFuZE1hdGNoZXIoZG9tV3JhcEZ1bmN0aW9uKF8kLCBfJCwgXyQpKTtcbiAgICBkLm9uRGVtYW5kSW5jcmVhc2UgPSBmdW5jdGlvbiAoY2FwdHVyZXMpIHtcblx0dmFyIHNlbGVjdG9yID0gY2FwdHVyZXNbMF07XG5cdHZhciBmcmFnbWVudENsYXNzID0gY2FwdHVyZXNbMV07XG5cdHZhciBmcmFnbWVudFNwZWMgPSBjYXB0dXJlc1syXTtcblx0V29ybGQuc3Bhd24obmV3IERPTUZyYWdtZW50KHNlbGVjdG9yLFxuXHRcdFx0XHQgICAgZnJhZ21lbnRDbGFzcyxcblx0XHRcdFx0ICAgIGZyYWdtZW50U3BlYyxcblx0XHRcdFx0ICAgIGRvbVdyYXBGdW5jdGlvbixcblx0XHRcdFx0ICAgIGpRdWVyeVdyYXBGdW5jdGlvbiksXG5cdFx0ICAgIFtzdWIoZG9tV3JhcEZ1bmN0aW9uKHNlbGVjdG9yLCBmcmFnbWVudENsYXNzLCBmcmFnbWVudFNwZWMpKSxcblx0XHQgICAgIHN1Yihkb21XcmFwRnVuY3Rpb24oc2VsZWN0b3IsIGZyYWdtZW50Q2xhc3MsIGZyYWdtZW50U3BlYyksIDAsIDEpXSk7XG4gICAgfTtcbiAgICBXb3JsZC5zcGF3bihkKTtcbn1cblxuZnVuY3Rpb24gZGVmYXVsdFdyYXBGdW5jdGlvbihzZWxlY3RvciwgZnJhZ21lbnRDbGFzcywgZnJhZ21lbnRTcGVjKSB7XG4gICAgcmV0dXJuIFtcIkRPTVwiLCBzZWxlY3RvciwgZnJhZ21lbnRDbGFzcywgZnJhZ21lbnRTcGVjXTtcbn1cblxuZnVuY3Rpb24gRE9NRnJhZ21lbnQoc2VsZWN0b3IsIGZyYWdtZW50Q2xhc3MsIGZyYWdtZW50U3BlYywgZG9tV3JhcEZ1bmN0aW9uLCBqUXVlcnlXcmFwRnVuY3Rpb24pIHtcbiAgICB0aGlzLnNlbGVjdG9yID0gc2VsZWN0b3I7XG4gICAgdGhpcy5mcmFnbWVudENsYXNzID0gZnJhZ21lbnRDbGFzcztcbiAgICB0aGlzLmZyYWdtZW50U3BlYyA9IGZyYWdtZW50U3BlYztcbiAgICB0aGlzLmRvbVdyYXBGdW5jdGlvbiA9IGRvbVdyYXBGdW5jdGlvbjtcbiAgICB0aGlzLmpRdWVyeVdyYXBGdW5jdGlvbiA9IGpRdWVyeVdyYXBGdW5jdGlvbjtcbiAgICB0aGlzLm5vZGVzID0gdGhpcy5idWlsZE5vZGVzKCk7XG59XG5cbkRPTUZyYWdtZW50LnByb3RvdHlwZS5ib290ID0gZnVuY3Rpb24gKCkge1xuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICB2YXIgbW9uaXRvcmluZyA9XG5cdHN1Yih0aGlzLmRvbVdyYXBGdW5jdGlvbihzZWxmLnNlbGVjdG9yLCBzZWxmLmZyYWdtZW50Q2xhc3MsIHNlbGYuZnJhZ21lbnRTcGVjKSwgMSwgMik7XG4gICAgV29ybGQuc3Bhd24obmV3IFdvcmxkKGZ1bmN0aW9uICgpIHtcblx0TWluaW1hcnQuSlF1ZXJ5LnNwYXduSlF1ZXJ5RHJpdmVyKHNlbGYuc2VsZWN0b3IrXCIgPiAuXCIrc2VsZi5mcmFnbWVudENsYXNzLFxuXHRcdFx0XHRcdCAgMSxcblx0XHRcdFx0XHQgIHNlbGYualF1ZXJ5V3JhcEZ1bmN0aW9uKTtcblx0V29ybGQuc3Bhd24oe1xuXHQgICAgaGFuZGxlRXZlbnQ6IGZ1bmN0aW9uIChlKSB7XG5cdFx0aWYgKGUudHlwZSA9PT0gXCJyb3V0ZXNcIikge1xuXHRcdCAgICB2YXIgbGV2ZWwgPSBlLmdlc3RhbHQuZ2V0TGV2ZWwoMSwgMCk7IC8vIGZpbmQgcGFydGljaXBhbnQgcGVlcnNcblx0XHQgICAgaWYgKCFlLmdlc3RhbHQuaXNFbXB0eSgpICYmIGxldmVsLmlzRW1wdHkoKSkge1xuXHRcdFx0V29ybGQuc2h1dGRvd25Xb3JsZCgpO1xuXHRcdCAgICB9XG5cdFx0fVxuXHQgICAgfVxuXHR9LCBbbW9uaXRvcmluZ10pO1xuICAgIH0pKTtcbn07XG5cbkRPTUZyYWdtZW50LnByb3RvdHlwZS5oYW5kbGVFdmVudCA9IGZ1bmN0aW9uIChlKSB7XG4gICAgaWYgKGUudHlwZSA9PT0gXCJyb3V0ZXNcIiAmJiBlLmdlc3RhbHQuaXNFbXB0eSgpKSB7XG5cdGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5ub2Rlcy5sZW5ndGg7IGkrKykge1xuXHQgICAgdmFyIG4gPSB0aGlzLm5vZGVzW2ldO1xuXHQgICAgbi5wYXJlbnROb2RlLnJlbW92ZUNoaWxkKG4pO1xuXHR9XG5cdFdvcmxkLmV4aXQoKTtcbiAgICB9XG59O1xuXG5mdW5jdGlvbiBpc0F0dHJpYnV0ZXMoeCkge1xuICAgIHJldHVybiBBcnJheS5pc0FycmF5KHgpICYmICgoeC5sZW5ndGggPT09IDApIHx8IEFycmF5LmlzQXJyYXkoeFswXSkpO1xufVxuXG5ET01GcmFnbWVudC5wcm90b3R5cGUuaW50ZXJwcmV0U3BlYyA9IGZ1bmN0aW9uIChzcGVjKSB7XG4gICAgLy8gRnJhZ21lbnQgc3BlY3MgYXJlIHJvdWdobHkgSlNPTi1lcXVpdmFsZW50cyBvZiBTWE1MLlxuICAgIC8vIHNwZWMgOjo9PSBbXCJ0YWdcIiwgW1tcImF0dHJcIiwgXCJ2YWx1ZVwiXSwgLi4uXSwgc3BlYywgc3BlYywgLi4uXVxuICAgIC8vICAgICAgICAgfCBbXCJ0YWdcIiwgc3BlYywgc3BlYywgLi4uXVxuICAgIC8vICAgICAgICAgfCBcImNkYXRhXCJcbiAgICBpZiAodHlwZW9mKHNwZWMpID09PSBcInN0cmluZ1wiIHx8IHR5cGVvZihzcGVjKSA9PT0gXCJudW1iZXJcIikge1xuXHRyZXR1cm4gZG9jdW1lbnQuY3JlYXRlVGV4dE5vZGUoc3BlYyk7XG4gICAgfSBlbHNlIGlmICgkLmlzQXJyYXkoc3BlYykpIHtcblx0dmFyIHRhZ05hbWUgPSBzcGVjWzBdO1xuXHR2YXIgaGFzQXR0cnMgPSBpc0F0dHJpYnV0ZXMoc3BlY1sxXSk7XG5cdHZhciBhdHRycyA9IGhhc0F0dHJzID8gc3BlY1sxXSA6IHt9O1xuXHR2YXIga2lkSW5kZXggPSBoYXNBdHRycyA/IDIgOiAxO1xuXG5cdC8vIFdvdyEgU3VjaCBYU1MhIE1hbnkgaGFja3MhIFNvIHZ1bG5lcmFiaWxpdHkhIEFtYXplIVxuXHR2YXIgbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQodGFnTmFtZSk7XG5cdGZvciAodmFyIGkgPSAwOyBpIDwgYXR0cnMubGVuZ3RoOyBpKyspIHtcblx0ICAgIG4uc2V0QXR0cmlidXRlKGF0dHJzW2ldWzBdLCBhdHRyc1tpXVsxXSk7XG5cdH1cblx0Zm9yICh2YXIgaSA9IGtpZEluZGV4OyBpIDwgc3BlYy5sZW5ndGg7IGkrKykge1xuXHQgICAgbi5hcHBlbmRDaGlsZCh0aGlzLmludGVycHJldFNwZWMoc3BlY1tpXSkpO1xuXHR9XG5cdHJldHVybiBuO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIklsbC1mb3JtZWQgRE9NIHNwZWNpZmljYXRpb25cIik7XG4gICAgfVxufTtcblxuRE9NRnJhZ21lbnQucHJvdG90eXBlLmJ1aWxkTm9kZXMgPSBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIHZhciBub2RlcyA9IFtdO1xuICAgICQoc2VsZi5zZWxlY3RvcikuZWFjaChmdW5jdGlvbiAoaW5kZXgsIGRvbU5vZGUpIHtcblx0dmFyIG4gPSBzZWxmLmludGVycHJldFNwZWMoc2VsZi5mcmFnbWVudFNwZWMpO1xuXHRuLmNsYXNzTGlzdC5hZGQoc2VsZi5mcmFnbWVudENsYXNzKTtcblx0ZG9tTm9kZS5hcHBlbmRDaGlsZChuKTtcblx0bm9kZXMucHVzaChuKTtcbiAgICB9KTtcbiAgICByZXR1cm4gbm9kZXM7XG59O1xuXG4vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cblxubW9kdWxlLmV4cG9ydHMuc3Bhd25ET01Ecml2ZXIgPSBzcGF3bkRPTURyaXZlcjtcbm1vZHVsZS5leHBvcnRzLmRlZmF1bHRXcmFwRnVuY3Rpb24gPSBkZWZhdWx0V3JhcEZ1bmN0aW9uO1xuIiwiLyogR3JvdW5kIGludGVyZmFjZSAqL1xudmFyIE1pbmltYXJ0ID0gcmVxdWlyZShcIi4vbWluaW1hcnQuanNcIik7XG52YXIgV29ybGQgPSBNaW5pbWFydC5Xb3JsZDtcblxuZnVuY3Rpb24gR3JvdW5kKGJvb3RGbikge1xuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICB0aGlzLnN0ZXBwZXJJZCA9IG51bGw7XG4gICAgV29ybGQud2l0aFdvcmxkU3RhY2soW1t0aGlzLCAtMV1dLCBmdW5jdGlvbiAoKSB7XG5cdHNlbGYud29ybGQgPSBuZXcgV29ybGQoYm9vdEZuKTtcbiAgICB9KTtcbn1cblxuR3JvdW5kLnByb3RvdHlwZS5zdGVwID0gZnVuY3Rpb24gKCkge1xuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICByZXR1cm4gV29ybGQud2l0aFdvcmxkU3RhY2soW1t0aGlzLCAtMV1dLCBmdW5jdGlvbiAoKSB7XG5cdHJldHVybiBzZWxmLndvcmxkLnN0ZXAoKTtcbiAgICB9KTtcbn07XG5cbkdyb3VuZC5wcm90b3R5cGUuY2hlY2tQaWQgPSBmdW5jdGlvbiAocGlkKSB7XG4gICAgaWYgKHBpZCAhPT0gLTEpIGNvbnNvbGUuZXJyb3IoXCJXZWlyZCBwaWQgaW4gR3JvdW5kIG1hcmtQaWRSdW5uYWJsZVwiLCBwaWQpO1xufTtcblxuR3JvdW5kLnByb3RvdHlwZS5tYXJrUGlkUnVubmFibGUgPSBmdW5jdGlvbiAocGlkKSB7XG4gICAgdGhpcy5jaGVja1BpZChwaWQpO1xuICAgIHRoaXMuc3RhcnRTdGVwcGluZygpO1xufTtcblxuR3JvdW5kLnByb3RvdHlwZS5zdGFydFN0ZXBwaW5nID0gZnVuY3Rpb24gKCkge1xuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICBpZiAodGhpcy5zdGVwcGVySWQpIHJldHVybjtcbiAgICBpZiAodGhpcy5zdGVwKCkpIHtcblx0dGhpcy5zdGVwcGVySWQgPSBzZXRUaW1lb3V0KGZ1bmN0aW9uICgpIHtcblx0ICAgIHNlbGYuc3RlcHBlcklkID0gbnVsbDtcblx0ICAgIHNlbGYuc3RhcnRTdGVwcGluZygpO1xuXHR9LCAwKTtcbiAgICB9XG59O1xuXG5Hcm91bmQucHJvdG90eXBlLnN0b3BTdGVwcGluZyA9IGZ1bmN0aW9uICgpIHtcbiAgICBpZiAodGhpcy5zdGVwcGVySWQpIHtcblx0Y2xlYXJUaW1lb3V0KHRoaXMuc3RlcHBlcklkKTtcblx0dGhpcy5zdGVwcGVySWQgPSBudWxsO1xuICAgIH1cbn07XG5cbkdyb3VuZC5wcm90b3R5cGUuZW5xdWV1ZUFjdGlvbiA9IGZ1bmN0aW9uIChwaWQsIGFjdGlvbikge1xuICAgIHRoaXMuY2hlY2tQaWQocGlkKTtcbiAgICBpZiAoYWN0aW9uLnR5cGUgPT09ICdyb3V0ZXMnKSB7XG5cdGlmICghYWN0aW9uLmdlc3RhbHQuaXNFbXB0eSgpKSB7XG5cdCAgICBjb25zb2xlLmVycm9yKFwiWW91IGhhdmUgc3Vic2NyaWJlZCB0byBhIG5vbmV4aXN0ZW50IGV2ZW50IHNvdXJjZS5cIixcblx0XHRcdCAgYWN0aW9uLmdlc3RhbHQucHJldHR5KCkpO1xuXHR9XG4gICAgfSBlbHNlIHtcblx0Y29uc29sZS5lcnJvcihcIllvdSBoYXZlIHNlbnQgYSBtZXNzYWdlIGludG8gdGhlIG91dGVyIHZvaWQuXCIsIGFjdGlvbik7XG4gICAgfVxufTtcblxuLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG5cbm1vZHVsZS5leHBvcnRzLkdyb3VuZCA9IEdyb3VuZDtcbiIsIi8vIEpRdWVyeSBldmVudCBkcml2ZXJcbnZhciBNaW5pbWFydCA9IHJlcXVpcmUoXCIuL21pbmltYXJ0LmpzXCIpO1xudmFyIFdvcmxkID0gTWluaW1hcnQuV29ybGQ7XG52YXIgc3ViID0gTWluaW1hcnQuc3ViO1xudmFyIHB1YiA9IE1pbmltYXJ0LnB1YjtcbnZhciBfXyA9IE1pbmltYXJ0Ll9fO1xudmFyIF8kID0gTWluaW1hcnQuXyQ7XG5cbmZ1bmN0aW9uIHNwYXduSlF1ZXJ5RHJpdmVyKGJhc2VTZWxlY3RvciwgbWV0YUxldmVsLCB3cmFwRnVuY3Rpb24pIHtcbiAgICBtZXRhTGV2ZWwgPSBtZXRhTGV2ZWwgfHwgMDtcbiAgICB3cmFwRnVuY3Rpb24gPSB3cmFwRnVuY3Rpb24gfHwgZGVmYXVsdFdyYXBGdW5jdGlvbjtcbiAgICB2YXIgZCA9IG5ldyBNaW5pbWFydC5EZW1hbmRNYXRjaGVyKHdyYXBGdW5jdGlvbihfJCwgXyQsIF9fKSwgbWV0YUxldmVsLFxuXHRcdFx0XHQgICAgICAge2RlbWFuZFNpZGVJc1N1YnNjcmlwdGlvbjogdHJ1ZX0pO1xuICAgIGQub25EZW1hbmRJbmNyZWFzZSA9IGZ1bmN0aW9uIChjYXB0dXJlcykge1xuXHR2YXIgc2VsZWN0b3IgPSBjYXB0dXJlc1swXTtcblx0dmFyIGV2ZW50TmFtZSA9IGNhcHR1cmVzWzFdO1xuXHRXb3JsZC5zcGF3bihuZXcgSlF1ZXJ5RXZlbnRSb3V0ZXIoYmFzZVNlbGVjdG9yLFxuXHRcdFx0XHRcdCAgc2VsZWN0b3IsXG5cdFx0XHRcdFx0ICBldmVudE5hbWUsXG5cdFx0XHRcdFx0ICBtZXRhTGV2ZWwsXG5cdFx0XHRcdFx0ICB3cmFwRnVuY3Rpb24pLFxuXHRcdCAgICBbcHViKHdyYXBGdW5jdGlvbihzZWxlY3RvciwgZXZlbnROYW1lLCBfXyksIG1ldGFMZXZlbCksXG5cdFx0ICAgICBwdWIod3JhcEZ1bmN0aW9uKHNlbGVjdG9yLCBldmVudE5hbWUsIF9fKSwgbWV0YUxldmVsLCAxKV0pO1xuICAgIH07XG4gICAgV29ybGQuc3Bhd24oZCk7XG59XG5cbmZ1bmN0aW9uIGRlZmF1bHRXcmFwRnVuY3Rpb24oc2VsZWN0b3IsIGV2ZW50TmFtZSwgZXZlbnRWYWx1ZSkge1xuICAgIHJldHVybiBbXCJqUXVlcnlcIiwgc2VsZWN0b3IsIGV2ZW50TmFtZSwgZXZlbnRWYWx1ZV07XG59XG5cbmZ1bmN0aW9uIEpRdWVyeUV2ZW50Um91dGVyKGJhc2VTZWxlY3Rvciwgc2VsZWN0b3IsIGV2ZW50TmFtZSwgbWV0YUxldmVsLCB3cmFwRnVuY3Rpb24pIHtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgdGhpcy5iYXNlU2VsZWN0b3IgPSBiYXNlU2VsZWN0b3IgfHwgbnVsbDtcbiAgICB0aGlzLnNlbGVjdG9yID0gc2VsZWN0b3I7XG4gICAgdGhpcy5ldmVudE5hbWUgPSBldmVudE5hbWU7XG4gICAgdGhpcy5tZXRhTGV2ZWwgPSBtZXRhTGV2ZWwgfHwgMDtcbiAgICB0aGlzLndyYXBGdW5jdGlvbiA9IHdyYXBGdW5jdGlvbiB8fCBkZWZhdWx0V3JhcEZ1bmN0aW9uO1xuICAgIHRoaXMucHJldmVudERlZmF1bHQgPSAodGhpcy5ldmVudE5hbWUuY2hhckF0KDApICE9PSBcIitcIik7XG4gICAgdGhpcy5oYW5kbGVyID1cblx0V29ybGQud3JhcChmdW5jdGlvbiAoZSkge1xuXHQgICAgV29ybGQuc2VuZChzZWxmLndyYXBGdW5jdGlvbihzZWxmLnNlbGVjdG9yLCBzZWxmLmV2ZW50TmFtZSwgZSksIHNlbGYubWV0YUxldmVsKTtcblx0ICAgIGlmIChzZWxmLnByZXZlbnREZWZhdWx0KSBlLnByZXZlbnREZWZhdWx0KCk7XG5cdCAgICByZXR1cm4gIXNlbGYucHJldmVudERlZmF1bHQ7XG5cdH0pO1xuICAgIHRoaXMuY29tcHV0ZU5vZGVzKCkub24odGhpcy5wcmV2ZW50RGVmYXVsdCA/IHRoaXMuZXZlbnROYW1lIDogdGhpcy5ldmVudE5hbWUuc3Vic3RyaW5nKDEpLFxuXHRcdFx0ICAgdGhpcy5oYW5kbGVyKTtcbn1cblxuSlF1ZXJ5RXZlbnRSb3V0ZXIucHJvdG90eXBlLmhhbmRsZUV2ZW50ID0gZnVuY3Rpb24gKGUpIHtcbiAgICBpZiAoZS50eXBlID09PSBcInJvdXRlc1wiICYmIGUuZ2VzdGFsdC5pc0VtcHR5KCkpIHtcblx0dGhpcy5jb21wdXRlTm9kZXMoKS5vZmYodGhpcy5ldmVudE5hbWUsIHRoaXMuaGFuZGxlcik7XG5cdFdvcmxkLmV4aXQoKTtcbiAgICB9XG59O1xuXG5KUXVlcnlFdmVudFJvdXRlci5wcm90b3R5cGUuY29tcHV0ZU5vZGVzID0gZnVuY3Rpb24gKCkge1xuICAgIGlmICh0aGlzLmJhc2VTZWxlY3Rvcikge1xuXHRyZXR1cm4gJCh0aGlzLmJhc2VTZWxlY3RvcikuY2hpbGRyZW4odGhpcy5zZWxlY3RvcikuYWRkQmFjayh0aGlzLnNlbGVjdG9yKTtcbiAgICB9IGVsc2Uge1xuXHRyZXR1cm4gJCh0aGlzLnNlbGVjdG9yKTtcbiAgICB9XG59O1xuXG5mdW5jdGlvbiBzaW1wbGlmeURPTUV2ZW50KGUpIHtcbiAgICB2YXIga2V5cyA9IFtdO1xuICAgIGZvciAodmFyIGsgaW4gZSkge1xuXHR2YXIgdiA9IGVba107XG5cdGlmICh0eXBlb2YgdiA9PT0gJ29iamVjdCcpIGNvbnRpbnVlO1xuXHRpZiAodHlwZW9mIHYgPT09ICdmdW5jdGlvbicpIGNvbnRpbnVlO1xuXHRrZXlzLnB1c2goayk7XG4gICAgfVxuICAgIGtleXMuc29ydCgpO1xuICAgIHZhciBzaW1wbGlmaWVkID0gW107XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBrZXlzLmxlbmd0aDsgaSsrKSB7XG5cdHNpbXBsaWZpZWQucHVzaChba2V5c1tpXSwgZVtrZXlzW2ldXV0pO1xuICAgIH1cbiAgICByZXR1cm4gc2ltcGxpZmllZDtcbn1cblxuLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG5cbm1vZHVsZS5leHBvcnRzLnNwYXduSlF1ZXJ5RHJpdmVyID0gc3Bhd25KUXVlcnlEcml2ZXI7XG5tb2R1bGUuZXhwb3J0cy5zaW1wbGlmeURPTUV2ZW50ID0gc2ltcGxpZnlET01FdmVudDtcbm1vZHVsZS5leHBvcnRzLmRlZmF1bHRXcmFwRnVuY3Rpb24gPSBkZWZhdWx0V3JhcEZ1bmN0aW9uO1xuIiwibW9kdWxlLmV4cG9ydHMgPSByZXF1aXJlKFwiLi9taW5pbWFydC5qc1wiKTtcblxubW9kdWxlLmV4cG9ydHMuRE9NID0gcmVxdWlyZShcIi4vZG9tLWRyaXZlci5qc1wiKTtcbm1vZHVsZS5leHBvcnRzLkpRdWVyeSA9IHJlcXVpcmUoXCIuL2pxdWVyeS1kcml2ZXIuanNcIik7XG5tb2R1bGUuZXhwb3J0cy5Sb3V0aW5nVGFibGVXaWRnZXQgPSByZXF1aXJlKFwiLi9yb3V0aW5nLXRhYmxlLXdpZGdldC5qc1wiKTtcbm1vZHVsZS5leHBvcnRzLldlYlNvY2tldCA9IHJlcXVpcmUoXCIuL3dlYnNvY2tldC1kcml2ZXIuanNcIik7XG5tb2R1bGUuZXhwb3J0cy5SZWZsZWN0ID0gcmVxdWlyZShcIi4vcmVmbGVjdC5qc1wiKTtcblxubW9kdWxlLmV4cG9ydHMuR3JvdW5kID0gcmVxdWlyZShcIi4vZ3JvdW5kLmpzXCIpLkdyb3VuZDtcbm1vZHVsZS5leHBvcnRzLkFjdG9yID0gcmVxdWlyZShcIi4vYWN0b3IuanNcIikuQWN0b3I7XG5tb2R1bGUuZXhwb3J0cy5TcHkgPSByZXF1aXJlKFwiLi9zcHkuanNcIikuU3B5O1xubW9kdWxlLmV4cG9ydHMuV2FrZURldGVjdG9yID0gcmVxdWlyZShcIi4vd2FrZS1kZXRlY3Rvci5qc1wiKS5XYWtlRGV0ZWN0b3I7XG5cbnZhciBXb3JrZXIgPSByZXF1aXJlKFwiLi93b3JrZXIuanNcIik7XG5tb2R1bGUuZXhwb3J0cy5Xb3JrZXIgPSBXb3JrZXIuV29ya2VyO1xubW9kdWxlLmV4cG9ydHMuV29ya2VyR3JvdW5kID0gV29ya2VyLldvcmtlckdyb3VuZDtcbiIsInZhciBSb3V0ZSA9IHJlcXVpcmUoXCIuL3JvdXRlLmpzXCIpO1xudmFyIFV0aWwgPSByZXF1aXJlKFwiLi91dGlsLmpzXCIpO1xuXG4vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cblxuLy8gVE9ETzogdHJpZ2dlci1ndWFyZHMgYXMgcGVyIG1pbmltYXJ0XG5cbi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cbi8qIEV2ZW50cyBhbmQgQWN0aW9ucyAqL1xuXG52YXIgX18gPSBSb3V0ZS5fXztcbnZhciBfJCA9IFJvdXRlLl8kO1xuXG5mdW5jdGlvbiBzdWIocGF0dGVybiwgbWV0YUxldmVsLCBsZXZlbCkge1xuICAgIHJldHVybiBSb3V0ZS5zaW1wbGVHZXN0YWx0KGZhbHNlLCBwYXR0ZXJuLCBtZXRhTGV2ZWwsIGxldmVsKTtcbn1cblxuZnVuY3Rpb24gcHViKHBhdHRlcm4sIG1ldGFMZXZlbCwgbGV2ZWwpIHtcbiAgICByZXR1cm4gUm91dGUuc2ltcGxlR2VzdGFsdCh0cnVlLCBwYXR0ZXJuLCBtZXRhTGV2ZWwsIGxldmVsKTtcbn1cblxuZnVuY3Rpb24gc3Bhd24oYmVoYXZpb3IsIGluaXRpYWxHZXN0YWx0cykge1xuICAgIHJldHVybiB7IHR5cGU6IFwic3Bhd25cIixcblx0ICAgICBiZWhhdmlvcjogYmVoYXZpb3IsXG5cdCAgICAgaW5pdGlhbEdlc3RhbHQ6IFJvdXRlLmdlc3RhbHRVbmlvbihpbml0aWFsR2VzdGFsdHMgfHwgW10pIH07XG59XG5cbmZ1bmN0aW9uIHVwZGF0ZVJvdXRlcyhnZXN0YWx0cykge1xuICAgIHJldHVybiB7IHR5cGU6IFwicm91dGVzXCIsIGdlc3RhbHQ6IFJvdXRlLmdlc3RhbHRVbmlvbihnZXN0YWx0cykgfTtcbn1cblxuZnVuY3Rpb24gcGVuZGluZ1JvdXRpbmdVcGRhdGUoYWdncmVnYXRlLCBhZmZlY3RlZFN1Ymdlc3RhbHQsIGtub3duVGFyZ2V0KSB7XG4gICAgcmV0dXJuIHsgdHlwZTogXCJwZW5kaW5nUm91dGluZ1VwZGF0ZVwiLFxuXHQgICAgIGFnZ3JlZ2F0ZTogYWdncmVnYXRlLFxuXHQgICAgIGFmZmVjdGVkU3ViZ2VzdGFsdDogYWZmZWN0ZWRTdWJnZXN0YWx0LFxuXHQgICAgIGtub3duVGFyZ2V0OiBrbm93blRhcmdldCB9O1xufVxuXG5mdW5jdGlvbiBzZW5kTWVzc2FnZShtLCBtZXRhTGV2ZWwsIGlzRmVlZGJhY2spIHtcbiAgICByZXR1cm4geyB0eXBlOiBcIm1lc3NhZ2VcIixcblx0ICAgICBtZXRhTGV2ZWw6IChtZXRhTGV2ZWwgPT09IHVuZGVmaW5lZCkgPyAwIDogbWV0YUxldmVsLFxuXHQgICAgIG1lc3NhZ2U6IG0sXG5cdCAgICAgaXNGZWVkYmFjazogKGlzRmVlZGJhY2sgPT09IHVuZGVmaW5lZCkgPyBmYWxzZSA6IGlzRmVlZGJhY2sgfTtcbn1cblxuZnVuY3Rpb24gc2h1dGRvd25Xb3JsZCgpIHtcbiAgICByZXR1cm4geyB0eXBlOiBcInNodXRkb3duV29ybGRcIiB9O1xufVxuXG4vKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG4vKiBDb25maWd1cmF0aW9ucyAqL1xuXG5mdW5jdGlvbiBXb3JsZChib290Rm4pIHtcbiAgICB0aGlzLmFsaXZlID0gdHJ1ZTtcbiAgICB0aGlzLmV2ZW50UXVldWUgPSBbXTtcbiAgICB0aGlzLnJ1bm5hYmxlUGlkcyA9IHt9O1xuICAgIHRoaXMucGFydGlhbEdlc3RhbHQgPSBSb3V0ZS5lbXB0eUdlc3RhbHQ7IC8vIE9ubHkgZ2VzdGFsdCBmcm9tIGxvY2FsIHByb2Nlc3Nlc1xuICAgIHRoaXMuZnVsbEdlc3RhbHQgPSBSb3V0ZS5lbXB0eUdlc3RhbHQgOzsgLy8gcGFydGlhbEdlc3RhbHQgdW5pb25lZCB3aXRoIGRvd253YXJkR2VzdGFsdFxuICAgIHRoaXMucHJvY2Vzc1RhYmxlID0ge307XG4gICAgdGhpcy50b21ic3RvbmVzID0ge307XG4gICAgdGhpcy5kb3dud2FyZEdlc3RhbHQgPSBSb3V0ZS5lbXB0eUdlc3RhbHQ7XG4gICAgdGhpcy5wcm9jZXNzQWN0aW9ucyA9IFtdO1xuICAgIHRoaXMuYXNDaGlsZCgtMSwgYm9vdEZuLCB0cnVlKTtcbn1cblxuLyogQ2xhc3Mgc3RhdGUgLyBtZXRob2RzICovXG5cbldvcmxkLm5leHRQaWQgPSAwO1xuXG5Xb3JsZC5zdGFjayA9IFtdO1xuXG5Xb3JsZC5jdXJyZW50ID0gZnVuY3Rpb24gKCkge1xuICAgIHJldHVybiBXb3JsZC5zdGFja1tXb3JsZC5zdGFjay5sZW5ndGggLSAxXVswXTtcbn07XG5cbldvcmxkLmFjdGl2ZVBpZCA9IGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4gV29ybGQuc3RhY2tbV29ybGQuc3RhY2subGVuZ3RoIC0gMV1bMV07XG59O1xuXG5Xb3JsZC5zZW5kID0gZnVuY3Rpb24gKG0sIG1ldGFMZXZlbCwgaXNGZWVkYmFjaykge1xuICAgIFdvcmxkLmN1cnJlbnQoKS5lbnF1ZXVlQWN0aW9uKFdvcmxkLmFjdGl2ZVBpZCgpLCBzZW5kTWVzc2FnZShtLCBtZXRhTGV2ZWwsIGlzRmVlZGJhY2spKTtcbn07XG5cbldvcmxkLnVwZGF0ZVJvdXRlcyA9IGZ1bmN0aW9uIChnZXN0YWx0cykge1xuICAgIFdvcmxkLmN1cnJlbnQoKS5lbnF1ZXVlQWN0aW9uKFdvcmxkLmFjdGl2ZVBpZCgpLCB1cGRhdGVSb3V0ZXMoZ2VzdGFsdHMpKTtcbn07XG5cbldvcmxkLnNwYXduID0gZnVuY3Rpb24gKGJlaGF2aW9yLCBpbml0aWFsR2VzdGFsdHMpIHtcbiAgICBXb3JsZC5jdXJyZW50KCkuZW5xdWV1ZUFjdGlvbihXb3JsZC5hY3RpdmVQaWQoKSwgc3Bhd24oYmVoYXZpb3IsIGluaXRpYWxHZXN0YWx0cykpO1xufTtcblxuV29ybGQuZXhpdCA9IGZ1bmN0aW9uIChleG4pIHtcbiAgICBXb3JsZC5jdXJyZW50KCkua2lsbChXb3JsZC5hY3RpdmVQaWQoKSwgZXhuKTtcbn07XG5cbldvcmxkLnNodXRkb3duV29ybGQgPSBmdW5jdGlvbiAoKSB7XG4gICAgV29ybGQuY3VycmVudCgpLmVucXVldWVBY3Rpb24oV29ybGQuYWN0aXZlUGlkKCksIHNodXRkb3duV29ybGQoKSk7XG59O1xuXG5Xb3JsZC53aXRoV29ybGRTdGFjayA9IGZ1bmN0aW9uIChzdGFjaywgZikge1xuICAgIHZhciBvbGRTdGFjayA9IFdvcmxkLnN0YWNrO1xuICAgIFdvcmxkLnN0YWNrID0gc3RhY2s7XG4gICAgdmFyIHJlc3VsdCA9IG51bGw7XG4gICAgdHJ5IHtcblx0cmVzdWx0ID0gZigpO1xuICAgIH0gY2F0Y2ggKGUpIHtcblx0V29ybGQuc3RhY2sgPSBvbGRTdGFjaztcblx0dGhyb3cgZTtcbiAgICB9XG4gICAgV29ybGQuc3RhY2sgPSBvbGRTdGFjaztcbiAgICByZXR1cm4gcmVzdWx0O1xufTtcblxuV29ybGQud3JhcCA9IGZ1bmN0aW9uIChmKSB7XG4gICAgdmFyIHNhdmVkU3RhY2sgPSBXb3JsZC5zdGFjay5zbGljZSgpO1xuICAgIHJldHVybiBmdW5jdGlvbiAoKSB7XG5cdHZhciBhY3R1YWxzID0gYXJndW1lbnRzO1xuXHRyZXR1cm4gV29ybGQud2l0aFdvcmxkU3RhY2soc2F2ZWRTdGFjaywgZnVuY3Rpb24gKCkge1xuXHQgICAgdmFyIHJlc3VsdCA9IFdvcmxkLmN1cnJlbnQoKS5hc0NoaWxkKFdvcmxkLmFjdGl2ZVBpZCgpLCBmdW5jdGlvbiAoKSB7XG5cdFx0cmV0dXJuIGYuYXBwbHkobnVsbCwgYWN0dWFscyk7XG5cdCAgICB9KTtcblx0ICAgIGZvciAodmFyIGkgPSBXb3JsZC5zdGFjay5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuXHRcdFdvcmxkLnN0YWNrW2ldWzBdLm1hcmtQaWRSdW5uYWJsZShXb3JsZC5zdGFja1tpXVsxXSk7XG5cdCAgICB9XG5cdCAgICByZXR1cm4gcmVzdWx0O1xuXHR9KTtcbiAgICB9O1xufTtcblxuLyogSW5zdGFuY2UgbWV0aG9kcyAqL1xuXG5Xb3JsZC5wcm90b3R5cGUuZW5xdWV1ZUFjdGlvbiA9IGZ1bmN0aW9uIChwaWQsIGFjdGlvbikge1xuICAgIHRoaXMucHJvY2Vzc0FjdGlvbnMucHVzaChbcGlkLCBhY3Rpb25dKTtcbn07XG5cbi8vIFRoZSBjb2RlIGlzIHdyaXR0ZW4gdG8gbWFpbnRhaW4gdGhlIHJ1bm5hYmxlUGlkcyBzZXQgY2FyZWZ1bGx5LCB0b1xuLy8gZW5zdXJlIHdlIGNhbiBsb2NhbGx5IGRlY2lkZSB3aGV0aGVyIHdlJ3JlIGluZXJ0IG9yIG5vdCB3aXRob3V0XG4vLyBoYXZpbmcgdG8gc2VhcmNoIHRoZSB3aG9sZSBkZWVwIHByb2Nlc3MgdHJlZS5cbldvcmxkLnByb3RvdHlwZS5pc0luZXJ0ID0gZnVuY3Rpb24gKCkge1xuICAgIHJldHVybiB0aGlzLmV2ZW50UXVldWUubGVuZ3RoID09PSAwXG5cdCYmIHRoaXMucHJvY2Vzc0FjdGlvbnMubGVuZ3RoID09PSAwXG5cdCYmIFJvdXRlLmlzX2VtcHR5U2V0KHRoaXMucnVubmFibGVQaWRzKTtcbn07XG5cbldvcmxkLnByb3RvdHlwZS5tYXJrUGlkUnVubmFibGUgPSBmdW5jdGlvbiAocGlkKSB7XG4gICAgdGhpcy5ydW5uYWJsZVBpZHNbcGlkXSA9IFtwaWRdO1xufTtcblxuV29ybGQucHJvdG90eXBlLnN0ZXAgPSBmdW5jdGlvbiAoKSB7XG4gICAgdGhpcy5kaXNwYXRjaEV2ZW50cygpO1xuICAgIHRoaXMucGVyZm9ybUFjdGlvbnMoKTtcbiAgICB0aGlzLnN0ZXBDaGlsZHJlbigpO1xuICAgIHJldHVybiB0aGlzLmFsaXZlICYmICF0aGlzLmlzSW5lcnQoKTtcbn07XG5cbldvcmxkLnByb3RvdHlwZS5hc0NoaWxkID0gZnVuY3Rpb24gKHBpZCwgZiwgb21pdExpdmVuZXNzQ2hlY2spIHtcbiAgICBpZiAoIShwaWQgaW4gdGhpcy5wcm9jZXNzVGFibGUpICYmICFvbWl0TGl2ZW5lc3NDaGVjaykge1xuXHRjb25zb2xlLndhcm4oXCJXb3JsZC5hc0NoaWxkIGVsaWRpbmcgaW52b2NhdGlvbiBvZiBkZWFkIHByb2Nlc3NcIiwgcGlkKTtcblx0cmV0dXJuO1xuICAgIH1cblxuICAgIFdvcmxkLnN0YWNrLnB1c2goW3RoaXMsIHBpZF0pO1xuICAgIHZhciByZXN1bHQgPSBudWxsO1xuICAgIHRyeSB7XG5cdHJlc3VsdCA9IGYoKTtcbiAgICB9IGNhdGNoIChlKSB7XG5cdHRoaXMua2lsbChwaWQsIGUpO1xuICAgIH1cbiAgICBpZiAoV29ybGQuc3RhY2sucG9wKClbMF0gIT09IHRoaXMpIHtcblx0dGhyb3cgbmV3IEVycm9yKFwiSW50ZXJuYWwgZXJyb3I6IFdvcmxkIHN0YWNrIGltYmFsYW5jZVwiKTtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbn07XG5cbldvcmxkLnByb3RvdHlwZS5raWxsID0gZnVuY3Rpb24gKHBpZCwgZXhuKSB7XG4gICAgaWYgKGV4biAmJiBleG4uc3RhY2spIHtcblx0Y29uc29sZS5sb2coXCJQcm9jZXNzIGV4aXRlZFwiLCBwaWQsIGV4biwgZXhuLnN0YWNrKTtcbiAgICB9IGVsc2Uge1xuXHRjb25zb2xlLmxvZyhcIlByb2Nlc3MgZXhpdGVkXCIsIHBpZCwgZXhuKTtcbiAgICB9XG4gICAgdmFyIHAgPSB0aGlzLnByb2Nlc3NUYWJsZVtwaWRdO1xuICAgIGlmIChwICYmIHAuYmVoYXZpb3IudHJhcGV4aXQpIHtcblx0dGhpcy5hc0NoaWxkKHBpZCwgZnVuY3Rpb24gKCkgeyByZXR1cm4gcC5iZWhhdmlvci50cmFwZXhpdChleG4pOyB9KTtcbiAgICB9XG4gICAgZGVsZXRlIHRoaXMucHJvY2Vzc1RhYmxlW3BpZF07XG4gICAgaWYgKHApIHtcblx0aWYgKGV4bikge1xuXHQgICAgcC5leGl0UmVhc29uID0gZXhuO1xuXHQgICAgdGhpcy50b21ic3RvbmVzW3BpZF0gPSBwO1xuXHR9XG5cdHRoaXMuYXBwbHlBbmRJc3N1ZVJvdXRpbmdVcGRhdGUocC5nZXN0YWx0LCBSb3V0ZS5lbXB0eUdlc3RhbHQpO1xuICAgIH1cbn07XG5cbldvcmxkLnByb3RvdHlwZS5zdGVwQ2hpbGRyZW4gPSBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIHBpZHMgPSB0aGlzLnJ1bm5hYmxlUGlkcztcbiAgICB0aGlzLnJ1bm5hYmxlUGlkcyA9IHt9O1xuICAgIGZvciAodmFyIHBpZCBpbiBwaWRzKSB7XG5cdHZhciBwID0gdGhpcy5wcm9jZXNzVGFibGVbcGlkXTtcblx0aWYgKHAgJiYgcC5iZWhhdmlvci5zdGVwIC8qIGV4aXN0cywgaGF2ZW4ndCBjYWxsZWQgaXQgeWV0ICovKSB7XG5cdCAgICB2YXIgY2hpbGRCdXN5ID0gdGhpcy5hc0NoaWxkKHBpZCB8IDAsIGZ1bmN0aW9uICgpIHsgcmV0dXJuIHAuYmVoYXZpb3Iuc3RlcCgpIH0pO1xuXHQgICAgaWYgKGNoaWxkQnVzeSkgdGhpcy5tYXJrUGlkUnVubmFibGUocGlkKTtcblx0fVxuICAgIH1cbn07XG5cbldvcmxkLnByb3RvdHlwZS5wZXJmb3JtQWN0aW9ucyA9IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgcXVldWUgPSB0aGlzLnByb2Nlc3NBY3Rpb25zO1xuICAgIHRoaXMucHJvY2Vzc0FjdGlvbnMgPSBbXTtcbiAgICB2YXIgaXRlbTtcbiAgICB3aGlsZSAoKGl0ZW0gPSBxdWV1ZS5zaGlmdCgpKSAmJiB0aGlzLmFsaXZlKSB7XG5cdHRoaXMucGVyZm9ybUFjdGlvbihpdGVtWzBdLCBpdGVtWzFdKTtcbiAgICB9XG59O1xuXG5Xb3JsZC5wcm90b3R5cGUuZGlzcGF0Y2hFdmVudHMgPSBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIHF1ZXVlID0gdGhpcy5ldmVudFF1ZXVlO1xuICAgIHRoaXMuZXZlbnRRdWV1ZSA9IFtdO1xuICAgIHZhciBpdGVtO1xuICAgIHdoaWxlICgoaXRlbSA9IHF1ZXVlLnNoaWZ0KCkpKSB7XG5cdHRoaXMuZGlzcGF0Y2hFdmVudChpdGVtKTtcbiAgICB9XG59O1xuXG5Xb3JsZC5wcm90b3R5cGUucGVyZm9ybUFjdGlvbiA9IGZ1bmN0aW9uIChwaWQsIGFjdGlvbikge1xuICAgIHN3aXRjaCAoYWN0aW9uLnR5cGUpIHtcbiAgICBjYXNlIFwic3Bhd25cIjpcblx0dmFyIHBpZCA9IFdvcmxkLm5leHRQaWQrKztcblx0dmFyIG5ld0dlc3RhbHQgPSBhY3Rpb24uaW5pdGlhbEdlc3RhbHQubGFiZWwocGlkKTtcblx0dGhpcy5wcm9jZXNzVGFibGVbcGlkXSA9IHsgZ2VzdGFsdDogbmV3R2VzdGFsdCwgYmVoYXZpb3I6IGFjdGlvbi5iZWhhdmlvciB9O1xuXHRpZiAoYWN0aW9uLmJlaGF2aW9yLmJvb3QpIHtcblx0ICAgIHRoaXMuYXNDaGlsZChwaWQsIGZ1bmN0aW9uICgpIHsgYWN0aW9uLmJlaGF2aW9yLmJvb3QoKSB9KTtcblx0ICAgIHRoaXMubWFya1BpZFJ1bm5hYmxlKHBpZCk7XG5cdH1cblx0dGhpcy5hcHBseUFuZElzc3VlUm91dGluZ1VwZGF0ZShSb3V0ZS5lbXB0eUdlc3RhbHQsIG5ld0dlc3RhbHQsIHBpZCk7XG5cdGJyZWFrO1xuICAgIGNhc2UgXCJyb3V0ZXNcIjpcblx0aWYgKHBpZCBpbiB0aGlzLnByb2Nlc3NUYWJsZSkge1xuXHQgICAgLy8gaXQgbWF5IG5vdCBiZTogdGhpcyBtaWdodCBiZSB0aGUgcm91dGluZyB1cGRhdGUgZnJvbSBhXG5cdCAgICAvLyBraWxsIG9mIHRoZSBwcm9jZXNzXG5cdCAgICB2YXIgb2xkR2VzdGFsdCA9IHRoaXMucHJvY2Vzc1RhYmxlW3BpZF0uZ2VzdGFsdDtcblx0ICAgIHZhciBuZXdHZXN0YWx0ID0gYWN0aW9uLmdlc3RhbHQubGFiZWwocGlkfDApO1xuXHQgICAgLy8gXiBwaWR8MDogY29udmVydCBwaWQgZnJvbSBzdHJpbmcgKHRhYmxlIGtleSEpIHRvIGludGVnZXJcblx0ICAgIHRoaXMucHJvY2Vzc1RhYmxlW3BpZF0uZ2VzdGFsdCA9IG5ld0dlc3RhbHQ7XG5cdCAgICB0aGlzLmFwcGx5QW5kSXNzdWVSb3V0aW5nVXBkYXRlKG9sZEdlc3RhbHQsIG5ld0dlc3RhbHQsIHBpZCk7XG5cdH1cblx0YnJlYWs7XG4gICAgY2FzZSBcIm1lc3NhZ2VcIjpcblx0aWYgKGFjdGlvbi5tZXRhTGV2ZWwgPT09IDApIHtcblx0ICAgIHRoaXMuZXZlbnRRdWV1ZS5wdXNoKGFjdGlvbik7XG5cdH0gZWxzZSB7XG5cdCAgICBXb3JsZC5zZW5kKGFjdGlvbi5tZXNzYWdlLCBhY3Rpb24ubWV0YUxldmVsIC0gMSwgYWN0aW9uLmlzRmVlZGJhY2spO1xuXHR9XG5cdGJyZWFrO1xuICAgIGNhc2UgXCJzaHV0ZG93bldvcmxkXCI6XG5cdHRoaXMuYWxpdmUgPSBmYWxzZTsgLy8gZm9yY2UgdXMgdG8gc3RvcCBkb2luZyB0aGluZ3MgaW1tZWRpYXRlbHlcblx0V29ybGQuZXhpdCgpO1xuXHRicmVhaztcbiAgICBkZWZhdWx0OlxuXHR2YXIgZXhuID0gbmV3IEVycm9yKFwiQWN0aW9uIHR5cGUgXCIgKyBhY3Rpb24udHlwZSArIFwiIG5vdCB1bmRlcnN0b29kXCIpO1xuXHRleG4uYWN0aW9uID0gYWN0aW9uO1xuXHR0aHJvdyBleG47XG4gICAgfVxufTtcblxuV29ybGQucHJvdG90eXBlLnVwZGF0ZUZ1bGxHZXN0YWx0ID0gZnVuY3Rpb24gKCkge1xuICAgIHRoaXMuZnVsbEdlc3RhbHQgPSB0aGlzLnBhcnRpYWxHZXN0YWx0LnVuaW9uKHRoaXMuZG93bndhcmRHZXN0YWx0KTtcbn07XG5cbldvcmxkLnByb3RvdHlwZS5pc3N1ZUxvY2FsUm91dGluZ1VwZGF0ZSA9IGZ1bmN0aW9uIChhZmZlY3RlZFN1Ymdlc3RhbHQsIGtub3duVGFyZ2V0KSB7XG4gICAgdGhpcy5ldmVudFF1ZXVlLnB1c2gocGVuZGluZ1JvdXRpbmdVcGRhdGUodGhpcy5mdWxsR2VzdGFsdCxcblx0XHRcdFx0XHQgICAgICBhZmZlY3RlZFN1Ymdlc3RhbHQsXG5cdFx0XHRcdFx0ICAgICAga25vd25UYXJnZXQpKTtcbn07XG5cbldvcmxkLnByb3RvdHlwZS5hcHBseUFuZElzc3VlUm91dGluZ1VwZGF0ZSA9IGZ1bmN0aW9uIChvbGRnLCBuZXdnLCBrbm93blRhcmdldCkge1xuICAgIGtub3duVGFyZ2V0ID0gdHlwZW9mIGtub3duVGFyZ2V0ID09PSAndW5kZWZpbmVkJyA/IG51bGwgOiBrbm93blRhcmdldDtcbiAgICB0aGlzLnBhcnRpYWxHZXN0YWx0ID0gdGhpcy5wYXJ0aWFsR2VzdGFsdC5lcmFzZVBhdGgob2xkZykudW5pb24obmV3Zyk7XG4gICAgdGhpcy51cGRhdGVGdWxsR2VzdGFsdCgpO1xuICAgIHRoaXMuaXNzdWVMb2NhbFJvdXRpbmdVcGRhdGUob2xkZy51bmlvbihuZXdnKSwga25vd25UYXJnZXQpO1xuICAgIFdvcmxkLnVwZGF0ZVJvdXRlcyhbdGhpcy5wYXJ0aWFsR2VzdGFsdC5kcm9wKCldKTtcbn07XG5cbldvcmxkLnByb3RvdHlwZS5kaXNwYXRjaEV2ZW50ID0gZnVuY3Rpb24gKGUpIHtcbiAgICBzd2l0Y2ggKGUudHlwZSkge1xuICAgIGNhc2UgXCJwZW5kaW5nUm91dGluZ1VwZGF0ZVwiOlxuXHR2YXIgcGlkcyA9IGUuYWZmZWN0ZWRTdWJnZXN0YWx0Lm1hdGNoKGUuYWdncmVnYXRlKTtcblx0aWYgKGUua25vd25UYXJnZXQgIT09IG51bGwpIHBpZHMudW5zaGlmdChlLmtub3duVGFyZ2V0KTtcblx0Zm9yICh2YXIgaSA9IDA7IGkgPCBwaWRzLmxlbmd0aDsgaSsrKSB7XG5cdCAgICB2YXIgcGlkID0gcGlkc1tpXTtcblx0ICAgIGlmIChwaWQgPT09IFwib3V0XCIpIGNvbnNvbGUud2FybihcIldvdWxkIGhhdmUgZGVsaXZlcmVkIGEgcm91dGluZyB1cGRhdGUgdG8gZW52aXJvbm1lbnRcIik7XG5cdCAgICB2YXIgcCA9IHRoaXMucHJvY2Vzc1RhYmxlW3BpZF07XG5cdCAgICBpZiAocCkge1xuXHRcdHZhciBnID0gZS5hZ2dyZWdhdGUuZmlsdGVyKHAuZ2VzdGFsdCk7XG5cdFx0dGhpcy5hc0NoaWxkKHBpZCwgZnVuY3Rpb24gKCkgeyBwLmJlaGF2aW9yLmhhbmRsZUV2ZW50KHVwZGF0ZVJvdXRlcyhbZ10pKSB9KTtcblx0XHR0aGlzLm1hcmtQaWRSdW5uYWJsZShwaWQpO1xuXHQgICAgfVxuXHR9XG5cdGJyZWFrO1xuXG4gICAgY2FzZSBcIm1lc3NhZ2VcIjpcblx0dmFyIHBpZHMgPSB0aGlzLnBhcnRpYWxHZXN0YWx0Lm1hdGNoVmFsdWUoZS5tZXNzYWdlLCBlLm1ldGFMZXZlbCwgZS5pc0ZlZWRiYWNrKTtcblx0Zm9yICh2YXIgaSA9IDA7IGkgPCBwaWRzLmxlbmd0aDsgaSsrKSB7XG5cdCAgICB2YXIgcGlkID0gcGlkc1tpXTtcblx0ICAgIHZhciBwID0gdGhpcy5wcm9jZXNzVGFibGVbcGlkXTtcblx0ICAgIHRoaXMuYXNDaGlsZChwaWQsIGZ1bmN0aW9uICgpIHsgcC5iZWhhdmlvci5oYW5kbGVFdmVudChlKSB9KTtcblx0ICAgIHRoaXMubWFya1BpZFJ1bm5hYmxlKHBpZCk7XG5cdH1cblx0YnJlYWs7XG5cbiAgICBkZWZhdWx0OlxuXHR2YXIgZXhuID0gbmV3IEVycm9yKFwiRXZlbnQgdHlwZSBcIiArIGUudHlwZSArIFwiIG5vdCBkaXNwYXRjaGFibGVcIik7XG5cdGV4bi5ldmVudCA9IGU7XG5cdHRocm93IGV4bjtcbiAgICB9XG59O1xuXG5Xb3JsZC5wcm90b3R5cGUuaGFuZGxlRXZlbnQgPSBmdW5jdGlvbiAoZSkge1xuICAgIHN3aXRjaCAoZS50eXBlKSB7XG4gICAgY2FzZSBcInJvdXRlc1wiOlxuXHR2YXIgb2xkRG93bndhcmQgPSB0aGlzLmRvd253YXJkR2VzdGFsdDtcblx0dGhpcy5kb3dud2FyZEdlc3RhbHQgPSBlLmdlc3RhbHQubGFiZWwoXCJvdXRcIikubGlmdCgpO1xuXHR0aGlzLnVwZGF0ZUZ1bGxHZXN0YWx0KCk7XG5cdHRoaXMuaXNzdWVMb2NhbFJvdXRpbmdVcGRhdGUob2xkRG93bndhcmQudW5pb24odGhpcy5kb3dud2FyZEdlc3RhbHQpLCBudWxsKTtcblx0YnJlYWs7XG4gICAgY2FzZSBcIm1lc3NhZ2VcIjpcblx0dGhpcy5ldmVudFF1ZXVlLnB1c2goc2VuZE1lc3NhZ2UoZS5tZXNzYWdlLCBlLm1ldGFMZXZlbCArIDEsIGUuaXNGZWVkYmFjaykpO1xuXHRicmVhaztcbiAgICBkZWZhdWx0OlxuXHR2YXIgZXhuID0gbmV3IEVycm9yKFwiRXZlbnQgdHlwZSBcIiArIGUudHlwZSArIFwiIG5vdCB1bmRlcnN0b29kXCIpO1xuXHRleG4uZXZlbnQgPSBlO1xuXHR0aHJvdyBleG47XG4gICAgfVxufTtcblxuLyogRGVidWdnaW5nLCBtYW5hZ2VtZW50LCBhbmQgbW9uaXRvcmluZyAqL1xuXG5Xb3JsZC5wcm90b3R5cGUucHJvY2Vzc1RyZWUgPSBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIGtpZHMgPSBbXTtcbiAgICBmb3IgKHZhciBwaWQgaW4gdGhpcy5wcm9jZXNzVGFibGUpIHtcblx0dmFyIHAgPSB0aGlzLnByb2Nlc3NUYWJsZVtwaWRdO1xuXHRpZiAocC5iZWhhdmlvciBpbnN0YW5jZW9mIFdvcmxkKSB7XG5cdCAgICBraWRzLnB1c2goW3BpZCwgcC5iZWhhdmlvci5wcm9jZXNzVHJlZSgpXSk7XG5cdH0gZWxzZSB7XG5cdCAgICBraWRzLnB1c2goW3BpZCwgcF0pO1xuXHR9XG4gICAgfVxuICAgIGZvciAodmFyIHBpZCBpbiB0aGlzLnRvbWJzdG9uZXMpIHtcblx0a2lkcy5wdXNoKFtwaWQsIHRoaXMudG9tYnN0b25lc1twaWRdXSk7XG4gICAgfVxuICAgIGtpZHMuc29ydChmdW5jdGlvbiAoYSwgYikgeyByZXR1cm4gYVswXSAtIGJbMF0gfSk7XG4gICAgcmV0dXJuIGtpZHM7XG59O1xuXG5Xb3JsZC5wcm90b3R5cGUudGV4dFByb2Nlc3NUcmVlID0gZnVuY3Rpb24gKG93blBpZCkge1xuICAgIHZhciBsaW5lcyA9IFtdO1xuXG4gICAgZnVuY3Rpb24gZHVtcFByb2Nlc3MocHJlZml4LCBwaWQsIHApIHtcblx0aWYgKEFycmF5LmlzQXJyYXkocCkpIHtcblx0ICAgIGxpbmVzLnB1c2gocHJlZml4ICsgJy0tKyAnICsgcGlkKTtcblx0ICAgIGZvciAodmFyIGkgPSAwOyBpIDwgcC5sZW5ndGg7IGkrKykge1xuXHRcdGR1bXBQcm9jZXNzKHByZWZpeCArICcgIHwnLCBwW2ldWzBdLCBwW2ldWzFdKTtcblx0ICAgIH1cblx0ICAgIGxpbmVzLnB1c2gocHJlZml4KTtcblx0fSBlbHNlIHtcblx0ICAgIHZhciBsYWJlbCA9IHAuYmVoYXZpb3IubmFtZSB8fCBwLmJlaGF2aW9yLmNvbnN0cnVjdG9yLm5hbWUgfHwgJyc7XG5cdCAgICB2YXIgdG9tYnN0b25lU3RyaW5nID0gcC5leGl0UmVhc29uID8gJyAoRVhJVEVEOiAnICsgcC5leGl0UmVhc29uICsgJykgJyA6ICcnO1xuXHQgICAgdmFyIHN0cmluZ2lmaWVkU3RhdGU7XG5cdCAgICB0cnkge1xuXHQgICAgICB2YXIgcmF3U3RhdGUgPSBwLmJlaGF2aW9yLmRlYnVnU3RhdGUgPyBwLmJlaGF2aW9yLmRlYnVnU3RhdGUoKSA6IHAuYmVoYXZpb3I7XG5cdCAgICAgIHN0cmluZ2lmaWVkU3RhdGUgPSBKU09OLnN0cmluZ2lmeShyYXdTdGF0ZSwgZnVuY3Rpb24gKGssIHYpIHtcblx0XHRyZXR1cm4gKGsgPT09ICduYW1lJykgPyB1bmRlZmluZWQgOiB2O1xuXHQgICAgICB9KTtcblx0ICAgIH0gY2F0Y2ggKGUpIHtcblx0ICAgICAgc3RyaW5naWZpZWRTdGF0ZSA9IFwiKGNhbm5vdCBjb252ZXJ0IHByb2Nlc3Mgc3RhdGUgdG8gSlNPTilcIjtcblx0ICAgIH1cblx0ICAgIGxpbmVzLnB1c2gocHJlZml4ICsgJy0tICcgKyBwaWQgKyAnOiAnICsgbGFiZWwgKyB0b21ic3RvbmVTdHJpbmcgKyBzdHJpbmdpZmllZFN0YXRlKTtcblx0fVxuICAgIH1cblxuICAgIGR1bXBQcm9jZXNzKCcnLCBvd25QaWQgfHwgJycsIHRoaXMucHJvY2Vzc1RyZWUoKSk7XG4gICAgcmV0dXJuIGxpbmVzLmpvaW4oJ1xcbicpO1xufTtcblxuV29ybGQucHJvdG90eXBlLmNsZWFyVG9tYnN0b25lcyA9IGZ1bmN0aW9uICgpIHtcbiAgICB0aGlzLnRvbWJzdG9uZXMgPSB7fTtcbiAgICBmb3IgKHZhciBwaWQgaW4gdGhpcy5wcm9jZXNzVGFibGUpIHtcblx0dmFyIHAgPSB0aGlzLnByb2Nlc3NUYWJsZVtwaWRdO1xuXHRpZiAocC5iZWhhdmlvciBpbnN0YW5jZW9mIFdvcmxkKSB7XG5cdCAgICBwLmJlaGF2aW9yLmNsZWFyVG9tYnN0b25lcygpO1xuXHR9XG4gICAgfVxufTtcblxuLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuLyogVXRpbGl0aWVzOiBtYXRjaGluZyBkZW1hbmQgZm9yIHNvbWUgc2VydmljZSAqL1xuXG5mdW5jdGlvbiBEZW1hbmRNYXRjaGVyKHByb2plY3Rpb24sIG1ldGFMZXZlbCwgb3B0aW9ucykge1xuICAgIG9wdGlvbnMgPSBVdGlsLmV4dGVuZCh7XG5cdGRlbWFuZExldmVsOiAwLFxuXHRzdXBwbHlMZXZlbDogMCxcblx0ZGVtYW5kU2lkZUlzU3Vic2NyaXB0aW9uOiBmYWxzZSxcblx0c3VwcGx5UHJvamVjdGlvbjogcHJvamVjdGlvblxuICAgIH0sIG9wdGlvbnMpO1xuICAgIHRoaXMuZGVtYW5kUGF0dGVybiA9IFJvdXRlLnByb2plY3Rpb25Ub1BhdHRlcm4ocHJvamVjdGlvbik7XG4gICAgdGhpcy5zdXBwbHlQYXR0ZXJuID0gUm91dGUucHJvamVjdGlvblRvUGF0dGVybihvcHRpb25zLnN1cHBseVByb2plY3Rpb24pO1xuICAgIHRoaXMuZGVtYW5kUHJvamVjdGlvblNwZWMgPSBSb3V0ZS5jb21waWxlUHJvamVjdGlvbihwcm9qZWN0aW9uKTtcbiAgICB0aGlzLnN1cHBseVByb2plY3Rpb25TcGVjID0gUm91dGUuY29tcGlsZVByb2plY3Rpb24ob3B0aW9ucy5zdXBwbHlQcm9qZWN0aW9uKTtcbiAgICB0aGlzLm1ldGFMZXZlbCA9IG1ldGFMZXZlbCB8IDA7XG4gICAgdGhpcy5kZW1hbmRMZXZlbCA9IG9wdGlvbnMuZGVtYW5kTGV2ZWw7XG4gICAgdGhpcy5zdXBwbHlMZXZlbCA9IG9wdGlvbnMuc3VwcGx5TGV2ZWw7XG4gICAgdGhpcy5kZW1hbmRTaWRlSXNTdWJzY3JpcHRpb24gPSBvcHRpb25zLmRlbWFuZFNpZGVJc1N1YnNjcmlwdGlvbjtcbiAgICB0aGlzLm9uRGVtYW5kSW5jcmVhc2UgPSBmdW5jdGlvbiAoY2FwdHVyZXMpIHtcblx0Y29uc29sZS5lcnJvcihcIlVuaGFuZGxlZCBpbmNyZWFzZSBpbiBkZW1hbmQgZm9yIHJvdXRlXCIsIGNhcHR1cmVzKTtcbiAgICB9O1xuICAgIHRoaXMub25TdXBwbHlEZWNyZWFzZSA9IGZ1bmN0aW9uIChjYXB0dXJlcykge1xuXHRjb25zb2xlLmVycm9yKFwiVW5oYW5kbGVkIGRlY3JlYXNlIGluIHN1cHBseSBmb3Igcm91dGVcIiwgY2FwdHVyZXMpO1xuICAgIH07XG4gICAgdGhpcy5jdXJyZW50RGVtYW5kID0ge307XG4gICAgdGhpcy5jdXJyZW50U3VwcGx5ID0ge307XG59XG5cbkRlbWFuZE1hdGNoZXIucHJvdG90eXBlLmRlYnVnU3RhdGUgPSBmdW5jdGlvbiAoKSB7XG4gIHJldHVybiB7XG4gICAgZGVtYW5kUGF0dGVybjogdGhpcy5kZW1hbmRQYXR0ZXJuLFxuICAgIHN1cHBseVBhdHRlcm46IHRoaXMuc3VwcGx5UGF0dGVybixcbiAgICBtZXRhTGV2ZWw6IHRoaXMubWV0YUxldmVsLFxuICAgIGRlbWFuZExldmVsOiB0aGlzLmRlbWFuZExldmVsLFxuICAgIHN1cHBseUxldmVsOiB0aGlzLnN1cHBseUxldmVsLFxuICAgIGRlbWFuZFNpZGVJc1N1YnNjcmlwdGlvbjogdGhpcy5kZW1hbmRTaWRlSXNTdWJzY3JpcHRpb25cblxuICAgIC8vICwgY3VycmVudERlbWFuZDogdGhpcy5jdXJyZW50RGVtYW5kXG4gICAgLy8gLCBjdXJyZW50U3VwcGx5OiB0aGlzLmN1cnJlbnRTdXBwbHlcbiAgfTtcbn07XG5cbkRlbWFuZE1hdGNoZXIucHJvdG90eXBlLmJvb3QgPSBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIG9ic2VydmVyTGV2ZWwgPSAxICsgTWF0aC5tYXgodGhpcy5kZW1hbmRMZXZlbCwgdGhpcy5zdXBwbHlMZXZlbCk7XG4gICAgV29ybGQudXBkYXRlUm91dGVzKFtzdWIodGhpcy5kZW1hbmRQYXR0ZXJuLCB0aGlzLm1ldGFMZXZlbCwgb2JzZXJ2ZXJMZXZlbCksXG5cdFx0XHRwdWIodGhpcy5zdXBwbHlQYXR0ZXJuLCB0aGlzLm1ldGFMZXZlbCwgb2JzZXJ2ZXJMZXZlbCldKTtcbn07XG5cbkRlbWFuZE1hdGNoZXIucHJvdG90eXBlLmhhbmRsZUV2ZW50ID0gZnVuY3Rpb24gKGUpIHtcbiAgICBpZiAoZS50eXBlID09PSBcInJvdXRlc1wiKSB7XG5cdHRoaXMuaGFuZGxlR2VzdGFsdChlLmdlc3RhbHQpO1xuICAgIH1cbn07XG5cbkRlbWFuZE1hdGNoZXIucHJvdG90eXBlLmhhbmRsZUdlc3RhbHQgPSBmdW5jdGlvbiAoZ2VzdGFsdCkge1xuICAgIHZhciBuZXdEZW1hbmRNYXRjaGVyID0gZ2VzdGFsdC5wcm9qZWN0KHRoaXMuZGVtYW5kUHJvamVjdGlvblNwZWMsXG5cdFx0XHRcdFx0ICAgIXRoaXMuZGVtYW5kU2lkZUlzU3Vic2NyaXB0aW9uLFxuXHRcdFx0XHRcdCAgIHRoaXMubWV0YUxldmVsLFxuXHRcdFx0XHRcdCAgIHRoaXMuZGVtYW5kTGV2ZWwpO1xuICAgIHZhciBuZXdTdXBwbHlNYXRjaGVyID0gZ2VzdGFsdC5wcm9qZWN0KHRoaXMuc3VwcGx5UHJvamVjdGlvblNwZWMsXG5cdFx0XHRcdFx0ICAgdGhpcy5kZW1hbmRTaWRlSXNTdWJzY3JpcHRpb24sXG5cdFx0XHRcdFx0ICAgdGhpcy5tZXRhTGV2ZWwsXG5cdFx0XHRcdFx0ICAgdGhpcy5zdXBwbHlMZXZlbCk7XG4gICAgdmFyIG5ld0RlbWFuZCA9IFJvdXRlLmFycmF5VG9TZXQoUm91dGUubWF0Y2hlcktleXMobmV3RGVtYW5kTWF0Y2hlcikpO1xuICAgIHZhciBuZXdTdXBwbHkgPSBSb3V0ZS5hcnJheVRvU2V0KFJvdXRlLm1hdGNoZXJLZXlzKG5ld1N1cHBseU1hdGNoZXIpKTtcbiAgICB2YXIgZGVtYW5kRGVsdGEgPSBSb3V0ZS5zZXRTdWJ0cmFjdChuZXdEZW1hbmQsIHRoaXMuY3VycmVudERlbWFuZCk7XG4gICAgdmFyIHN1cHBseURlbHRhID0gUm91dGUuc2V0U3VidHJhY3QodGhpcy5jdXJyZW50U3VwcGx5LCBuZXdTdXBwbHkpO1xuICAgIHZhciBkZW1hbmRJbmNyID0gUm91dGUuc2V0U3VidHJhY3QoZGVtYW5kRGVsdGEsIG5ld1N1cHBseSk7XG4gICAgdmFyIHN1cHBseURlY3IgPSBSb3V0ZS5zZXRJbnRlcnNlY3Qoc3VwcGx5RGVsdGEsIG5ld0RlbWFuZCk7XG4gICAgdGhpcy5jdXJyZW50RGVtYW5kID0gbmV3RGVtYW5kO1xuICAgIHRoaXMuY3VycmVudFN1cHBseSA9IG5ld1N1cHBseTtcbiAgICBmb3IgKHZhciBrIGluIGRlbWFuZEluY3IpIHRoaXMub25EZW1hbmRJbmNyZWFzZShkZW1hbmRJbmNyW2tdKTtcbiAgICBmb3IgKHZhciBrIGluIHN1cHBseURlY3IpIHRoaXMub25TdXBwbHlEZWNyZWFzZShzdXBwbHlEZWNyW2tdKTtcbn07XG5cbi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cbi8qIFV0aWxpdGllczogZGVkdXBsaWNhdG9yICovXG5cbmZ1bmN0aW9uIERlZHVwbGljYXRvcih0dGxfbXMpIHtcbiAgICB0aGlzLnR0bF9tcyA9IHR0bF9tcyB8fCAxMDAwMDtcbiAgICB0aGlzLnF1ZXVlID0gW107XG4gICAgdGhpcy5tYXAgPSB7fTtcbiAgICB0aGlzLnRpbWVySWQgPSBudWxsO1xufVxuXG5EZWR1cGxpY2F0b3IucHJvdG90eXBlLmFjY2VwdCA9IGZ1bmN0aW9uIChtKSB7XG4gICAgdmFyIHMgPSBKU09OLnN0cmluZ2lmeShtKTtcbiAgICBpZiAocyBpbiB0aGlzLm1hcCkgcmV0dXJuIGZhbHNlO1xuICAgIHZhciBlbnRyeSA9IFsoK25ldyBEYXRlKCkpICsgdGhpcy50dGxfbXMsIHMsIG1dO1xuICAgIHRoaXMubWFwW3NdID0gZW50cnk7XG4gICAgdGhpcy5xdWV1ZS5wdXNoKGVudHJ5KTtcblxuICAgIGlmICh0aGlzLnRpbWVySWQgPT09IG51bGwpIHtcblx0dmFyIHNlbGYgPSB0aGlzO1xuXHR0aGlzLnRpbWVySWQgPSBzZXRJbnRlcnZhbChmdW5jdGlvbiAoKSB7IHNlbGYuZXhwaXJlTWVzc2FnZXMoKTsgfSxcblx0XHRcdFx0ICAgdGhpcy50dGxfbXMgPiAxMDAwID8gMTAwMCA6IHRoaXMudHRsX21zKTtcbiAgICB9XG4gICAgcmV0dXJuIHRydWU7XG59O1xuXG5EZWR1cGxpY2F0b3IucHJvdG90eXBlLmV4cGlyZU1lc3NhZ2VzID0gZnVuY3Rpb24gKCkge1xuICAgIHZhciBub3cgPSArbmV3IERhdGUoKTtcbiAgICB3aGlsZSAodGhpcy5xdWV1ZS5sZW5ndGggPiAwICYmIHRoaXMucXVldWVbMF1bMF0gPD0gbm93KSB7XG5cdHZhciBlbnRyeSA9IHRoaXMucXVldWUuc2hpZnQoKTtcblx0ZGVsZXRlIHRoaXMubWFwW2VudHJ5WzFdXTtcbiAgICB9XG4gICAgaWYgKHRoaXMucXVldWUubGVuZ3RoID09PSAwKSB7XG5cdGNsZWFySW50ZXJ2YWwodGhpcy50aW1lcklkKTtcblx0dGhpcy50aW1lcklkID0gbnVsbDtcbiAgICB9XG59O1xuXG4vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cblxubW9kdWxlLmV4cG9ydHMuX18gPSBfXztcbm1vZHVsZS5leHBvcnRzLl8kID0gXyQ7XG5cbm1vZHVsZS5leHBvcnRzLnN1YiA9IHN1Yjtcbm1vZHVsZS5leHBvcnRzLnB1YiA9IHB1Yjtcbm1vZHVsZS5leHBvcnRzLnNwYXduID0gc3Bhd247XG5tb2R1bGUuZXhwb3J0cy51cGRhdGVSb3V0ZXMgPSB1cGRhdGVSb3V0ZXM7XG5tb2R1bGUuZXhwb3J0cy5zZW5kTWVzc2FnZSA9IHNlbmRNZXNzYWdlO1xubW9kdWxlLmV4cG9ydHMuc2h1dGRvd25Xb3JsZCA9IHNodXRkb3duV29ybGQ7XG5cbm1vZHVsZS5leHBvcnRzLldvcmxkID0gV29ybGQ7XG5tb2R1bGUuZXhwb3J0cy5EZW1hbmRNYXRjaGVyID0gRGVtYW5kTWF0Y2hlcjtcbm1vZHVsZS5leHBvcnRzLkRlZHVwbGljYXRvciA9IERlZHVwbGljYXRvcjtcbm1vZHVsZS5leHBvcnRzLlJvdXRlID0gUm91dGU7XG4iLCIvLyBSZWZsZWN0aW9uIG9uIGZ1bmN0aW9uIGZvcm1hbCBwYXJhbWV0ZXIgbGlzdHMuXG4vLyBUaGlzIG1vZHVsZSBpcyBiYXNlZCBvbiBBbmd1bGFyJ3MgXCJpbmplY3RvclwiIGNvZGUsXG4vLyBodHRwczovL2dpdGh1Yi5jb20vYW5ndWxhci9hbmd1bGFyLmpzL2Jsb2IvbWFzdGVyL3NyYy9hdXRvL2luamVjdG9yLmpzLFxuLy8gTUlUIGxpY2Vuc2VkLCBhbmQgaGVuY2U6XG4vLyBDb3B5cmlnaHQgKGMpIDIwMTAtMjAxNCBHb29nbGUsIEluYy4gaHR0cDovL2FuZ3VsYXJqcy5vcmdcbi8vIENvcHlyaWdodCAoYykgMjAxNCBUb255IEdhcm5vY2stSm9uZXNcblxudmFyIEZOX0FSR1MgPSAvXmZ1bmN0aW9uXFxzKlteXFwoXSpcXChcXHMqKFteXFwpXSopXFwpL207XG52YXIgRk5fQVJHX1NQTElUID0gLywvO1xudmFyIFNUUklQX0NPTU1FTlRTID0gLygoXFwvXFwvLiokKXwoXFwvXFwqW1xcc1xcU10qP1xcKlxcLykpL21nO1xuXG5mdW5jdGlvbiBmb3JtYWxQYXJhbWV0ZXJzKGZuKSB7XG4gICAgdmFyIHJlc3VsdCA9IFtdO1xuXG4gICAgdmFyIGZuVGV4dCA9IGZuLnRvU3RyaW5nKCkucmVwbGFjZShTVFJJUF9DT01NRU5UUywgJycpO1xuICAgIHZhciBhcmdEZWNsID0gZm5UZXh0Lm1hdGNoKEZOX0FSR1MpO1xuICAgIHZhciBhcmdzID0gYXJnRGVjbFsxXS5zcGxpdChGTl9BUkdfU1BMSVQpO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgYXJncy5sZW5ndGg7IGkrKykge1xuXHR2YXIgdHJpbW1lZCA9IGFyZ3NbaV0udHJpbSgpO1xuXHRpZiAodHJpbW1lZCkgeyByZXN1bHQucHVzaCh0cmltbWVkKTsgfVxuICAgIH1cblxuICAgIHJldHVybiByZXN1bHQ7XG59XG5cbm1vZHVsZS5leHBvcnRzLmZvcm1hbFBhcmFtZXRlcnMgPSBmb3JtYWxQYXJhbWV0ZXJzO1xuIiwidmFyIF9fID0gXCJfX1wiOyAvKiB3aWxkY2FyZCBtYXJrZXIgKi9cblxudmFyIFNPQSA9IFwiX19bXCI7IC8vIHN0YXJ0IG9mIGFycmF5XG52YXIgRU9BID0gXCJfX11cIjsgLy8gZW5kIG9mIGFycmF5XG5cbmZ1bmN0aW9uIGRpZShtZXNzYWdlKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKG1lc3NhZ2UpO1xufVxuXG5mdW5jdGlvbiAkRW1iZWRkZWQobWF0Y2hlcikge1xuICAgIHRoaXMubWF0Y2hlciA9IG1hdGNoZXI7XG59XG5cbmZ1bmN0aW9uIGVtYmVkZGVkTWF0Y2hlcihtYXRjaGVyKSB7XG4gICAgcmV0dXJuIG5ldyAkRW1iZWRkZWQobWF0Y2hlcik7XG59XG5cbi8vIFRoZSBuYW1lIGFyZ3VtZW50IHNob3VsZCBiZSBhIHN0cmluZyBvciBudWxsOyBpdCBkZWZhdWx0cyB0byBudWxsLlxuLy8gVGhlIHBhdHRlcm4gYXJndW1lbnQgZGVmYXVsdHMgdG8gd2lsZGNhcmQsIF9fLlxuZnVuY3Rpb24gJENhcHR1cmUobmFtZSwgcGF0dGVybikge1xuICAgIHRoaXMubmFtZSA9IG5hbWUgfHwgbnVsbDtcbiAgICB0aGlzLnBhdHRlcm4gPSAodHlwZW9mIHBhdHRlcm4gPT09ICd1bmRlZmluZWQnID8gX18gOiBwYXR0ZXJuKTtcbn1cblxuLy8gQWJicmV2aWF0aW9uOiBfJCguLi4pIDw9PT4gbmV3ICRDYXB0dXJlKC4uLilcbmZ1bmN0aW9uIF8kKG5hbWUsIHBhdHRlcm4pIHtcbiAgICByZXR1cm4gbmV3ICRDYXB0dXJlKG5hbWUsIHBhdHRlcm4pO1xufVxuXG5mdW5jdGlvbiBpc0NhcHR1cmUoeCkgeyByZXR1cm4geCBpbnN0YW5jZW9mICRDYXB0dXJlIHx8IHggPT09IF8kOyB9XG5mdW5jdGlvbiBjYXB0dXJlTmFtZSh4KSB7IHJldHVybiB4IGluc3RhbmNlb2YgJENhcHR1cmUgPyB4Lm5hbWUgOiBudWxsOyB9XG5mdW5jdGlvbiBjYXB0dXJlUGF0dGVybih4KSB7IHJldHVybiB4IGluc3RhbmNlb2YgJENhcHR1cmUgPyB4LnBhdHRlcm4gOiBfXzsgfVxuXG52YXIgU09DID0gXCJfX3t7XCI7IC8vIHN0YXJ0IG9mIGNhcHR1cmVcbnZhciBFT0MgPSBcIl9ffX1cIjsgLy8gZW5kIG9mIGNhcHR1cmVcblxuZnVuY3Rpb24gJFN1Y2Nlc3ModmFsdWUpIHtcbiAgICB0aGlzLnZhbHVlID0gdmFsdWU7XG59XG5cbmZ1bmN0aW9uICRXaWxkY2FyZFNlcXVlbmNlKG1hdGNoZXIpIHtcbiAgICB0aGlzLm1hdGNoZXIgPSBtYXRjaGVyO1xufVxuXG5mdW5jdGlvbiAkRGljdCgpIHtcbiAgICB0aGlzLmxlbmd0aCA9IDA7XG4gICAgdGhpcy5lbnRyaWVzID0ge307XG59XG5cbiREaWN0LnByb3RvdHlwZS5nZXQgPSBmdW5jdGlvbiAoa2V5KSB7XG4gICAgcmV0dXJuIHRoaXMuZW50cmllc1trZXldIHx8IGVtcHR5TWF0Y2hlcjtcbn07XG5cbiREaWN0LnByb3RvdHlwZS5zZXQgPSBmdW5jdGlvbiAoa2V5LCB2YWwpIHtcbiAgICBpZiAoIShrZXkgaW4gdGhpcy5lbnRyaWVzKSkgdGhpcy5sZW5ndGgrKztcbiAgICB0aGlzLmVudHJpZXNba2V5XSA9IHZhbDtcbn07XG5cbiREaWN0LnByb3RvdHlwZS5jbGVhciA9IGZ1bmN0aW9uIChrZXkpIHtcbiAgICBpZiAoa2V5IGluIHRoaXMuZW50cmllcykgdGhpcy5sZW5ndGgtLTtcbiAgICBkZWxldGUgdGhpcy5lbnRyaWVzW2tleV07XG59O1xuXG4kRGljdC5wcm90b3R5cGUuaXNFbXB0eSA9IGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4gdGhpcy5sZW5ndGggPT09IDA7XG59O1xuXG4kRGljdC5wcm90b3R5cGUuY29weSA9IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgb3RoZXIgPSBuZXcgJERpY3QoKTtcbiAgICBvdGhlci5sZW5ndGggPSB0aGlzLmxlbmd0aDtcbiAgICBmb3IgKHZhciBrZXkgaW4gdGhpcy5lbnRyaWVzKSB7XG5cdGlmICh0aGlzLmVudHJpZXMuaGFzT3duUHJvcGVydHkoa2V5KSkge1xuXHQgICAgb3RoZXIuZW50cmllc1trZXldID0gdGhpcy5lbnRyaWVzW2tleV07XG5cdH1cbiAgICB9XG4gICAgcmV0dXJuIG90aGVyO1xufTtcblxuJERpY3QucHJvdG90eXBlLmVtcHR5R3VhcmQgPSBmdW5jdGlvbiAoKSB7XG4gICAgaWYgKHRoaXMuaXNFbXB0eSgpKSByZXR1cm4gZW1wdHlNYXRjaGVyO1xuICAgIHJldHVybiB0aGlzO1xufTtcblxuJERpY3QucHJvdG90eXBlLmhhcyA9IGZ1bmN0aW9uIChrZXkpIHtcbiAgICByZXR1cm4ga2V5IGluIHRoaXMuZW50cmllcztcbn07XG5cbiREaWN0LnByb3RvdHlwZS5zb3J0ZWRLZXlzID0gZnVuY3Rpb24gKCkge1xuICAgIHZhciBrcyA9IFtdO1xuICAgIGZvciAodmFyIGsgaW4gdGhpcy5lbnRyaWVzKSBrcy5wdXNoKGspO1xuICAgIGtzLnNvcnQoKTtcbiAgICByZXR1cm4ga3M7XG59XG5cbmZ1bmN0aW9uIGlzX2VtcHR5TWF0Y2hlcihtKSB7XG4gICAgcmV0dXJuIChtID09PSBlbXB0eU1hdGNoZXIpO1xufVxuXG4vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cbi8vIENvbnN0cnVjdG9yc1xuXG52YXIgZW1wdHlNYXRjaGVyID0gbnVsbDtcblxuZnVuY3Rpb24gcnN1Y2Nlc3Modikge1xuICAgIHJldHVybiAodiA9PT0gZW1wdHlNYXRjaGVyKSA/IGVtcHR5TWF0Y2hlciA6IG5ldyAkU3VjY2Vzcyh2KTtcbn1cblxuZnVuY3Rpb24gcnNlcShlLCByKSB7XG4gICAgaWYgKHIgPT09IGVtcHR5TWF0Y2hlcikgcmV0dXJuIGVtcHR5TWF0Y2hlcjtcbiAgICB2YXIgcyA9IG5ldyAkRGljdCgpO1xuICAgIHMuc2V0KGUsIHIpO1xuICAgIHJldHVybiBzO1xufVxuXG5mdW5jdGlvbiByd2lsZChyKSB7XG4gICAgcmV0dXJuIHJzZXEoX18sIHIpO1xufVxuXG5mdW5jdGlvbiByd2lsZHNlcShyKSB7XG4gICAgcmV0dXJuIChyID09PSBlbXB0eU1hdGNoZXIpID8gZW1wdHlNYXRjaGVyIDogbmV3ICRXaWxkY2FyZFNlcXVlbmNlKHIpO1xufVxuXG4vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cblxuZnVuY3Rpb24gY29tcGlsZVBhdHRlcm4odiwgcCkge1xuICAgIGlmICghcCkgZGllKFwiY29tcGlsZVBhdHRlcm46IG1pc3NpbmcgcGF0dGVyblwiKTtcbiAgICByZXR1cm4gd2FsayhwLCByc2VxKEVPQSwgcnN1Y2Nlc3ModikpKTtcblxuICAgIGZ1bmN0aW9uIHdhbGsocCwgYWNjKSB7XG5cdGlmIChwID09PSBfXykgcmV0dXJuIHJ3aWxkKGFjYyk7XG5cblx0aWYgKEFycmF5LmlzQXJyYXkocCkpIHtcblx0ICAgIGFjYyA9IHJzZXEoRU9BLCBhY2MpO1xuXHQgICAgZm9yICh2YXIgaSA9IHAubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcblx0XHRhY2MgPSB3YWxrKHBbaV0sIGFjYyk7XG5cdCAgICB9XG5cdCAgICByZXR1cm4gcnNlcShTT0EsIGFjYyk7XG5cdH1cblxuXHRpZiAocCBpbnN0YW5jZW9mICRFbWJlZGRlZCkge1xuXHQgICAgcmV0dXJuIGFwcGVuZE1hdGNoZXIocC5tYXRjaGVyLCBmdW5jdGlvbiAodikgeyByZXR1cm4gYWNjOyB9KTtcblx0fSBlbHNlIHtcblx0ICAgIHJldHVybiByc2VxKEpTT04uc3RyaW5naWZ5KHApLCBhY2MpO1xuXHR9XG4gICAgfVxufVxuXG5mdW5jdGlvbiBtYXRjaFBhdHRlcm4odiwgcCkge1xuICAgIHZhciBjYXB0dXJlQ291bnQgPSAwO1xuICAgIHZhciByZXN1bHQgPSB7fTtcbiAgICB0cnkge1xuXHR3YWxrKHYsIHApO1xuICAgIH0gY2F0Y2ggKGUpIHtcblx0aWYgKGUubWF0Y2hQYXR0ZXJuRmFpbGVkKSByZXR1cm4gbnVsbDtcblx0dGhyb3cgZTtcbiAgICB9XG4gICAgcmVzdWx0Lmxlbmd0aCA9IGNhcHR1cmVDb3VudDtcbiAgICByZXR1cm4gcmVzdWx0O1xuXG4gICAgZnVuY3Rpb24gd2Fsayh2LCBwKSB7XG5cdGlmIChwID09PSB2KSByZXR1cm47XG5cblx0aWYgKHAgPT09IF9fKSByZXR1cm47XG5cblx0aWYgKEFycmF5LmlzQXJyYXkocCkgJiYgQXJyYXkuaXNBcnJheSh2KSAmJiBwLmxlbmd0aCA9PT0gdi5sZW5ndGgpIHtcblx0ICAgIGZvciAodmFyIGkgPSAwOyBpIDwgcC5sZW5ndGg7IGkrKykge1xuXHRcdHdhbGsodltpXSwgcFtpXSk7XG5cdCAgICB9XG5cdCAgICByZXR1cm47XG5cdH1cblxuXHRpZiAoaXNDYXB0dXJlKHApKSB7XG5cdCAgICB2YXIgdGhpc0NhcHR1cmUgPSBjYXB0dXJlQ291bnQrKztcblx0ICAgIHdhbGsodiwgY2FwdHVyZVBhdHRlcm4ocCkpO1xuXHQgICAgcmVzdWx0W2NhcHR1cmVOYW1lKHApIHx8ICgnJCcgKyB0aGlzQ2FwdHVyZSldID0gdjtcblx0ICAgIHJldHVybjtcblx0fVxuXG5cdGlmIChwIGluc3RhbmNlb2YgJEVtYmVkZGVkKSB7XG5cdCAgICBkaWUoXCIkRW1iZWRkZWQgcGF0dGVybnMgbm90IHN1cHBvcnRlZCBpbiBtYXRjaFBhdHRlcm4oKVwiKTtcblx0fVxuXG5cdHRocm93IHttYXRjaFBhdHRlcm5GYWlsZWQ6IHRydWV9O1xuICAgIH1cbn1cblxuZnVuY3Rpb24gc2hhbGxvd0NvcHlBcnJheShzKSB7XG4gICAgcmV0dXJuIHMuc2xpY2UoKTtcbn1cblxuZnVuY3Rpb24gcnVwZGF0ZUlucGxhY2Uociwga2V5LCBrKSB7XG4gICAgaWYgKGlzX2VtcHR5TWF0Y2hlcihrKSkge1xuXHRyLmNsZWFyKGtleSk7XG4gICAgfSBlbHNlIHtcblx0ci5zZXQoa2V5LCBrKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIG1hdGNoZXJFcXVhbHMoYSwgYikge1xuICAgIGlmIChhID09PSBudWxsKSB7XG5cdHJldHVybiAoYiA9PT0gbnVsbCk7XG4gICAgfVxuICAgIGlmIChiID09PSBudWxsKSByZXR1cm4gZmFsc2U7XG5cbiAgICBpZiAoYSBpbnN0YW5jZW9mICRXaWxkY2FyZFNlcXVlbmNlKSB7XG5cdGlmICghKGIgaW5zdGFuY2VvZiAkV2lsZGNhcmRTZXF1ZW5jZSkpIHJldHVybiBmYWxzZTtcblx0YSA9IGEubWF0Y2hlcjtcblx0YiA9IGIubWF0Y2hlcjtcbiAgICB9IGVsc2UgaWYgKGIgaW5zdGFuY2VvZiAkV2lsZGNhcmRTZXF1ZW5jZSkgcmV0dXJuIGZhbHNlO1xuXG4gICAgaWYgKGEgaW5zdGFuY2VvZiAkU3VjY2Vzcykge1xuXHRpZiAoIShiIGluc3RhbmNlb2YgJFN1Y2Nlc3MpKSByZXR1cm4gZmFsc2U7XG5cdHJldHVybiB2YWx1ZXNFcXVhbChhLnZhbHVlLCBiLnZhbHVlKTtcbiAgICB9XG4gICAgaWYgKGIgaW5zdGFuY2VvZiAkU3VjY2VzcykgcmV0dXJuIGZhbHNlO1xuXG4gICAgZm9yICh2YXIga2V5IGluIGEuZW50cmllcykge1xuXHRpZiAoIWIuaGFzKGtleSkpIHJldHVybiBmYWxzZTtcblx0aWYgKCFtYXRjaGVyRXF1YWxzKGEuZW50cmllc1trZXldLCBiLmVudHJpZXNba2V5XSkpIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgcmV0dXJuIHRydWU7XG59XG5cbmZ1bmN0aW9uIGlzX2tleU9wZW4oaykge1xuICAgIHJldHVybiBrID09PSBTT0E7XG59XG5cbmZ1bmN0aW9uIGlzX2tleUNsb3NlKGspIHtcbiAgICByZXR1cm4gayA9PT0gRU9BO1xufVxuXG5mdW5jdGlvbiBpc19rZXlOb3JtYWwoaykge1xuICAgIHJldHVybiAhKGlzX2tleU9wZW4oaykgfHwgaXNfa2V5Q2xvc2UoaykpO1xufVxuXG4vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cbi8vIEVub3VnaCBvZiBzZXRzIHRvIGdldCBieSB3aXRoXG5cbmZ1bmN0aW9uIGFycmF5VG9TZXQoeHMpIHtcbiAgICB2YXIgcyA9IHt9O1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgeHMubGVuZ3RoOyBpKyspIHtcblx0c1tKU09OLnN0cmluZ2lmeSh4c1tpXSldID0geHNbaV07XG4gICAgfVxuICAgIHJldHVybiBzO1xufVxuXG5mdW5jdGlvbiBzZXRUb0FycmF5KHMpIHtcbiAgICB2YXIgciA9IFtdO1xuICAgIGZvciAodmFyIGsgaW4gcykgci5wdXNoKHNba10pO1xuICAgIHJldHVybiByO1xufVxuXG5mdW5jdGlvbiBzZXRVbmlvbihzMSwgczIpIHtcbiAgICB2YXIgcyA9IHt9O1xuICAgIHNldFVuaW9uSW5wbGFjZShzLCBzMSk7XG4gICAgc2V0VW5pb25JbnBsYWNlKHMsIHMyKTtcbiAgICByZXR1cm4gcztcbn1cblxuZnVuY3Rpb24gaXNfZW1wdHlTZXQocykge1xuICAgIGZvciAodmFyIGsgaW4gcykge1xuXHRpZiAocy5oYXNPd25Qcm9wZXJ0eShrKSlcblx0ICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgcmV0dXJuIHRydWU7XG59XG5cbmZ1bmN0aW9uIHNldFN1YnRyYWN0KHMxLCBzMikge1xuICAgIHZhciBzID0ge307XG4gICAgZm9yICh2YXIga2V5IGluIHMxKSB7XG5cdGlmIChzMS5oYXNPd25Qcm9wZXJ0eShrZXkpICYmICFzMi5oYXNPd25Qcm9wZXJ0eShrZXkpKSB7XG5cdCAgICBzW2tleV0gPSBzMVtrZXldO1xuXHR9XG4gICAgfVxuICAgIHJldHVybiBzO1xufVxuXG5mdW5jdGlvbiBzZXRJbnRlcnNlY3QoczEsIHMyKSB7XG4gICAgdmFyIHMgPSB7fTtcbiAgICBmb3IgKHZhciBrZXkgaW4gczEpIHtcblx0aWYgKHMxLmhhc093blByb3BlcnR5KGtleSkgJiYgczIuaGFzT3duUHJvcGVydHkoa2V5KSkge1xuXHQgICAgc1trZXldID0gczFba2V5XTtcblx0fVxuICAgIH1cbiAgICByZXR1cm4gcztcbn1cblxuZnVuY3Rpb24gc2V0VW5pb25JbnBsYWNlKGFjYywgcykge1xuICAgIGZvciAodmFyIGtleSBpbiBzKSB7XG5cdGlmIChzLmhhc093blByb3BlcnR5KGtleSkpIHtcblx0ICAgIGFjY1trZXldID0gc1trZXldO1xuXHR9XG4gICAgfVxufVxuXG5mdW5jdGlvbiBzZXRFcXVhbChzMSwgczIpIHtcbiAgICBmb3IgKHZhciBrZXkgaW4gczEpIHtcblx0aWYgKHMxLmhhc093blByb3BlcnR5KGtleSkpIHtcblx0ICAgIGlmIChzMVtrZXldICE9PSBzMltrZXldKSByZXR1cm4gZmFsc2U7XG5cdH1cbiAgICB9XG4gICAgZm9yICh2YXIga2V5IGluIHMyKSB7XG5cdGlmIChzMi5oYXNPd25Qcm9wZXJ0eShrZXkpKSB7XG5cdCAgICBpZiAoczFba2V5XSAhPT0gczJba2V5XSkgcmV0dXJuIGZhbHNlO1xuXHR9XG4gICAgfVxuICAgIHJldHVybiB0cnVlO1xufVxuXG4vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cblxudmFyIHVuaW9uU3VjY2Vzc2VzID0gZnVuY3Rpb24gKHYxLCB2Mikge1xuICAgIGlmICh2MSA9PT0gdHJ1ZSkgcmV0dXJuIHYyO1xuICAgIGlmICh2MiA9PT0gdHJ1ZSkgcmV0dXJuIHYxO1xuICAgIHJldHVybiBzZXRVbmlvbih2MSwgdjIpO1xufTtcblxudmFyIGludGVyc2VjdFN1Y2Nlc3NlcyA9IGZ1bmN0aW9uICh2MSwgdjIpIHtcbiAgICByZXR1cm4gdjE7XG59O1xuXG52YXIgZXJhc2VQYXRoU3VjY2Vzc2VzID0gZnVuY3Rpb24gKHYxLCB2Mikge1xuICAgIHZhciByID0gc2V0U3VidHJhY3QodjEsIHYyKTtcbiAgICBpZiAoaXNfZW1wdHlTZXQocikpIHJldHVybiBudWxsO1xuICAgIHJldHVybiByO1xufTtcblxudmFyIG1hdGNoTWF0Y2hlclN1Y2Nlc3NlcyA9IGZ1bmN0aW9uICh2MSwgdjIsIGFjYykge1xuICAgIHNldFVuaW9uSW5wbGFjZShhY2MsIHYyKTtcbn07XG5cbnZhciBwcm9qZWN0U3VjY2VzcyA9IGZ1bmN0aW9uICh2KSB7XG4gICAgcmV0dXJuIHY7XG59O1xuXG52YXIgdmFsdWVzRXF1YWwgPSBmdW5jdGlvbiAoYSwgYikge1xuICAgIHJldHVybiBzZXRFcXVhbChhLCBiKTtcbn07XG5cbi8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuXG5mdW5jdGlvbiBleHBhbmRXaWxkc2VxKHIpIHtcbiAgICByZXR1cm4gdW5pb24ocndpbGQocndpbGRzZXEocikpLCByc2VxKEVPQSwgcikpO1xufVxuXG5mdW5jdGlvbiB1bmlvbihvMSwgbzIpIHtcbiAgICByZXR1cm4gbWVyZ2UobzEsIG8yKTtcblxuICAgIGZ1bmN0aW9uIG1lcmdlKG8xLCBvMikge1xuXHRpZiAoaXNfZW1wdHlNYXRjaGVyKG8xKSkgcmV0dXJuIG8yO1xuXHRpZiAoaXNfZW1wdHlNYXRjaGVyKG8yKSkgcmV0dXJuIG8xO1xuXHRyZXR1cm4gd2FsayhvMSwgbzIpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHdhbGsocjEsIHIyKSB7XG5cdGlmIChyMSBpbnN0YW5jZW9mICRXaWxkY2FyZFNlcXVlbmNlKSB7XG5cdCAgICBpZiAocjIgaW5zdGFuY2VvZiAkV2lsZGNhcmRTZXF1ZW5jZSkge1xuXHRcdHJldHVybiByd2lsZHNlcSh3YWxrKHIxLm1hdGNoZXIsIHIyLm1hdGNoZXIpKTtcblx0ICAgIH1cblx0ICAgIHIxID0gZXhwYW5kV2lsZHNlcShyMS5tYXRjaGVyKTtcblx0fSBlbHNlIGlmIChyMiBpbnN0YW5jZW9mICRXaWxkY2FyZFNlcXVlbmNlKSB7XG5cdCAgICByMiA9IGV4cGFuZFdpbGRzZXEocjIubWF0Y2hlcik7XG5cdH1cblxuXHRpZiAocjEgaW5zdGFuY2VvZiAkU3VjY2VzcyAmJiByMiBpbnN0YW5jZW9mICRTdWNjZXNzKSB7XG5cdCAgICByZXR1cm4gcnN1Y2Nlc3ModW5pb25TdWNjZXNzZXMocjEudmFsdWUsIHIyLnZhbHVlKSk7XG5cdH1cblxuXHR2YXIgdyA9IG1lcmdlKHIxLmdldChfXyksIHIyLmdldChfXykpO1xuXHRpZiAoaXNfZW1wdHlNYXRjaGVyKHcpKSB7XG5cdCAgICB2YXIgc21hbGxlciA9IHIxLmxlbmd0aCA8IHIyLmxlbmd0aCA/IHIxIDogcjI7XG5cdCAgICB2YXIgbGFyZ2VyICA9IHIxLmxlbmd0aCA8IHIyLmxlbmd0aCA/IHIyIDogcjE7XG5cdCAgICB2YXIgdGFyZ2V0ID0gbGFyZ2VyLmNvcHkoKTtcblx0ICAgIGZvciAodmFyIGtleSBpbiBzbWFsbGVyLmVudHJpZXMpIHtcblx0XHR2YXIgayA9IG1lcmdlKHNtYWxsZXIuZ2V0KGtleSksIGxhcmdlci5nZXQoa2V5KSk7XG5cdFx0cnVwZGF0ZUlucGxhY2UodGFyZ2V0LCBrZXksIGspO1xuXHQgICAgfVxuXHQgICAgcmV0dXJuIHRhcmdldC5lbXB0eUd1YXJkKCk7XG5cdH0gZWxzZSB7XG5cdCAgICBmdW5jdGlvbiBleGFtaW5lS2V5KHJBLCBrZXksIHJCKSB7XG5cdFx0aWYgKChrZXkgIT09IF9fKSAmJiAhdGFyZ2V0LmhhcyhrZXkpKSB7XG5cdFx0ICAgIHZhciBrID0gbWVyZ2UockEuZ2V0KGtleSksIHJCLmdldChrZXkpKTtcblx0XHQgICAgaWYgKGlzX2tleU9wZW4oa2V5KSkge1xuXHRcdFx0cnVwZGF0ZUlucGxhY2UodGFyZ2V0LCBrZXksIG1lcmdlKHJ3aWxkc2VxKHcpLCBrKSk7XG5cdFx0ICAgIH0gZWxzZSBpZiAoaXNfa2V5Q2xvc2Uoa2V5KSkge1xuXHRcdFx0aWYgKHcgaW5zdGFuY2VvZiAkV2lsZGNhcmRTZXF1ZW5jZSkge1xuXHRcdFx0ICAgIHJ1cGRhdGVJbnBsYWNlKHRhcmdldCwga2V5LCBtZXJnZSh3Lm1hdGNoZXIsIGspKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHQgICAgcnVwZGF0ZUlucGxhY2UodGFyZ2V0LCBrZXksIGspO1xuXHRcdFx0fVxuXHRcdCAgICB9IGVsc2Uge1xuXHRcdFx0cnVwZGF0ZUlucGxhY2UodGFyZ2V0LCBrZXksIG1lcmdlKHcsIGspKTtcblx0XHQgICAgfVxuXHRcdH1cblx0ICAgIH1cblx0ICAgIHZhciB0YXJnZXQgPSByd2lsZCh3KS5jb3B5KCk7XG5cdCAgICBmb3IgKHZhciBrZXkgaW4gcjEuZW50cmllcykgeyBleGFtaW5lS2V5KHIxLCBrZXksIHIyKTsgfVxuXHQgICAgZm9yICh2YXIga2V5IGluIHIyLmVudHJpZXMpIHsgZXhhbWluZUtleShyMiwga2V5LCByMSk7IH1cblx0ICAgIHJldHVybiB0YXJnZXQ7XG5cdH1cbiAgICB9XG59XG5cbmZ1bmN0aW9uIHVuaW9uTigpIHtcbiAgICB2YXIgYWNjID0gZW1wdHlNYXRjaGVyO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgYXJndW1lbnRzLmxlbmd0aDsgaSsrKSB7XG5cdGFjYyA9IHVuaW9uKGFjYywgYXJndW1lbnRzW2ldKTtcbiAgICB9XG4gICAgcmV0dXJuIGFjYztcbn1cblxuZnVuY3Rpb24gaW50ZXJzZWN0KG8xLCBvMikge1xuICAgIGlmIChpc19lbXB0eU1hdGNoZXIobzEpKSByZXR1cm4gZW1wdHlNYXRjaGVyO1xuICAgIGlmIChpc19lbXB0eU1hdGNoZXIobzIpKSByZXR1cm4gZW1wdHlNYXRjaGVyO1xuICAgIHJldHVybiB3YWxrKG8xLCBvMik7XG5cbiAgICBmdW5jdGlvbiB3YWxrRmxpcHBlZChyMiwgcjEpIHsgcmV0dXJuIHdhbGsocjEsIHIyKTsgfVxuXG4gICAgZnVuY3Rpb24gd2FsayhyMSwgcjIpIHtcblx0Ly8gSU5WQVJJQU5UOiByMSBpcyBhIHBhcnQgb2YgdGhlIG9yaWdpbmFsIG8xLCBhbmRcblx0Ly8gbGlrZXdpc2UgZm9yIHIyLiBUaGlzIGlzIHNvIHRoYXQgdGhlIGZpcnN0IGFyZyB0b1xuXHQvLyBpbnRlcnNlY3RTdWNjZXNzZXMgYWx3YXlzIGNvbWVzIGZyb20gcjEsIGFuZCB0aGUgc2Vjb25kXG5cdC8vIGZyb20gcjIuXG5cdGlmIChpc19lbXB0eU1hdGNoZXIocjEpKSByZXR1cm4gZW1wdHlNYXRjaGVyO1xuXHRpZiAoaXNfZW1wdHlNYXRjaGVyKHIyKSkgcmV0dXJuIGVtcHR5TWF0Y2hlcjtcblxuXHRpZiAocjEgaW5zdGFuY2VvZiAkV2lsZGNhcmRTZXF1ZW5jZSkge1xuXHQgICAgaWYgKHIyIGluc3RhbmNlb2YgJFdpbGRjYXJkU2VxdWVuY2UpIHtcblx0XHRyZXR1cm4gcndpbGRzZXEod2FsayhyMS5tYXRjaGVyLCByMi5tYXRjaGVyKSk7XG5cdCAgICB9XG5cdCAgICByMSA9IGV4cGFuZFdpbGRzZXEocjEubWF0Y2hlcik7XG5cdH0gZWxzZSBpZiAocjIgaW5zdGFuY2VvZiAkV2lsZGNhcmRTZXF1ZW5jZSkge1xuXHQgICAgcjIgPSBleHBhbmRXaWxkc2VxKHIyLm1hdGNoZXIpO1xuXHR9XG5cblx0aWYgKHIxIGluc3RhbmNlb2YgJFN1Y2Nlc3MgJiYgcjIgaW5zdGFuY2VvZiAkU3VjY2Vzcykge1xuXHQgICAgcmV0dXJuIHJzdWNjZXNzKGludGVyc2VjdFN1Y2Nlc3NlcyhyMS52YWx1ZSwgcjIudmFsdWUpKTtcblx0fVxuXG5cdHZhciB3MSA9IHIxLmdldChfXyk7XG5cdHZhciB3MiA9IHIyLmdldChfXyk7XG5cdHZhciB3ID0gd2Fsayh3MSwgdzIpO1xuXG5cdHZhciB0YXJnZXQgPSBuZXcgJERpY3QoKTtcblxuXHRmdW5jdGlvbiBleGFtaW5lS2V5KGtleSkge1xuXHQgICAgaWYgKChrZXkgIT09IF9fKSAmJiAhdGFyZ2V0LmhhcyhrZXkpKSB7XG5cdFx0dmFyIGsxID0gcjEuZ2V0KGtleSk7XG5cdFx0dmFyIGsyID0gcjIuZ2V0KGtleSk7XG5cdFx0aWYgKGlzX2VtcHR5TWF0Y2hlcihrMSkpIHtcblx0XHQgICAgaWYgKGlzX2VtcHR5TWF0Y2hlcihrMikpIHtcblx0XHRcdHJ1cGRhdGVJbnBsYWNlKHRhcmdldCwga2V5LCBlbXB0eU1hdGNoZXIpO1xuXHRcdCAgICB9IGVsc2Uge1xuXHRcdFx0cnVwZGF0ZUlucGxhY2UodGFyZ2V0LCBrZXksIHdhbGtXaWxkKHdhbGssIHcxLCBrZXksIGsyKSk7XG5cdFx0ICAgIH1cblx0XHR9IGVsc2Uge1xuXHRcdCAgICBpZiAoaXNfZW1wdHlNYXRjaGVyKGsyKSkge1xuXHRcdFx0cnVwZGF0ZUlucGxhY2UodGFyZ2V0LCBrZXksIHdhbGtXaWxkKHdhbGtGbGlwcGVkLCB3Miwga2V5LCBrMSkpO1xuXHRcdCAgICB9IGVsc2Uge1xuXHRcdFx0cnVwZGF0ZUlucGxhY2UodGFyZ2V0LCBrZXksIHdhbGsoazEsIGsyKSk7XG5cdFx0ICAgIH1cblx0XHR9XG5cdCAgICB9XG5cdH1cblxuXHRpZiAoaXNfZW1wdHlNYXRjaGVyKHcxKSkge1xuXHQgICAgaWYgKGlzX2VtcHR5TWF0Y2hlcih3MikpIHtcblx0XHRmb3IgKHZhciBrZXkgaW4gKHIxLmxlbmd0aCA8IHIyLmxlbmd0aCA/IHIxIDogcjIpLmVudHJpZXMpIGV4YW1pbmVLZXkoa2V5KTtcblx0ICAgIH0gZWxzZSB7XG5cdFx0Zm9yICh2YXIga2V5IGluIHIxLmVudHJpZXMpIGV4YW1pbmVLZXkoa2V5KTtcblx0ICAgIH1cblx0fSBlbHNlIHtcblx0ICAgIGlmIChpc19lbXB0eU1hdGNoZXIodzIpKSB7XG5cdFx0Zm9yICh2YXIga2V5IGluIHIyLmVudHJpZXMpIGV4YW1pbmVLZXkoa2V5KTtcblx0ICAgIH0gZWxzZSB7XG5cdFx0cnVwZGF0ZUlucGxhY2UodGFyZ2V0LCBfXywgdyk7XG5cdFx0Zm9yICh2YXIga2V5IGluIHIxLmVudHJpZXMpIGV4YW1pbmVLZXkoa2V5KTtcblx0XHRmb3IgKHZhciBrZXkgaW4gcjIuZW50cmllcykgZXhhbWluZUtleShrZXkpO1xuXHQgICAgfVxuXHR9XG5cdHJldHVybiB0YXJnZXQuZW1wdHlHdWFyZCgpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHdhbGtXaWxkKHdhbGtlciwgdywga2V5LCBrKSB7XG5cdGlmIChpc19lbXB0eU1hdGNoZXIodykpIHJldHVybiBlbXB0eU1hdGNoZXI7XG5cdGlmIChpc19rZXlPcGVuKGtleSkpIHJldHVybiB3YWxrZXIocndpbGRzZXEodyksIGspO1xuXHRpZiAoaXNfa2V5Q2xvc2Uoa2V5KSkge1xuXHQgICAgaWYgKHcgaW5zdGFuY2VvZiAkV2lsZGNhcmRTZXF1ZW5jZSkgcmV0dXJuIHdhbGtlcih3Lm1hdGNoZXIsIGspO1xuXHQgICAgcmV0dXJuIGVtcHR5TWF0Y2hlcjtcblx0fVxuXHRyZXR1cm4gd2Fsa2VyKHcsIGspO1xuICAgIH1cbn1cblxuLy8gUmVtb3ZlcyByMidzIG1hcHBpbmdzIGZyb20gcjEuIEFzc3VtZXMgcjIgaGFzIHByZXZpb3VzbHkgYmVlblxuLy8gdW5pb24nZCBpbnRvIHIxLiBUaGUgZXJhc2VQYXRoU3VjY2Vzc2VzIGZ1bmN0aW9uIHNob3VsZCByZXR1cm5cbi8vIG51bGwgdG8gc2lnbmFsIFwibm8gcmVtYWluaW5nIHN1Y2Nlc3MgdmFsdWVzXCIuXG5mdW5jdGlvbiBlcmFzZVBhdGgobzEsIG8yKSB7XG4gICAgcmV0dXJuIHdhbGsobzEsIG8yKTtcblxuICAgIGZ1bmN0aW9uIHdhbGsocjEsIHIyKSB7XG5cdGlmIChpc19lbXB0eU1hdGNoZXIocjEpKSB7XG5cdCAgICByZXR1cm4gZW1wdHlNYXRjaGVyO1xuXHR9IGVsc2Uge1xuXHQgICAgaWYgKGlzX2VtcHR5TWF0Y2hlcihyMikpIHtcblx0XHRyZXR1cm4gcjE7XG5cdCAgICB9XG5cdH1cblxuXHRpZiAocjEgaW5zdGFuY2VvZiAkV2lsZGNhcmRTZXF1ZW5jZSkge1xuXHQgICAgaWYgKHIyIGluc3RhbmNlb2YgJFdpbGRjYXJkU2VxdWVuY2UpIHtcblx0XHRyZXR1cm4gcndpbGRzZXEod2FsayhyMS5tYXRjaGVyLCByMi5tYXRjaGVyKSk7XG5cdCAgICB9XG5cdCAgICByMSA9IGV4cGFuZFdpbGRzZXEocjEubWF0Y2hlcik7XG5cdH0gZWxzZSBpZiAocjIgaW5zdGFuY2VvZiAkV2lsZGNhcmRTZXF1ZW5jZSkge1xuXHQgICAgcjIgPSBleHBhbmRXaWxkc2VxKHIyLm1hdGNoZXIpO1xuXHR9XG5cblx0aWYgKHIxIGluc3RhbmNlb2YgJFN1Y2Nlc3MgJiYgcjIgaW5zdGFuY2VvZiAkU3VjY2Vzcykge1xuXHQgICAgcmV0dXJuIHJzdWNjZXNzKGVyYXNlUGF0aFN1Y2Nlc3NlcyhyMS52YWx1ZSwgcjIudmFsdWUpKTtcblx0fVxuXG5cdHZhciB3MSA9IHIxLmdldChfXyk7XG5cdHZhciB3MiA9IHIyLmdldChfXyk7XG5cdHZhciB3ID0gd2Fsayh3MSwgdzIpO1xuXHR2YXIgdGFyZ2V0O1xuXG5cdGZ1bmN0aW9uIGV4YW1pbmVLZXkoa2V5KSB7XG5cdCAgICBpZiAoa2V5ICE9PSBfXykge1xuXHRcdHZhciBrMSA9IHIxLmdldChrZXkpO1xuXHRcdHZhciBrMiA9IHIyLmdldChrZXkpO1xuXHRcdHZhciB1cGRhdGVkSztcblx0XHRpZiAoaXNfZW1wdHlNYXRjaGVyKGsyKSkge1xuXHRcdCAgICB1cGRhdGVkSyA9IHdhbGtXaWxkKGtleSwgazEsIHcyKTtcblx0XHR9IGVsc2Uge1xuXHRcdCAgICB1cGRhdGVkSyA9IHdhbGsoazEsIGsyKTtcblx0XHR9XG5cdFx0Ly8gSGVyZSB3ZSBlbnN1cmUgYSBcIm1pbmltYWxcIiByZW1haW5kZXIgaW4gY2FzZXNcblx0XHQvLyB3aGVyZSBhZnRlciBhbiBlcmFzdXJlLCBhIHBhcnRpY3VsYXIga2V5J3Ncblx0XHQvLyBjb250aW51YXRpb24gaXMgdGhlIHNhbWUgYXMgdGhlIHdpbGRjYXJkJ3Ncblx0XHQvLyBjb250aW51YXRpb24uIFRPRE86IHRoZSBtYXRjaGVyRXF1YWxzIGNoZWNrIG1heVxuXHRcdC8vIGJlIGV4cGVuc2l2ZS4gSWYgc28sIGhvdyBjYW4gaXQgYmUgbWFkZVxuXHRcdC8vIGNoZWFwZXI/XG5cdFx0aWYgKGlzX2tleU9wZW4oa2V5KSkge1xuXHRcdCAgICBydXBkYXRlSW5wbGFjZSh0YXJnZXQsIGtleSxcblx0XHRcdFx0ICAgKCh1cGRhdGVkSyBpbnN0YW5jZW9mICRXaWxkY2FyZFNlcXVlbmNlKSAmJlxuXHRcdFx0XHQgICAgbWF0Y2hlckVxdWFscyh1cGRhdGVkSy5tYXRjaGVyLCB3KSlcblx0XHRcdFx0ICAgPyBlbXB0eU1hdGNoZXJcblx0XHRcdFx0ICAgOiB1cGRhdGVkSyk7XG5cdFx0fSBlbHNlIGlmIChpc19rZXlDbG9zZShrZXkpKSB7XG5cdFx0ICAgIC8vIFdlIHRha2UgY2FyZSBvZiB0aGlzIGNhc2UgbGF0ZXIsIGFmdGVyIHRoZVxuXHRcdCAgICAvLyB0YXJnZXQgaXMgZnVsbHkgY29uc3RydWN0ZWQvcmVidWlsdC5cblx0XHQgICAgcnVwZGF0ZUlucGxhY2UodGFyZ2V0LCBrZXksIHVwZGF0ZWRLKTtcblx0XHR9IGVsc2Uge1xuXHRcdCAgICBydXBkYXRlSW5wbGFjZSh0YXJnZXQsIGtleSxcblx0XHRcdFx0ICAgKG1hdGNoZXJFcXVhbHModXBkYXRlZEssIHcpID8gZW1wdHlNYXRjaGVyIDogdXBkYXRlZEspKTtcblx0XHR9XG5cdCAgICB9XG5cdH1cblxuXHRpZiAoaXNfZW1wdHlNYXRjaGVyKHcyKSkge1xuXHQgICAgdGFyZ2V0ID0gcjEuY29weSgpO1xuXHQgICAgZm9yICh2YXIga2V5IGluIHIyLmVudHJpZXMpIGV4YW1pbmVLZXkoa2V5KTtcblx0fSBlbHNlIHtcblx0ICAgIHRhcmdldCA9IG5ldyAkRGljdCgpO1xuXHQgICAgcnVwZGF0ZUlucGxhY2UodGFyZ2V0LCBfXywgdyk7XG5cdCAgICBmb3IgKHZhciBrZXkgaW4gcjEuZW50cmllcykgZXhhbWluZUtleShrZXkpO1xuXHQgICAgZm9yICh2YXIga2V5IGluIHIyLmVudHJpZXMpIGV4YW1pbmVLZXkoa2V5KTtcblx0fVxuXG5cdC8vIEhlcmUsIHRoZSB0YXJnZXQgaXMgY29tcGxldGUuIElmIGl0IGhhcyBvbmx5IHR3byBrZXlzLFxuXHQvLyBvbmUgd2lsZCBhbmQgb25lIGlzX2tleUNsb3NlLCBhbmQgd2lsZCdzIGNvbnRpbnVhdGlvblxuXHQvLyBpcyBhICRXaWxkY2FyZFNlcXVlbmNlIGFuZCB0aGUgb3RoZXIgY29udGludWF0aW9uIGlzXG5cdC8vIGlkZW50aWNhbCB0byB0aGUgc2VxdWVuY2UncyBjb250aW51YXRpb24sIHRoZW4gcmVwbGFjZVxuXHQvLyB0aGUgd2hvbGUgdGhpbmcgd2l0aCBhIG5lc3RlZCAkV2lsZGNhcmRTZXF1ZW5jZS5cblx0Ly8gKFdlIGtub3cgdyA9PT0gdGFyZ2V0LmdldChfXykgZnJvbSBiZWZvcmUuKVxuXHQvL1xuXHQvLyBUT0RPOiBJIHN1c3BlY3QgYWN0dWFsbHkgdGhpcyBhcHBsaWVzIGV2ZW4gaWYgdGhlcmUgYXJlXG5cdC8vIG1vcmUgdGhhbiB0d28ga2V5cywgc28gbG9uZyBhcyBhbGwgdGhlaXIgY29udGludWF0aW9uc1xuXHQvLyBhcmUgaWRlbnRpY2FsIGFuZCB0aGVyZSdzIGF0IGxlYXN0IG9uZSBpc19rZXlDbG9zZVxuXHQvLyBhbG9uZ3NpZGUgYSB3aWxkLlxuXHRpZiAodGFyZ2V0Lmxlbmd0aCA9PT0gMikge1xuXHQgICAgdmFyIGZpbmFsVyA9IHRhcmdldC5nZXQoX18pO1xuXHQgICAgaWYgKGZpbmFsVyBpbnN0YW5jZW9mICRXaWxkY2FyZFNlcXVlbmNlKSB7XG5cdFx0Zm9yICh2YXIga2V5IGluIHRhcmdldC5lbnRyaWVzKSB7XG5cdFx0ICAgIGlmICgoa2V5ICE9PSBfXykgJiYgaXNfa2V5Q2xvc2Uoa2V5KSkge1xuXHRcdFx0dmFyIGsgPSB0YXJnZXQuZ2V0KGtleSk7XG5cdFx0XHRpZiAobWF0Y2hlckVxdWFscyhrLCBmaW5hbFcubWF0Y2hlcikpIHtcblx0XHRcdCAgICByZXR1cm4gZmluYWxXO1xuXHRcdFx0fVxuXHRcdCAgICB9XG5cdFx0fVxuXHQgICAgfVxuXHR9XG5cblx0cmV0dXJuIHRhcmdldC5lbXB0eUd1YXJkKCk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gd2Fsa1dpbGQoa2V5LCBrLCB3KSB7XG5cdGlmIChpc19lbXB0eU1hdGNoZXIodykpIHJldHVybiBrO1xuXHRpZiAoaXNfa2V5T3BlbihrZXkpKSByZXR1cm4gd2FsayhrLCByd2lsZHNlcSh3KSk7XG5cdGlmIChpc19rZXlDbG9zZShrZXkpKSB7XG5cdCAgICBpZiAodyBpbnN0YW5jZW9mICRXaWxkY2FyZFNlcXVlbmNlKSByZXR1cm4gd2FsayhrLCB3Lm1hdGNoZXIpO1xuXHQgICAgcmV0dXJuIGs7XG5cdH1cblx0cmV0dXJuIHdhbGsoaywgdyk7XG4gICAgfVxufVxuXG4vLyBSZXR1cm5zIG51bGwgb24gZmFpbGVkIG1hdGNoLCBvdGhlcndpc2UgdGhlIGFwcHJvcHJpYXRlIHN1Y2Nlc3Ncbi8vIHZhbHVlIGNvbnRhaW5lZCBpbiB0aGUgbWF0Y2hlciByLlxuZnVuY3Rpb24gbWF0Y2hWYWx1ZShyLCB2KSB7XG4gICAgdmFyIGZhaWx1cmVSZXN1bHQgPSBudWxsO1xuXG4gICAgdmFyIHZzID0gW3ZdO1xuICAgIHZhciBzdGFjayA9IFtbXV07XG5cbiAgICB3aGlsZSAoIWlzX2VtcHR5TWF0Y2hlcihyKSkge1xuXHRpZiAociBpbnN0YW5jZW9mICRXaWxkY2FyZFNlcXVlbmNlKSB7XG5cdCAgICBpZiAoc3RhY2subGVuZ3RoID09PSAwKSByZXR1cm4gZmFpbHVyZVJlc3VsdDtcblx0ICAgIHZzID0gc3RhY2sucG9wKCk7XG5cdCAgICByID0gci5tYXRjaGVyO1xuXHQgICAgY29udGludWU7XG5cdH1cblxuXHRpZiAociBpbnN0YW5jZW9mICRTdWNjZXNzKSB7XG5cdCAgICBpZiAodnMubGVuZ3RoID09PSAwICYmIHN0YWNrLmxlbmd0aCA9PT0gMCkgcmV0dXJuIHIudmFsdWU7XG5cdCAgICByZXR1cm4gZmFpbHVyZVJlc3VsdDtcblx0fVxuXG5cdGlmICh2cy5sZW5ndGggPT09IDApIHtcblx0ICAgIGlmIChzdGFjay5sZW5ndGggPT09IDApIHJldHVybiBmYWlsdXJlUmVzdWx0O1xuXHQgICAgdnMgPSBzdGFjay5wb3AoKTtcblx0ICAgIHIgPSByLmdldChFT0EpO1xuXHQgICAgY29udGludWU7XG5cdH1cblxuXHR2YXIgdiA9IHZzLnNoaWZ0KCk7XG5cblx0aWYgKHR5cGVvZiB2ID09PSAnc3RyaW5nJyAmJiB2LnN1YnN0cmluZygwLCAyKSA9PT0gJ19fJykge1xuXHQgICAgZGllKFwiQ2Fubm90IG1hdGNoIHNwZWNpYWwgc3RyaW5nIHN0YXJ0aW5nIHdpdGggX19cIik7XG5cdH1cblxuXHRpZiAoQXJyYXkuaXNBcnJheSh2KSkge1xuXHQgICAgaWYgKFNPQSBpbiByLmVudHJpZXMpIHtcblx0XHRyID0gci5nZXQoU09BKTtcblx0XHRzdGFjay5wdXNoKHZzKTtcblx0XHR2cyA9IHNoYWxsb3dDb3B5QXJyYXkodik7XG5cdCAgICB9IGVsc2Uge1xuXHRcdHIgPSByLmdldChfXyk7XG5cdCAgICB9XG5cdH0gZWxzZSB7XG5cdCAgICB2YXIga2V5O1xuXHQgICAgdHJ5IHtcblx0XHRrZXkgPSBKU09OLnN0cmluZ2lmeSh2KTtcblx0ICAgIH0gY2F0Y2ggKGV4bikge1xuXHRcdC8vIEZvciBleGFtcGxlLCB2IG1pZ2h0IGJlIGN5Y2xpYywgYXMgaW4gRE9NIGV2ZW50cy5cblx0XHRrZXkgPSBudWxsO1xuXHQgICAgfVxuXHQgICAgaWYgKGtleSBpbiByLmVudHJpZXMpIHtcblx0XHRyID0gci5nZXQoa2V5KTtcblx0ICAgIH0gZWxzZSB7XG5cdFx0ciA9IHIuZ2V0KF9fKTtcblx0ICAgIH1cblx0fVxuICAgIH1cblxuICAgIHJldHVybiBmYWlsdXJlUmVzdWx0O1xufVxuXG4vLyBUT0RPOiBiZXR0ZXIgbmFtZSBmb3IgdGhpc1xuZnVuY3Rpb24gbWF0Y2hNYXRjaGVyKG8xLCBvMiwgc2VlZCkge1xuICAgIHZhciBhY2MgPSB0eXBlb2Ygc2VlZCA9PT0gJ3VuZGVmaW5lZCcgPyB7fSA6IHNlZWQ7IC8vIHdpbGwgYmUgbW9kaWZpZWQgaW4gcGxhY2VcbiAgICB3YWxrKG8xLCBvMik7XG4gICAgcmV0dXJuIGFjYztcblxuICAgIGZ1bmN0aW9uIHdhbGtGbGlwcGVkKHIyLCByMSkgeyByZXR1cm4gd2FsayhyMSwgcjIpOyB9XG5cbiAgICBmdW5jdGlvbiB3YWxrKHIxLCByMikge1xuXHRpZiAoaXNfZW1wdHlNYXRjaGVyKHIxKSB8fCBpc19lbXB0eU1hdGNoZXIocjIpKSByZXR1cm47XG5cblx0aWYgKHIxIGluc3RhbmNlb2YgJFdpbGRjYXJkU2VxdWVuY2UpIHtcblx0ICAgIGlmIChyMiBpbnN0YW5jZW9mICRXaWxkY2FyZFNlcXVlbmNlKSB7XG5cdFx0d2FsayhyMS5tYXRjaGVyLCByMi5tYXRjaGVyKTtcblx0XHRyZXR1cm47XG5cdCAgICB9XG5cdCAgICByMSA9IGV4cGFuZFdpbGRzZXEocjEubWF0Y2hlcik7XG5cdH0gZWxzZSBpZiAocjIgaW5zdGFuY2VvZiAkV2lsZGNhcmRTZXF1ZW5jZSkge1xuXHQgICAgcjIgPSBleHBhbmRXaWxkc2VxKHIyLm1hdGNoZXIpO1xuXHR9XG5cblx0aWYgKHIxIGluc3RhbmNlb2YgJFN1Y2Nlc3MgJiYgcjIgaW5zdGFuY2VvZiAkU3VjY2Vzcykge1xuXHQgICAgbWF0Y2hNYXRjaGVyU3VjY2Vzc2VzKHIxLnZhbHVlLCByMi52YWx1ZSwgYWNjKTtcblx0ICAgIHJldHVybjtcblx0fVxuXG5cdHZhciB3MSA9IHIxLmdldChfXyk7XG5cdHZhciB3MiA9IHIyLmdldChfXyk7XG5cdHdhbGsodzEsIHcyKTtcblxuXHRmdW5jdGlvbiBleGFtaW5lS2V5KGtleSkge1xuXHQgICAgaWYgKGtleSAhPT0gX18pIHtcblx0XHR2YXIgazEgPSByMS5nZXQoa2V5KTtcblx0XHR2YXIgazIgPSByMi5nZXQoa2V5KTtcblx0XHRpZiAoaXNfZW1wdHlNYXRjaGVyKGsxKSkge1xuXHRcdCAgICBpZiAoaXNfZW1wdHlNYXRjaGVyKGsyKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdCAgICB9IGVsc2Uge1xuXHRcdFx0d2Fsa1dpbGQod2FsaywgdzEsIGtleSwgazIpO1xuXHRcdCAgICB9XG5cdFx0fSBlbHNlIHtcblx0XHQgICAgaWYgKGlzX2VtcHR5TWF0Y2hlcihrMikpIHtcblx0XHRcdHdhbGtXaWxkKHdhbGtGbGlwcGVkLCB3Miwga2V5LCBrMSk7XG5cdFx0ICAgIH0gZWxzZSB7XG5cdFx0XHR3YWxrKGsxLCBrMik7XG5cdFx0ICAgIH1cblx0XHR9XG5cdCAgICB9XG5cdH1cblxuXHQvLyBPcHRpbWl6ZSBzaW1pbGFybHkgdG8gaW50ZXJzZWN0KCkuXG5cdGlmIChpc19lbXB0eU1hdGNoZXIodzEpKSB7XG5cdCAgICBpZiAoaXNfZW1wdHlNYXRjaGVyKHcyKSkge1xuXHRcdGZvciAodmFyIGtleSBpbiAocjEubGVuZ3RoIDwgcjIubGVuZ3RoID8gcjEgOiByMikuZW50cmllcykgZXhhbWluZUtleShrZXkpO1xuXHQgICAgfSBlbHNlIHtcblx0XHRmb3IgKHZhciBrZXkgaW4gcjEuZW50cmllcykgZXhhbWluZUtleShrZXkpO1xuXHQgICAgfVxuXHR9IGVsc2Uge1xuXHQgICAgaWYgKGlzX2VtcHR5TWF0Y2hlcih3MikpIHtcblx0XHRmb3IgKHZhciBrZXkgaW4gcjIuZW50cmllcykgZXhhbWluZUtleShrZXkpO1xuXHQgICAgfSBlbHNlIHtcblx0XHRmb3IgKHZhciBrZXkgaW4gcjEuZW50cmllcykgZXhhbWluZUtleShrZXkpO1xuXHRcdGZvciAodmFyIGtleSBpbiByMi5lbnRyaWVzKSBleGFtaW5lS2V5KGtleSk7XG5cdCAgICB9XG5cdH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiB3YWxrV2lsZCh3YWxrZXIsIHcsIGtleSwgaykge1xuXHRpZiAoaXNfZW1wdHlNYXRjaGVyKHcpKSByZXR1cm47XG5cdGlmIChpc19rZXlPcGVuKGtleSkpIHtcblx0ICAgIHdhbGtlcihyd2lsZHNlcSh3KSwgayk7XG5cdCAgICByZXR1cm47XG5cdH1cblx0aWYgKGlzX2tleUNsb3NlKGtleSkpIHtcblx0ICAgIGlmICh3IGluc3RhbmNlb2YgJFdpbGRjYXJkU2VxdWVuY2UpIHdhbGtlcih3Lm1hdGNoZXIsIGspO1xuXHQgICAgcmV0dXJuO1xuXHR9XG5cdHdhbGtlcih3LCBrKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGFwcGVuZE1hdGNoZXIobSwgbVRhaWxGbikge1xuICAgIHJldHVybiB3YWxrKG0pO1xuXG4gICAgZnVuY3Rpb24gd2FsayhtKSB7XG5cdGlmIChpc19lbXB0eU1hdGNoZXIobSkpIHJldHVybiBlbXB0eU1hdGNoZXI7XG5cdGlmIChtIGluc3RhbmNlb2YgJFdpbGRjYXJkU2VxdWVuY2UpIHJldHVybiByd2lsZHNlcSh3YWxrKG0ubWF0Y2hlcikpO1xuXHRpZiAobSBpbnN0YW5jZW9mICRTdWNjZXNzKSBkaWUoXCJJbGwtZm9ybWVkIG1hdGNoZXJcIik7XG5cblx0dmFyIHRhcmdldCA9IG5ldyAkRGljdCgpO1xuXHRmb3IgKHZhciBrZXkgaW4gbS5lbnRyaWVzKSB7XG5cdCAgICB2YXIgayA9IG0uZ2V0KGtleSk7XG5cdCAgICBpZiAoaXNfa2V5Q2xvc2Uoa2V5KSAmJiAoayBpbnN0YW5jZW9mICRTdWNjZXNzKSkge1xuXHRcdHRhcmdldCA9IHVuaW9uKHRhcmdldCwgbVRhaWxGbihrLnZhbHVlKSk7XG5cdCAgICB9IGVsc2Uge1xuXHRcdHJ1cGRhdGVJbnBsYWNlKHRhcmdldCwga2V5LCB3YWxrKGspKTtcblx0ICAgIH1cblx0fVxuXHRyZXR1cm4gdGFyZ2V0LmVtcHR5R3VhcmQoKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIHJlbGFiZWwobSwgZikge1xuICAgIHJldHVybiB3YWxrKG0pO1xuXG4gICAgZnVuY3Rpb24gd2FsayhtKSB7XG5cdGlmIChpc19lbXB0eU1hdGNoZXIobSkpIHJldHVybiBlbXB0eU1hdGNoZXI7XG5cdGlmIChtIGluc3RhbmNlb2YgJFdpbGRjYXJkU2VxdWVuY2UpIHJldHVybiByd2lsZHNlcSh3YWxrKG0ubWF0Y2hlcikpO1xuXHRpZiAobSBpbnN0YW5jZW9mICRTdWNjZXNzKSByZXR1cm4gcnN1Y2Nlc3MoZihtLnZhbHVlKSk7XG5cblx0dmFyIHRhcmdldCA9IG5ldyAkRGljdCgpO1xuXHRmb3IgKHZhciBrZXkgaW4gbS5lbnRyaWVzKSB7XG5cdCAgICBydXBkYXRlSW5wbGFjZSh0YXJnZXQsIGtleSwgd2FsayhtLmdldChrZXkpKSk7XG5cdH1cblx0cmV0dXJuIHRhcmdldC5lbXB0eUd1YXJkKCk7XG4gICAgfVxufVxuXG5mdW5jdGlvbiBjb21waWxlUHJvamVjdGlvbigvKiBwcm9qZWN0aW9uLCBwcm9qZWN0aW9uLCAuLi4gKi8pIHtcbiAgICB2YXIgbmFtZXMgPSBbXTtcbiAgICB2YXIgYWNjID0gW107XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBhcmd1bWVudHMubGVuZ3RoOyBpKyspIHtcblx0d2Fsayhhcmd1bWVudHNbaV0pO1xuICAgIH1cbiAgICBhY2MucHVzaChFT0EpO1xuICAgIHJldHVybiB7bmFtZXM6IG5hbWVzLCBzcGVjOiBhY2N9O1xuXG4gICAgZnVuY3Rpb24gd2FsayhwKSB7XG5cdGlmIChpc0NhcHR1cmUocCkpIHtcblx0ICAgIG5hbWVzLnB1c2goY2FwdHVyZU5hbWUocCkpO1xuXHQgICAgYWNjLnB1c2goU09DKTtcblx0ICAgIHdhbGsoY2FwdHVyZVBhdHRlcm4ocCkpO1xuXHQgICAgYWNjLnB1c2goRU9DKTtcblx0ICAgIHJldHVybjtcblx0fVxuXG5cdGlmIChBcnJheS5pc0FycmF5KHApKSB7XG5cdCAgICBhY2MucHVzaChTT0EpO1xuXHQgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBwLmxlbmd0aDsgaSsrKSB7XG5cdFx0d2FsayhwW2ldKTtcblx0ICAgIH1cblx0ICAgIGFjYy5wdXNoKEVPQSk7XG5cdCAgICByZXR1cm47XG5cdH1cblxuXHRpZiAocCBpbnN0YW5jZW9mICRFbWJlZGRlZCkge1xuXHQgICAgZGllKFwiQ2Fubm90IGVtYmVkIG1hdGNoZXIgaW4gcHJvamVjdGlvblwiKTtcblx0fSBlbHNlIHtcblx0ICAgIGlmIChwID09PSBfXykge1xuXHRcdGFjYy5wdXNoKHApO1xuXHQgICAgfSBlbHNlIHtcblx0XHRhY2MucHVzaChKU09OLnN0cmluZ2lmeShwKSk7XG5cdCAgICB9XG5cdH1cbiAgICB9XG59XG5cbmZ1bmN0aW9uIHByb2plY3Rpb25Ub1BhdHRlcm4ocCkge1xuICAgIHJldHVybiB3YWxrKHApO1xuXG4gICAgZnVuY3Rpb24gd2FsayhwKSB7XG5cdGlmIChpc0NhcHR1cmUocCkpIHJldHVybiB3YWxrKGNhcHR1cmVQYXR0ZXJuKHApKTtcblxuXHRpZiAoQXJyYXkuaXNBcnJheShwKSkge1xuXHQgICAgdmFyIHJlc3VsdCA9IFtdO1xuXHQgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBwLmxlbmd0aDsgaSsrKSB7XG5cdFx0cmVzdWx0LnB1c2god2FsayhwW2ldKSk7XG5cdCAgICB9XG5cdCAgICByZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0aWYgKHAgaW5zdGFuY2VvZiAkRW1iZWRkZWQpIHtcblx0ICAgIHJldHVybiBwLm1hdGNoZXI7XG5cdH0gZWxzZSB7XG5cdCAgICByZXR1cm4gcDtcblx0fVxuICAgIH1cbn1cblxuZnVuY3Rpb24gcHJvamVjdChtLCBjb21waWxlZFByb2plY3Rpb24pIHtcbiAgICB2YXIgc3BlYyA9IGNvbXBpbGVkUHJvamVjdGlvbi5zcGVjO1xuICAgIHJldHVybiB3YWxrKGZhbHNlLCBtLCAwKTtcblxuICAgIGZ1bmN0aW9uIHdhbGsoaXNDYXB0dXJpbmcsIG0sIHNwZWNJbmRleCkge1xuXHRpZiAoc3BlY0luZGV4ID49IHNwZWMubGVuZ3RoKSB7XG5cdCAgICBpZiAoaXNDYXB0dXJpbmcpIGRpZShcIkJhZCBzcGVjaWZpY2F0aW9uOiB1bmNsb3NlZCBjYXB0dXJlXCIpO1xuXHQgICAgaWYgKG0gaW5zdGFuY2VvZiAkU3VjY2Vzcykge1xuXHRcdHJldHVybiByc2VxKEVPQSwgcnN1Y2Nlc3MocHJvamVjdFN1Y2Nlc3MobS52YWx1ZSkpKTtcblx0ICAgIH0gZWxzZSB7XG5cdFx0cmV0dXJuIGVtcHR5TWF0Y2hlcjtcblx0ICAgIH1cblx0fVxuXG5cdGlmIChpc19lbXB0eU1hdGNoZXIobSkpIHJldHVybiBlbXB0eU1hdGNoZXI7XG5cblx0dmFyIGl0ZW0gPSBzcGVjW3NwZWNJbmRleF07XG5cdHZhciBuZXh0SW5kZXggPSBzcGVjSW5kZXggKyAxO1xuXG5cdGlmIChpdGVtID09PSBFT0MpIHtcblx0ICAgIGlmICghaXNDYXB0dXJpbmcpIGRpZShcIkJhZCBzcGVjaWZpY2F0aW9uOiB1bmVweGVjdGVkIEVPQ1wiKTtcblx0ICAgIHJldHVybiB3YWxrKGZhbHNlLCBtLCBuZXh0SW5kZXgpO1xuXHR9XG5cblx0aWYgKGl0ZW0gPT09IFNPQykge1xuXHQgICAgaWYgKGlzQ2FwdHVyaW5nKSBkaWUoXCJCYWQgc3BlY2lmaWNhdGlvbjogbmVzdGVkIGNhcHR1cmVcIik7XG5cdCAgICByZXR1cm4gd2Fsayh0cnVlLCBtLCBuZXh0SW5kZXgpO1xuXHR9XG5cblx0aWYgKGl0ZW0gPT09IF9fKSB7XG5cdCAgICBpZiAobSBpbnN0YW5jZW9mICRXaWxkY2FyZFNlcXVlbmNlKSB7XG5cdFx0aWYgKGlzQ2FwdHVyaW5nKSB7XG5cdFx0ICAgIHJldHVybiByd2lsZCh3YWxrKGlzQ2FwdHVyaW5nLCBtLCBuZXh0SW5kZXgpKTtcblx0XHR9IGVsc2Uge1xuXHRcdCAgICByZXR1cm4gd2Fsayhpc0NhcHR1cmluZywgbSwgbmV4dEluZGV4KTtcblx0XHR9XG5cdCAgICB9XG5cblx0ICAgIGlmIChtIGluc3RhbmNlb2YgJFN1Y2Nlc3MpIHtcblx0XHRyZXR1cm4gZW1wdHlNYXRjaGVyO1xuXHQgICAgfVxuXG5cdCAgICB2YXIgdGFyZ2V0O1xuXHQgICAgaWYgKGlzQ2FwdHVyaW5nKSB7XG5cdFx0dGFyZ2V0ID0gbmV3ICREaWN0KCk7XG5cdFx0cnVwZGF0ZUlucGxhY2UodGFyZ2V0LCBfXywgd2Fsayhpc0NhcHR1cmluZywgbS5nZXQoX18pLCBuZXh0SW5kZXgpKTtcblx0XHRmb3IgKHZhciBrZXkgaW4gbS5lbnRyaWVzKSB7XG5cdFx0ICAgIGlmIChrZXkgIT09IF9fKSB7XG5cdFx0XHR2YXIgbWsgPSBtLmdldChrZXkpO1xuXHRcdFx0aWYgKGlzX2tleU9wZW4oa2V5KSkge1xuXHRcdFx0ICAgIGZ1bmN0aW9uIGNvbnQobWsyKSB7IHJldHVybiB3YWxrKGlzQ2FwdHVyaW5nLCBtazIsIG5leHRJbmRleCk7IH1cblx0XHRcdCAgICBydXBkYXRlSW5wbGFjZSh0YXJnZXQsIGtleSwgY2FwdHVyZU5lc3RlZChtaywgY29udCkpO1xuXHRcdFx0fSBlbHNlIGlmIChpc19rZXlDbG9zZShrZXkpKSB7XG5cdFx0XHQgICAgLy8gZG8gbm90aGluZ1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdCAgICBydXBkYXRlSW5wbGFjZSh0YXJnZXQsIGtleSwgd2Fsayhpc0NhcHR1cmluZywgbWssIG5leHRJbmRleCkpO1xuXHRcdFx0fVxuXHRcdCAgICB9XG5cdFx0fVxuXHQgICAgfSBlbHNlIHtcblx0XHR0YXJnZXQgPSB3YWxrKGlzQ2FwdHVyaW5nLCBtLmdldChfXyksIG5leHRJbmRleCk7XG5cdFx0Zm9yICh2YXIga2V5IGluIG0uZW50cmllcykge1xuXHRcdCAgICBpZiAoa2V5ICE9PSBfXykge1xuXHRcdFx0dmFyIG1rID0gbS5nZXQoa2V5KTtcblx0XHRcdGlmIChpc19rZXlPcGVuKGtleSkpIHtcblx0XHRcdCAgICBmdW5jdGlvbiBjb250KG1rMikgeyByZXR1cm4gd2Fsayhpc0NhcHR1cmluZywgbWsyLCBuZXh0SW5kZXgpOyB9XG5cdFx0XHQgICAgdGFyZ2V0ID0gdW5pb24odGFyZ2V0LCBza2lwTmVzdGVkKG1rLCBjb250KSk7XG5cdFx0XHR9IGVsc2UgaWYgKGlzX2tleUNsb3NlKGtleSkpIHtcblx0XHRcdCAgICAvLyBkbyBub3RoaW5nXG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0ICAgIHRhcmdldCA9IHVuaW9uKHRhcmdldCwgd2Fsayhpc0NhcHR1cmluZywgbWssIG5leHRJbmRleCkpO1xuXHRcdFx0fVxuXHRcdCAgICB9XG5cdFx0fVxuXHQgICAgfVxuXHQgICAgcmV0dXJuIHRhcmdldDtcblx0fVxuXG5cdHZhciByZXN1bHQ7XG5cdGlmIChtIGluc3RhbmNlb2YgJFdpbGRjYXJkU2VxdWVuY2UpIHtcblx0ICAgIGlmIChpc19rZXlPcGVuKGl0ZW0pKSB7XG5cdFx0cmVzdWx0ID0gd2Fsayhpc0NhcHR1cmluZywgcndpbGRzZXEobSksIG5leHRJbmRleCk7XG5cdCAgICB9IGVsc2UgaWYgKGlzX2tleUNsb3NlKGl0ZW0pKSB7XG5cdFx0cmVzdWx0ID0gd2Fsayhpc0NhcHR1cmluZywgbS5tYXRjaGVyLCBuZXh0SW5kZXgpO1xuXHQgICAgfSBlbHNlIHtcblx0XHRyZXN1bHQgPSB3YWxrKGlzQ2FwdHVyaW5nLCBtLCBuZXh0SW5kZXgpO1xuXHQgICAgfVxuXHR9IGVsc2UgaWYgKG0gaW5zdGFuY2VvZiAkU3VjY2Vzcykge1xuXHQgICAgcmVzdWx0ID0gZW1wdHlNYXRjaGVyO1xuXHR9IGVsc2Uge1xuXHQgICAgaWYgKGlzX2tleU9wZW4oaXRlbSkpIHtcblx0XHRyZXN1bHQgPSB3YWxrKGlzQ2FwdHVyaW5nLCByd2lsZHNlcShtLmdldChfXykpLCBuZXh0SW5kZXgpO1xuXHQgICAgfSBlbHNlIGlmIChpc19rZXlDbG9zZShpdGVtKSkge1xuXHRcdHJlc3VsdCA9IGVtcHR5TWF0Y2hlcjtcblx0ICAgIH0gZWxzZSB7XG5cdFx0cmVzdWx0ID0gd2Fsayhpc0NhcHR1cmluZywgbS5nZXQoX18pLCBuZXh0SW5kZXgpO1xuXHQgICAgfVxuXHQgICAgcmVzdWx0ID0gdW5pb24ocmVzdWx0LCB3YWxrKGlzQ2FwdHVyaW5nLCBtLmdldChpdGVtKSwgbmV4dEluZGV4KSk7XG5cdH1cblx0aWYgKGlzQ2FwdHVyaW5nKSB7XG5cdCAgICByZXN1bHQgPSByc2VxKGl0ZW0sIHJlc3VsdCk7XG5cdH1cblx0cmV0dXJuIHJlc3VsdDtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBjYXB0dXJlTmVzdGVkKG0sIGNvbnQpIHtcblx0aWYgKG0gaW5zdGFuY2VvZiAkV2lsZGNhcmRTZXF1ZW5jZSkge1xuXHQgICAgcmV0dXJuIHJ3aWxkc2VxKGNvbnQobS5tYXRjaGVyKSk7XG5cdH1cblxuXHRpZiAoaXNfZW1wdHlNYXRjaGVyKG0pIHx8IChtIGluc3RhbmNlb2YgJFN1Y2Nlc3MpKSB7XG5cdCAgICByZXR1cm4gZW1wdHlNYXRjaGVyO1xuXHR9XG5cblx0dmFyIHRhcmdldCA9IG5ldyAkRGljdCgpO1xuXHRydXBkYXRlSW5wbGFjZSh0YXJnZXQsIF9fLCBjYXB0dXJlTmVzdGVkKG0uZ2V0KF9fKSwgY29udCkpO1xuXHRmb3IgKHZhciBrZXkgaW4gbS5lbnRyaWVzKSB7XG5cdCAgICBpZiAoa2V5ICE9PSBfXykge1xuXHRcdHZhciBtayA9IG0uZ2V0KGtleSk7XG5cdFx0aWYgKGlzX2tleU9wZW4oa2V5KSkge1xuXHRcdCAgICBmdW5jdGlvbiBjb250MihtazIpIHsgcmV0dXJuIGNhcHR1cmVOZXN0ZWQobWsyLCBjb250KTsgfVxuXHRcdCAgICBydXBkYXRlSW5wbGFjZSh0YXJnZXQsIGtleSwgY2FwdHVyZU5lc3RlZChtaywgY29udDIpKTtcblx0XHR9IGVsc2UgaWYgKGlzX2tleUNsb3NlKGtleSkpIHtcblx0XHQgICAgcnVwZGF0ZUlucGxhY2UodGFyZ2V0LCBrZXksIGNvbnQobWspKTtcblx0XHR9IGVsc2Uge1xuXHRcdCAgICBydXBkYXRlSW5wbGFjZSh0YXJnZXQsIGtleSwgY2FwdHVyZU5lc3RlZChtaywgY29udCkpO1xuXHRcdH1cblx0ICAgIH1cblx0fVxuXHRyZXR1cm4gdGFyZ2V0LmVtcHR5R3VhcmQoKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBza2lwTmVzdGVkKG0sIGNvbnQpIHtcblx0aWYgKG0gaW5zdGFuY2VvZiAkV2lsZGNhcmRTZXF1ZW5jZSkge1xuXHQgICAgcmV0dXJuIGNvbnQobS5tYXRjaGVyKTtcblx0fVxuXG5cdGlmIChpc19lbXB0eU1hdGNoZXIobSkgfHwgKG0gaW5zdGFuY2VvZiAkU3VjY2VzcykpIHtcblx0ICAgIHJldHVybiBlbXB0eU1hdGNoZXI7XG5cdH1cblxuXHR2YXIgdGFyZ2V0ID0gc2tpcE5lc3RlZChtLmdldChfXyksIGNvbnQpO1xuXHRmb3IgKHZhciBrZXkgaW4gbS5lbnRyaWVzKSB7XG5cdCAgICBpZiAoa2V5ICE9PSBfXykge1xuXHRcdHZhciBtayA9IG0uZ2V0KGtleSk7XG5cdFx0aWYgKGlzX2tleU9wZW4oa2V5KSkge1xuXHRcdCAgICBmdW5jdGlvbiBjb250MihtazIpIHsgcmV0dXJuIHNraXBOZXN0ZWQobWsyLCBjb250KTsgfVxuXHRcdCAgICB0YXJnZXQgPSB1bmlvbih0YXJnZXQsIHNraXBOZXN0ZWQobWssIGNvbnQyKSk7XG5cdFx0fSBlbHNlIGlmIChpc19rZXlDbG9zZShrZXkpKSB7XG5cdFx0ICAgIHRhcmdldCA9IHVuaW9uKHRhcmdldCwgY29udChtaykpO1xuXHRcdH0gZWxzZSB7XG5cdFx0ICAgIHRhcmdldCA9IHVuaW9uKHRhcmdldCwgc2tpcE5lc3RlZChtaywgY29udCkpO1xuXHRcdH1cblx0ICAgIH1cblx0fVxuXHRyZXR1cm4gdGFyZ2V0O1xuICAgIH1cbn1cblxuZnVuY3Rpb24gbWF0Y2hlcktleXMobSkge1xuICAgIGlmIChpc19lbXB0eU1hdGNoZXIobSkpIHJldHVybiBbXTtcbiAgICByZXR1cm4gd2Fsa1NlcShtLCBmdW5jdGlvbiAodnNzLCB2c2spIHsgcmV0dXJuIHZzczsgfSk7XG5cbiAgICBmdW5jdGlvbiB3YWxrKG0sIGspIHtcblx0aWYgKG0gaW5zdGFuY2VvZiAkV2lsZGNhcmRTZXF1ZW5jZSkgcmV0dXJuIG51bGw7XG5cdGlmIChtIGluc3RhbmNlb2YgJFN1Y2Nlc3MpIHJldHVybiBbXTtcblx0aWYgKG0uaGFzKF9fKSkgcmV0dXJuIG51bGw7XG5cdHZhciBhY2MgPSBbXTtcblx0Zm9yICh2YXIga2V5IGluIG0uZW50cmllcykge1xuXHQgICAgdmFyIG1rID0gbS5nZXQoa2V5KTtcblx0ICAgIHZhciBwaWVjZTtcblx0ICAgIGlmIChpc19rZXlPcGVuKGtleSkpIHtcblx0XHRmdW5jdGlvbiBzZXFLKHZzcywgdnNrKSB7XG5cdFx0ICAgIHZhciBhY2MgPSBbXTtcblx0XHQgICAgZm9yICh2YXIgaSA9IDA7IGkgPCB2c3MubGVuZ3RoOyBpKyspIHtcblx0XHRcdHZhciB2cyA9IHZzc1tpXTtcblx0XHRcdGFjYyA9IGFjYy5jb25jYXQoayh0cmFuc2Zvcm1TZXFzKHZzLCBrZXkpLCB2c2spKTtcblx0XHQgICAgfVxuXHRcdCAgICByZXR1cm4gYWNjO1xuXHRcdH1cblx0XHRwaWVjZSA9IHdhbGtTZXEobWssIHNlcUspO1xuXHQgICAgfSBlbHNlIGlmIChpc19rZXlDbG9zZShrZXkpKSB7XG5cdFx0ZGllKFwibWF0Y2hlcktleXM6IGludGVybmFsIGVycm9yOiB1bmV4cGVjdGVkIGtleS1jbG9zZVwiKTtcblx0ICAgIH0gZWxzZSB7XG5cdFx0cGllY2UgPSBrKEpTT04ucGFyc2Uoa2V5KSwgbWspO1xuXHQgICAgfVxuXHQgICAgaWYgKHBpZWNlID09IG51bGwpIHJldHVybiBudWxsO1xuXHQgICAgYWNjID0gYWNjLmNvbmNhdChwaWVjZSk7XG5cdH1cblx0cmV0dXJuIGFjYztcbiAgICB9XG5cbiAgICBmdW5jdGlvbiB3YWxrU2VxKG0sIGspIHtcblx0aWYgKG0gaW5zdGFuY2VvZiAkV2lsZGNhcmRTZXF1ZW5jZSkgcmV0dXJuIG51bGw7XG5cdGlmIChtIGluc3RhbmNlb2YgJFN1Y2Nlc3MpIHJldHVybiBrKFtdLCBlbXB0eU1hdGNoZXIpOyAvLyBUT0RPOiA/P1xuXHRpZiAobS5oYXMoX18pKSByZXR1cm4gbnVsbDtcblx0dmFyIGFjYyA9IFtdO1xuXHRmb3IgKHZhciBrZXkgaW4gbS5lbnRyaWVzKSB7XG5cdCAgICB2YXIgbWsgPSBtLmdldChrZXkpO1xuXHQgICAgdmFyIHBpZWNlO1xuXHQgICAgaWYgKGlzX2tleUNsb3NlKGtleSkpIHtcblx0XHRwaWVjZSA9IGsoW1tdXSwgbWspO1xuXHQgICAgfSBlbHNlIHtcblx0XHRmdW5jdGlvbiBvdXRlcksodiwgdmspIHtcblx0XHQgICAgcmV0dXJuIHdhbGtTZXEodmssIGlubmVySyk7XG5cdFx0ICAgIGZ1bmN0aW9uIGlubmVySyh2c3MsIHZzaykge1xuXHRcdFx0dmFyIGFjYyA9IFtdO1xuXHRcdFx0Zm9yICh2YXIgaSA9IDA7IGkgPCB2c3MubGVuZ3RoOyBpKyspIHtcblx0XHRcdCAgICB2YXIgdnMgPSBzaGFsbG93Q29weUFycmF5KHZzc1tpXSk7XG5cdFx0XHQgICAgdnMudW5zaGlmdCh2KTtcblx0XHRcdCAgICBhY2MucHVzaCh2cyk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gayhhY2MsIHZzayk7XG5cdFx0ICAgIH1cblx0XHR9XG5cdFx0cGllY2UgPSB3YWxrKHJzZXEoa2V5LCBtayksIG91dGVySyk7XG5cdCAgICB9XG5cdCAgICBpZiAocGllY2UgPT0gbnVsbCkgcmV0dXJuIG51bGw7XG5cdCAgICBhY2MgPSBhY2MuY29uY2F0KHBpZWNlKTtcblx0fVxuXHRyZXR1cm4gYWNjO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHRyYW5zZm9ybVNlcXModnMsIG9wZW5lcikge1xuXHRpZiAob3BlbmVyID09PSBTT0EpIHJldHVybiB2cztcblx0ZGllKFwiSW50ZXJuYWwgZXJyb3I6IHVua25vd24gb3BlbmVyIFwiICsgb3BlbmVyKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIG1hdGNoZXJLZXlzVG9PYmplY3RzKG1hdGNoZXJLZXlzUmVzdWx0LCBjb21waWxlZFByb2plY3Rpb24pIHtcbiAgICBpZiAobWF0Y2hlcktleXNSZXN1bHQgPT09IG51bGwpIHJldHVybiBudWxsO1xuICAgIHZhciByZXN1bHQgPSBbXTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IG1hdGNoZXJLZXlzUmVzdWx0Lmxlbmd0aDsgaSsrKSB7XG5cdHZhciBlID0gbWF0Y2hlcktleXNSZXN1bHRbaV07XG5cdHZhciBkID0ge307XG5cdGZvciAodmFyIGogPSAwOyBqIDwgZS5sZW5ndGg7IGorKykge1xuXHQgICAgZFtjb21waWxlZFByb2plY3Rpb24ubmFtZXNbal0gfHwgKCckJyArIGopXSA9IGVbal07XG5cdH1cblx0cmVzdWx0LnB1c2goZCk7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG59XG5cbmZ1bmN0aW9uIHByb2plY3RPYmplY3RzKG0sIGNvbXBpbGVkUHJvamVjdGlvbikge1xuICAgIHJldHVybiBtYXRjaGVyS2V5c1RvT2JqZWN0cyhtYXRjaGVyS2V5cyhwcm9qZWN0KG0sIGNvbXBpbGVkUHJvamVjdGlvbikpLCBjb21waWxlZFByb2plY3Rpb24pO1xufVxuXG5mdW5jdGlvbiBwcmV0dHlNYXRjaGVyKG0sIGluaXRpYWxJbmRlbnQpIHtcbiAgICB2YXIgYWNjID0gW107XG4gICAgd2Fsayhpbml0aWFsSW5kZW50IHx8IDAsIG0pO1xuICAgIHJldHVybiBhY2Muam9pbignJyk7XG5cbiAgICBmdW5jdGlvbiB3YWxrKGksIG0pIHtcblx0aWYgKGlzX2VtcHR5TWF0Y2hlcihtKSkge1xuXHQgICAgYWNjLnB1c2goXCI6Ojogbm8gZnVydGhlciBtYXRjaGVzIHBvc3NpYmxlXCIpO1xuXHQgICAgcmV0dXJuO1xuXHR9XG5cdGlmIChtIGluc3RhbmNlb2YgJFdpbGRjYXJkU2VxdWVuY2UpIHtcblx0ICAgIGFjYy5wdXNoKFwiLi4uPlwiKTtcblx0ICAgIHdhbGsoaSArIDQsIG0ubWF0Y2hlcik7XG5cdCAgICByZXR1cm47XG5cdH1cblx0aWYgKG0gaW5zdGFuY2VvZiAkU3VjY2Vzcykge1xuXHQgICAgdmFyIHZzID0gSlNPTi5zdHJpbmdpZnkodHlwZW9mIG0udmFsdWUgPT09ICdvYmplY3QnXG5cdFx0XHRcdCAgICA/IHNldFRvQXJyYXkobS52YWx1ZSlcblx0XHRcdFx0ICAgIDogbS52YWx1ZSk7XG5cdCAgICBhY2MucHVzaChcIntcIiArIHZzICsgXCJ9XCIpO1xuXHQgICAgcmV0dXJuO1xuXHR9XG5cblx0aWYgKG0ubGVuZ3RoID09PSAwKSB7XG5cdCAgICBhY2MucHVzaChcIiA6OjogZW1wdHkgaGFzaCFcIik7XG5cdCAgICByZXR1cm47XG5cdH1cblxuXHR2YXIgbmVlZFNlcCA9IGZhbHNlO1xuXHR2YXIga2V5cyA9IG0uc29ydGVkS2V5cygpO1xuXHRmb3IgKHZhciBrZXlpID0gMDsga2V5aSA8IGtleXMubGVuZ3RoOyBrZXlpKyspIHtcblx0ICAgIHZhciBrZXkgPSBrZXlzW2tleWldO1xuXHQgICAgdmFyIGsgPSBtLmVudHJpZXNba2V5XTtcblx0ICAgIGlmIChuZWVkU2VwKSB7XG5cdFx0YWNjLnB1c2goXCJcXG5cIik7XG5cdFx0YWNjLnB1c2goaW5kZW50U3RyKGkpKTtcblx0ICAgIH0gZWxzZSB7XG5cdFx0bmVlZFNlcCA9IHRydWU7XG5cdCAgICB9XG5cdCAgICBhY2MucHVzaChcIiBcIik7XG5cdCAgICBpZiAoa2V5ID09PSBfXykga2V5ID0gJ+KYhSc7XG5cdCAgICBpZiAoa2V5ID09PSBTT0EpIGtleSA9ICc8Jztcblx0ICAgIGlmIChrZXkgPT09IEVPQSkga2V5ID0gJz4nO1xuXHQgICAgYWNjLnB1c2goa2V5KTtcblx0ICAgIHdhbGsoaSArIGtleS5sZW5ndGggKyAxLCBrKTtcblx0fVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGluZGVudFN0cihpKSB7XG5cdHJldHVybiBuZXcgQXJyYXkoaSArIDEpLmpvaW4oJyAnKTsgLy8gZXd3XG4gICAgfVxufVxuXG5mdW5jdGlvbiBzZXJpYWxpemVNYXRjaGVyKG0sIHNlcmlhbGl6ZVN1Y2Nlc3MpIHtcbiAgICByZXR1cm4gd2FsayhtKTtcbiAgICBmdW5jdGlvbiB3YWxrKG0pIHtcblx0aWYgKGlzX2VtcHR5TWF0Y2hlcihtKSkgcmV0dXJuIFtdO1xuXHRpZiAobSBpbnN0YW5jZW9mICRXaWxkY2FyZFNlcXVlbmNlKSB7XG5cdCAgICByZXR1cm4gW1wiLi4uKVwiLCB3YWxrKG0ubWF0Y2hlcildO1xuXHR9XG5cdGlmIChtIGluc3RhbmNlb2YgJFN1Y2Nlc3MpIHtcblx0ICAgIHJldHVybiBbXCJcIiwgc2VyaWFsaXplU3VjY2VzcyhtLnZhbHVlKV07XG5cdH1cblx0dmFyIGFjYyA9IFtdO1xuXHRmb3IgKHZhciBrZXkgaW4gbS5lbnRyaWVzKSB7XG5cdCAgICB2YXIgayA9IG0uZW50cmllc1trZXldO1xuXHQgICAgaWYgKGtleSA9PT0gX18pIGtleSA9IFtcIl9fXCJdO1xuXHQgICAgZWxzZSBpZiAoa2V5ID09PSBTT0EpIGtleSA9IFtcIihcIl07XG5cdCAgICBlbHNlIGlmIChrZXkgPT09IEVPQSkga2V5ID0gW1wiKVwiXTtcblx0ICAgIGVsc2Uga2V5ID0gSlNPTi5wYXJzZShrZXkpO1xuXHQgICAgYWNjLnB1c2goW2tleSwgd2FsayhrKV0pO1xuXHR9XG5cdHJldHVybiBhY2M7XG4gICAgfVxufVxuXG5mdW5jdGlvbiBkZXNlcmlhbGl6ZU1hdGNoZXIociwgZGVzZXJpYWxpemVTdWNjZXNzKSB7XG4gICAgcmV0dXJuIHdhbGsocik7XG4gICAgZnVuY3Rpb24gd2FsayhyKSB7XG5cdGlmIChyLmxlbmd0aCA9PT0gMCkgcmV0dXJuIGVtcHR5TWF0Y2hlcjtcblx0aWYgKHJbMF0gPT09IFwiLi4uKVwiKSByZXR1cm4gcndpbGRzZXEod2FsayhyWzFdKSk7XG5cdGlmIChyWzBdID09PSBcIlwiKSByZXR1cm4gcnN1Y2Nlc3MoZGVzZXJpYWxpemVTdWNjZXNzKHJbMV0pKTtcblx0dmFyIGFjYyA9IG5ldyAkRGljdCgpO1xuXHRmb3IgKHZhciBpID0gMDsgaSA8IHIubGVuZ3RoOyBpKyspIHtcblx0ICAgIHZhciBya2V5ID0gcltpXVswXTtcblx0ICAgIHZhciByayA9IHJbaV1bMV07XG5cdCAgICB2YXIga2V5O1xuXHQgICAgaWYgKEFycmF5LmlzQXJyYXkocmtleSkpIHtcblx0XHRzd2l0Y2ggKHJrZXlbMF0pIHtcblx0XHRjYXNlIFwiX19cIjoga2V5ID0gX187IGJyZWFrO1xuXHRcdGNhc2UgXCIoXCI6IGtleSA9IFNPQTsgYnJlYWs7XG5cdFx0Y2FzZSBcIilcIjoga2V5ID0gRU9BOyBicmVhaztcblx0XHRkZWZhdWx0OiBkaWUoXCJJbnZhbGlkIHNlcmlhbGl6ZWQgc3BlY2lhbCBrZXk6IFwiICsgcmtleVswXSk7XG5cdFx0fVxuXHQgICAgfSBlbHNlIHtcblx0XHRrZXkgPSBKU09OLnN0cmluZ2lmeShya2V5KTtcblx0ICAgIH1cblx0ICAgIHJ1cGRhdGVJbnBsYWNlKGFjYywga2V5LCB3YWxrKHJrKSk7XG5cdH1cblx0cmV0dXJuIGFjYztcbiAgICB9XG59XG5cbi8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuLy8gR2VzdGFsdHMuXG4vLyBUT0RPOiBzdXBwb3J0IEluZmluaXR5IGFzIGEgbGV2ZWwgbnVtYmVyXG5cbmZ1bmN0aW9uIEdlc3RhbHRMZXZlbChzdWJzLCBhZHZzKSB7XG4gICAgdGhpcy5zdWJzY3JpcHRpb25zID0gc3VicztcbiAgICB0aGlzLmFkdmVydGlzZW1lbnRzID0gYWR2cztcbn1cblxuR2VzdGFsdExldmVsLnByb3RvdHlwZS5pc0VtcHR5ID0gZnVuY3Rpb24gKCkge1xuICAgIHJldHVybiBpc19lbXB0eU1hdGNoZXIodGhpcy5zdWJzY3JpcHRpb25zKSAmJiBpc19lbXB0eU1hdGNoZXIodGhpcy5hZHZlcnRpc2VtZW50cyk7XG59O1xuXG5HZXN0YWx0TGV2ZWwucHJvdG90eXBlLmVxdWFscyA9IGZ1bmN0aW9uIChvdGhlcikge1xuICAgIHJldHVybiBtYXRjaGVyRXF1YWxzKHRoaXMuc3Vic2NyaXB0aW9ucywgb3RoZXIuc3Vic2NyaXB0aW9ucylcblx0JiYgbWF0Y2hlckVxdWFscyh0aGlzLmFkdmVydGlzZW1lbnRzLCBvdGhlci5hZHZlcnRpc2VtZW50cyk7XG59O1xuXG5HZXN0YWx0TGV2ZWwucHJvdG90eXBlLnByZXR0eSA9IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgYWNjID0gW107XG4gICAgaWYgKCFpc19lbXB0eU1hdGNoZXIodGhpcy5zdWJzY3JpcHRpb25zKSkge1xuXHRhY2MucHVzaChcIiAgLSBzdWJzOlwiKTtcblx0YWNjLnB1c2gocHJldHR5TWF0Y2hlcih0aGlzLnN1YnNjcmlwdGlvbnMsIDkpKTtcblx0YWNjLnB1c2goXCJcXG5cIik7XG4gICAgfVxuICAgIGlmICghaXNfZW1wdHlNYXRjaGVyKHRoaXMuYWR2ZXJ0aXNlbWVudHMpKSB7XG5cdGFjYy5wdXNoKFwiICAtIGFkdnM6XCIpO1xuXHRhY2MucHVzaChwcmV0dHlNYXRjaGVyKHRoaXMuYWR2ZXJ0aXNlbWVudHMsIDkpKTtcblx0YWNjLnB1c2goXCJcXG5cIik7XG4gICAgfVxuICAgIHJldHVybiBhY2Muam9pbignJyk7XG59O1xuXG5mdW5jdGlvbiBzdHJhaWdodEdlc3RhbHRMZXZlbE9wKG9wKSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uIChwMSwgcDIpIHtcblx0cmV0dXJuIG5ldyBHZXN0YWx0TGV2ZWwob3AocDEuc3Vic2NyaXB0aW9ucywgcDIuc3Vic2NyaXB0aW9ucyksXG5cdFx0XHRcdG9wKHAxLmFkdmVydGlzZW1lbnRzLCBwMi5hZHZlcnRpc2VtZW50cykpO1xuICAgIH07XG59O1xuXG52YXIgZW1wdHlMZXZlbCA9IG5ldyBHZXN0YWx0TGV2ZWwoZW1wdHlNYXRjaGVyLCBlbXB0eU1hdGNoZXIpO1xudmFyIGVtcHR5TWV0YUxldmVsID0gW107XG5cbmZ1bmN0aW9uIEdlc3RhbHQobWV0YUxldmVscykge1xuICAgIHRoaXMubWV0YUxldmVscyA9IG1ldGFMZXZlbHM7XG59XG5cbkdlc3RhbHQucHJvdG90eXBlLmdldE1ldGFMZXZlbCA9IGZ1bmN0aW9uIChuKSB7XG4gICAgcmV0dXJuIHRoaXMubWV0YUxldmVsc1tuXSB8fCBlbXB0eU1ldGFMZXZlbDtcbn07XG5cbkdlc3RhbHQucHJvdG90eXBlLmdldExldmVsID0gZnVuY3Rpb24gKG1ldGFMZXZlbCwgbGV2ZWwpIHtcbiAgICByZXR1cm4gdGhpcy5nZXRNZXRhTGV2ZWwobWV0YUxldmVsKVtsZXZlbF0gfHwgZW1wdHlMZXZlbDtcbn07XG5cbkdlc3RhbHQucHJvdG90eXBlLm1ldGFMZXZlbENvdW50ID0gZnVuY3Rpb24gKCkgeyByZXR1cm4gdGhpcy5tZXRhTGV2ZWxzLmxlbmd0aDsgfTtcbkdlc3RhbHQucHJvdG90eXBlLmxldmVsQ291bnQgPSBmdW5jdGlvbiAobikgeyByZXR1cm4gdGhpcy5nZXRNZXRhTGV2ZWwobikubGVuZ3RoOyB9O1xuXG5HZXN0YWx0LnByb3RvdHlwZS5tYXRjaFZhbHVlID0gZnVuY3Rpb24gKGJvZHksIG1ldGFMZXZlbCwgaXNGZWVkYmFjaykge1xuICAgIHZhciBsZXZlbHMgPSB0aGlzLmdldE1ldGFMZXZlbChtZXRhTGV2ZWwpO1xuICAgIHZhciBwaWRzID0ge307XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsZXZlbHMubGVuZ3RoOyBpKyspIHtcblx0dmFyIG1hdGNoZXIgPSAoaXNGZWVkYmFjayA/IGxldmVsc1tpXS5hZHZlcnRpc2VtZW50cyA6IGxldmVsc1tpXS5zdWJzY3JpcHRpb25zKTtcblx0c2V0VW5pb25JbnBsYWNlKHBpZHMsIG1hdGNoVmFsdWUobWF0Y2hlciwgYm9keSkpO1xuICAgIH1cbiAgICByZXR1cm4gc2V0VG9BcnJheShwaWRzKTtcbn07XG5cbkdlc3RhbHQucHJvdG90eXBlLnByb2plY3QgPSBmdW5jdGlvbiAoc3BlYywgZ2V0QWR2ZXJ0aXNlbWVudHMsIG1ldGFMZXZlbCwgbGV2ZWwpIHtcbiAgICB2YXIgbCA9IHRoaXMuZ2V0TGV2ZWwobWV0YUxldmVsIHwgMCwgbGV2ZWwgfCAwKTtcbiAgICB2YXIgbWF0Y2hlciA9IChnZXRBZHZlcnRpc2VtZW50cyA/IGwuYWR2ZXJ0aXNlbWVudHMgOiBsLnN1YnNjcmlwdGlvbnMpO1xuICAgIHJldHVybiBwcm9qZWN0KG1hdGNoZXIsIHNwZWMpO1xufTtcblxuR2VzdGFsdC5wcm90b3R5cGUuZHJvcCA9IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgbWxzID0gc2hhbGxvd0NvcHlBcnJheSh0aGlzLm1ldGFMZXZlbHMpO1xuICAgIG1scy5zaGlmdCgpO1xuICAgIHJldHVybiBuZXcgR2VzdGFsdChtbHMpO1xufTtcblxuR2VzdGFsdC5wcm90b3R5cGUubGlmdCA9IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgbWxzID0gc2hhbGxvd0NvcHlBcnJheSh0aGlzLm1ldGFMZXZlbHMpO1xuICAgIG1scy51bnNoaWZ0KGVtcHR5TWV0YUxldmVsKTtcbiAgICByZXR1cm4gbmV3IEdlc3RhbHQobWxzKTtcbn07XG5cbkdlc3RhbHQucHJvdG90eXBlLmVxdWFscyA9IGZ1bmN0aW9uIChvdGhlcikge1xuICAgIGlmICh0aGlzLm1ldGFMZXZlbHMubGVuZ3RoICE9PSBvdGhlci5tZXRhTGV2ZWxzLmxlbmd0aCkgcmV0dXJuIGZhbHNlO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5tZXRhTGV2ZWxzLmxlbmd0aDsgaSsrKSB7XG5cdHZhciBsczEgPSB0aGlzLm1ldGFMZXZlbHNbaV07XG5cdHZhciBsczIgPSBvdGhlci5tZXRhTGV2ZWxzW2ldO1xuXHRpZiAobHMxLmxlbmd0aCAhPT0gbHMyLmxlbmd0aCkgcmV0dXJuIGZhbHNlO1xuXHRmb3IgKHZhciBqID0gMDsgaiA8IGxzMS5sZW5ndGg7IGorKykge1xuXHQgICAgdmFyIHAxID0gbHMxW2pdO1xuXHQgICAgdmFyIHAyID0gbHMyW2pdO1xuXHQgICAgaWYgKCFwMS5lcXVhbHMocDIpKSByZXR1cm4gZmFsc2U7XG5cdH1cbiAgICB9XG4gICAgcmV0dXJuIHRydWU7XG59O1xuXG5mdW5jdGlvbiBzaW1wbGVHZXN0YWx0KGlzQWR2LCBwYXQsIG1ldGFMZXZlbCwgbGV2ZWwpIHtcbiAgICBtZXRhTGV2ZWwgPSBtZXRhTGV2ZWwgfHwgMDtcbiAgICBsZXZlbCA9IGxldmVsIHx8IDA7XG4gICAgdmFyIG1hdGNoZXIgPSBjb21waWxlUGF0dGVybih0cnVlLCBwYXQpO1xuICAgIHZhciBsID0gbmV3IEdlc3RhbHRMZXZlbChpc0FkdiA/IGVtcHR5TWF0Y2hlciA6IG1hdGNoZXIsXG5cdFx0XHQgICAgIGlzQWR2ID8gbWF0Y2hlciA6IGVtcHR5TWF0Y2hlcik7XG4gICAgdmFyIGxldmVscyA9IFtsXTtcbiAgICB3aGlsZSAobGV2ZWwtLSkgeyBsZXZlbHMudW5zaGlmdChlbXB0eUxldmVsKTsgfVxuICAgIHZhciBtZXRhTGV2ZWxzID0gW2xldmVsc107XG4gICAgd2hpbGUgKG1ldGFMZXZlbC0tKSB7IG1ldGFMZXZlbHMudW5zaGlmdChlbXB0eU1ldGFMZXZlbCk7IH1cbiAgICByZXR1cm4gbmV3IEdlc3RhbHQobWV0YUxldmVscyk7XG59XG5cbnZhciBlbXB0eUdlc3RhbHQgPSBuZXcgR2VzdGFsdChbXSk7XG5cbi8vIE5vdCBxdWl0ZSB3aGF0IGl0IHNheXMgb24gdGhlIHRpbiAtIHRoZSB0cnVlIGZ1bGxHZXN0YWx0XG4vLyB3b3VsZG4ndCBiZSBwYXJhbWV0ZXJpemVkIG9uIHRoZSBudW1iZXIgb2YgbGV2ZWxzIGFuZFxuLy8gbWV0YWxldmVscywgYnV0IGluc3RlYWQgd291bGQgYmUgZnVsbCBhdCAqYWxsKiBsZXZlbHMgYW5kXG4vLyBtZXRhbGV2ZWxzLiBPdXIgcmVwcmVzZW50YXRpb24gbGVha3MgdGhyb3VnaCBpbnRvIHRoZSBpbnRlcmZhY2Vcbi8vIGhlcmUgOi0vXG5mdW5jdGlvbiBmdWxsR2VzdGFsdChuTWV0YWxldmVscywgbkxldmVscykge1xuICAgIHZhciBtYXRjaGVyID0gY29tcGlsZVBhdHRlcm4odHJ1ZSwgX18pO1xuICAgIHZhciBsID0gbmV3IEdlc3RhbHRMZXZlbChtYXRjaGVyLCBtYXRjaGVyKTtcbiAgICB2YXIgbGV2ZWxzID0gW107XG4gICAgd2hpbGUgKG5MZXZlbHMtLSkgeyBsZXZlbHMucHVzaChsKTsgfVxuICAgIHZhciBtZXRhTGV2ZWxzID0gW107XG4gICAgd2hpbGUgKG5NZXRhbGV2ZWxzLS0pIHsgbWV0YUxldmVscy5wdXNoKGxldmVscyk7IH1cbiAgICByZXR1cm4gbmV3IEdlc3RhbHQobWV0YUxldmVscyk7XG59XG5cbkdlc3RhbHQucHJvdG90eXBlLmlzRW1wdHkgPSBmdW5jdGlvbiAoKSB7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLm1ldGFMZXZlbHMubGVuZ3RoOyBpKyspIHtcblx0dmFyIGxldmVscyA9IHRoaXMubWV0YUxldmVsc1tpXTtcblx0Zm9yICh2YXIgaiA9IDA7IGogPCBsZXZlbHMubGVuZ3RoOyBqKyspIHtcblx0ICAgIGlmICghbGV2ZWxzW2pdLmlzRW1wdHkoKSkgcmV0dXJuIGZhbHNlO1xuXHR9XG4gICAgfVxuICAgIHJldHVybiB0cnVlO1xufTtcblxuZnVuY3Rpb24gbWF5YmVQdXNoTGV2ZWwobGV2ZWxzLCBpLCBsZXZlbCkge1xuICAgIGlmICghbGV2ZWwuaXNFbXB0eSgpKSB7XG5cdHdoaWxlIChsZXZlbHMubGVuZ3RoIDwgaSkgbGV2ZWxzLnB1c2goZW1wdHlMZXZlbCk7XG5cdGxldmVscy5wdXNoKGxldmVsKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIG1heWJlUHVzaE1ldGFMZXZlbChtZXRhTGV2ZWxzLCBpLCBtZXRhTGV2ZWwpIHtcbiAgICBpZiAobWV0YUxldmVsLmxlbmd0aCA+IDApIHtcblx0d2hpbGUgKG1ldGFMZXZlbHMubGVuZ3RoIDwgaSkgbWV0YUxldmVscy5wdXNoKGVtcHR5TWV0YUxldmVsKTtcblx0bWV0YUxldmVscy5wdXNoKG1ldGFMZXZlbCk7XG4gICAgfVxufVxuXG5HZXN0YWx0LnByb3RvdHlwZS5tYXBaaXAgPSBmdW5jdGlvbiAob3RoZXIsIGxlbmd0aENvbWJpbmVyLCBmKSB7XG4gICAgdmFyIG1ldGFMZXZlbHMgPSBbXTtcbiAgICB2YXIgbWxzMSA9IHRoaXMubWV0YUxldmVscztcbiAgICB2YXIgbWxzMiA9IG90aGVyLm1ldGFMZXZlbHM7XG4gICAgdmFyIG5tID0gbGVuZ3RoQ29tYmluZXIobWxzMS5sZW5ndGgsIG1sczIubGVuZ3RoKTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IG5tOyBpKyspIHtcblx0dmFyIGxldmVscyA9IFtdO1xuXHR2YXIgbHMxID0gbWxzMVtpXSB8fCBlbXB0eU1ldGFMZXZlbDtcblx0dmFyIGxzMiA9IG1sczJbaV0gfHwgZW1wdHlNZXRhTGV2ZWw7XG5cdHZhciBubCA9IGxlbmd0aENvbWJpbmVyKGxzMS5sZW5ndGgsIGxzMi5sZW5ndGgpO1xuXHRmb3IgKHZhciBqID0gMDsgaiA8IG5sOyBqKyspIHtcblx0ICAgIHZhciBwMSA9IGxzMVtqXSB8fCBlbXB0eUxldmVsO1xuXHQgICAgdmFyIHAyID0gbHMyW2pdIHx8IGVtcHR5TGV2ZWw7XG5cdCAgICB2YXIgcCA9IGYocDEsIHAyKTtcblx0ICAgIG1heWJlUHVzaExldmVsKGxldmVscywgaiwgcCk7XG5cdH1cblx0bWF5YmVQdXNoTWV0YUxldmVsKG1ldGFMZXZlbHMsIGksIGxldmVscyk7XG4gICAgfVxuICAgIHJldHVybiBuZXcgR2VzdGFsdChtZXRhTGV2ZWxzKTtcbn07XG5cbkdlc3RhbHQucHJvdG90eXBlLnVuaW9uMSA9IGZ1bmN0aW9uIChvdGhlcikge1xuICAgIHJldHVybiB0aGlzLm1hcFppcChvdGhlciwgTWF0aC5tYXgsIHN0cmFpZ2h0R2VzdGFsdExldmVsT3AodW5pb24pKTtcbn07XG5cbmZ1bmN0aW9uIGdlc3RhbHRVbmlvbihncykge1xuICAgIGlmIChncy5sZW5ndGggPT09IDApIHJldHVybiBlbXB0eUdlc3RhbHQ7XG4gICAgdmFyIGFjYyA9IGdzWzBdO1xuICAgIGZvciAodmFyIGkgPSAxOyBpIDwgZ3MubGVuZ3RoOyBpKyspIHtcblx0YWNjID0gYWNjLnVuaW9uMShnc1tpXSk7XG4gICAgfVxuICAgIHJldHVybiBhY2M7XG59XG5cbkdlc3RhbHQucHJvdG90eXBlLnVuaW9uID0gZnVuY3Rpb24gKCkge1xuICAgIHJldHVybiBhcmd1bWVudHMubGVuZ3RoID4gMCA/IHRoaXMudW5pb24xKGdlc3RhbHRVbmlvbihhcmd1bWVudHMpKSA6IHRoaXM7XG59O1xuXG4vLyBBY2N1bXVsYXRlcyBtYXRjaGVycyBmcm9tIGhpZ2hlci1udW1iZXJlZCBsZXZlbHMgaW50b1xuLy8gbG93ZXItbnVtYmVyZWQgbGV2ZWxzLlxuZnVuY3Rpb24gdGVsZXNjb3BlTGV2ZWxzKGxldmVscykge1xuICAgIHZhciByZXN1bHQgPSBzaGFsbG93Q29weUFycmF5KGxldmVscyk7XG4gICAgZm9yICh2YXIgaSA9IHJlc3VsdC5sZW5ndGggLSAyOyBpID49IDA7IGktLSkge1xuXHRyZXN1bHRbaV0gPVxuXHQgICAgbmV3IEdlc3RhbHRMZXZlbCh1bmlvbihyZXN1bHRbaV0uc3Vic2NyaXB0aW9ucywgcmVzdWx0W2krMV0uc3Vic2NyaXB0aW9ucyksXG5cdFx0XHQgICAgIHVuaW9uKHJlc3VsdFtpXS5hZHZlcnRpc2VtZW50cywgcmVzdWx0W2krMV0uYWR2ZXJ0aXNlbWVudHMpKTtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbn07XG5cbkdlc3RhbHQucHJvdG90eXBlLnRlbGVzY29wZWQgPSBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIG1scyA9IFtdO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5tZXRhTGV2ZWxzLmxlbmd0aDsgaSsrKSB7XG5cdG1scy5wdXNoKHRlbGVzY29wZUxldmVscyh0aGlzLm1ldGFMZXZlbHNbaV0pKTtcbiAgICB9XG4gICAgcmV0dXJuIG5ldyBHZXN0YWx0KG1scyk7XG59O1xuXG5HZXN0YWx0LnByb3RvdHlwZS5maWx0ZXIgPSBmdW5jdGlvbiAocGVyc3BlY3RpdmUpIHtcbiAgICB2YXIgbWV0YUxldmVscyA9IFtdO1xuICAgIHZhciBtbHMxID0gdGhpcy5tZXRhTGV2ZWxzO1xuICAgIHZhciBtbHMyID0gcGVyc3BlY3RpdmUubWV0YUxldmVscztcbiAgICB2YXIgbm0gPSBNYXRoLm1pbihtbHMxLmxlbmd0aCwgbWxzMi5sZW5ndGgpO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbm07IGkrKykge1xuXHR2YXIgbGV2ZWxzID0gW107XG5cdHZhciBsczEgPSBtbHMxW2ldIHx8IGVtcHR5TWV0YUxldmVsO1xuXHR2YXIgbHMyID0gbWxzMltpXSB8fCBlbXB0eU1ldGFMZXZlbDtcblx0dmFyIG5sID0gTWF0aC5taW4obHMxLmxlbmd0aCwgbHMyLmxlbmd0aCAtIDEpO1xuXHRmb3IgKHZhciBqID0gMDsgaiA8IG5sOyBqKyspIHtcblx0ICAgIHZhciBwMSA9IGxzMVtqXSB8fCBlbXB0eUxldmVsO1xuXHQgICAgdmFyIHN1YnMgPSBlbXB0eU1hdGNoZXI7XG5cdCAgICB2YXIgYWR2cyA9IGVtcHR5TWF0Y2hlcjtcblx0ICAgIGZvciAodmFyIGsgPSBqICsgMTsgayA8IGxzMi5sZW5ndGg7IGsrKykge1xuXHRcdHZhciBwMiA9IGxzMltrXSB8fCBlbXB0eUxldmVsO1xuXHRcdHN1YnMgPSB1bmlvbihzdWJzLCBpbnRlcnNlY3QocDEuc3Vic2NyaXB0aW9ucywgcDIuYWR2ZXJ0aXNlbWVudHMpKTtcblx0XHRhZHZzID0gdW5pb24oYWR2cywgaW50ZXJzZWN0KHAxLmFkdmVydGlzZW1lbnRzLCBwMi5zdWJzY3JpcHRpb25zKSk7XG5cdCAgICB9XG5cdCAgICBtYXliZVB1c2hMZXZlbChsZXZlbHMsIGosIG5ldyBHZXN0YWx0TGV2ZWwoc3VicywgYWR2cykpO1xuXHR9XG5cdG1heWJlUHVzaE1ldGFMZXZlbChtZXRhTGV2ZWxzLCBpLCBsZXZlbHMpO1xuICAgIH1cbiAgICByZXR1cm4gbmV3IEdlc3RhbHQobWV0YUxldmVscyk7XG59O1xuXG5HZXN0YWx0LnByb3RvdHlwZS5tYXRjaCA9IGZ1bmN0aW9uIChwZXJzcGVjdGl2ZSkge1xuICAgIHZhciBwaWRzID0ge307XG4gICAgdmFyIG5tID0gTWF0aC5taW4odGhpcy5tZXRhTGV2ZWxzLmxlbmd0aCwgcGVyc3BlY3RpdmUubWV0YUxldmVscy5sZW5ndGgpO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbm07IGkrKykge1xuXHR2YXIgbHMxID0gdGhpcy5tZXRhTGV2ZWxzW2ldIHx8IGVtcHR5TWV0YUxldmVsO1xuXHR2YXIgbHMyID0gcGVyc3BlY3RpdmUubWV0YUxldmVsc1tpXSB8fCBlbXB0eU1ldGFMZXZlbDtcblx0dmFyIG5sID0gTWF0aC5taW4obHMxLmxlbmd0aCwgbHMyLmxlbmd0aCAtIDEpO1xuXHRmb3IgKHZhciBqID0gMDsgaiA8IG5sOyBqKyspIHtcblx0ICAgIHZhciBwMSA9IGxzMVtqXSB8fCBlbXB0eUxldmVsO1xuXHQgICAgZm9yICh2YXIgayA9IGogKyAxOyBrIDwgbHMyLmxlbmd0aDsgaysrKSB7XG5cdFx0dmFyIHAyID0gbHMyW2tdIHx8IGVtcHR5TGV2ZWw7XG5cdFx0bWF0Y2hNYXRjaGVyKHAxLnN1YnNjcmlwdGlvbnMsIHAyLmFkdmVydGlzZW1lbnRzLCBwaWRzKTtcblx0XHRtYXRjaE1hdGNoZXIocDEuYWR2ZXJ0aXNlbWVudHMsIHAyLnN1YnNjcmlwdGlvbnMsIHBpZHMpO1xuXHQgICAgfVxuXHR9XG4gICAgfVxuICAgIHJldHVybiBzZXRUb0FycmF5KHBpZHMpO1xufTtcblxuR2VzdGFsdC5wcm90b3R5cGUuZXJhc2VQYXRoID0gZnVuY3Rpb24gKHBhdGgpIHtcbiAgICByZXR1cm4gdGhpcy5tYXBaaXAocGF0aCwgTWF0aC5tYXgsIHN0cmFpZ2h0R2VzdGFsdExldmVsT3AoZXJhc2VQYXRoKSk7XG59O1xuXG5mdW5jdGlvbiBtYXBMZXZlbHMoaW5wdXRNZXRhTGV2ZWxzLCBmLCBlbXB0eUNoZWNrLCBpbnB1dEVtcHR5TGV2ZWwsIG91dHB1dEVtcHR5TGV2ZWwpIHtcbiAgICB2YXIgb3V0cHV0TWV0YUxldmVscyA9IFtdO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgaW5wdXRNZXRhTGV2ZWxzLmxlbmd0aDsgaSsrKSB7XG5cdHZhciBscyA9IGlucHV0TWV0YUxldmVsc1tpXTtcblx0dmFyIGxldmVscyA9IFtdO1xuXHRmb3IgKHZhciBqID0gMDsgaiA8IGxzLmxlbmd0aDsgaisrKSB7XG5cdCAgICB2YXIgcCA9IGYobHNbal0gfHwgaW5wdXRFbXB0eUxldmVsLCBpLCBqKTtcblx0ICAgIGlmICghZW1wdHlDaGVjayhwLCBpLCBqKSkge1xuXHRcdHdoaWxlIChsZXZlbHMubGVuZ3RoIDwgaikgbGV2ZWxzLnB1c2gob3V0cHV0RW1wdHlMZXZlbCk7XG5cdFx0bGV2ZWxzLnB1c2gocCk7XG5cdCAgICB9XG5cdH1cblx0aWYgKGxldmVscy5sZW5ndGggPiAwKSB7XG5cdCAgICB3aGlsZSAob3V0cHV0TWV0YUxldmVscy5sZW5ndGggPCBpKSBvdXRwdXRNZXRhTGV2ZWxzLnB1c2goZW1wdHlNZXRhTGV2ZWwpO1xuXHQgICAgb3V0cHV0TWV0YUxldmVscy5wdXNoKGxldmVscyk7XG5cdH1cbiAgICB9XG4gICAgcmV0dXJuIG91dHB1dE1ldGFMZXZlbHM7XG59O1xuXG5HZXN0YWx0LnByb3RvdHlwZS50cmFuc2Zvcm0gPSBmdW5jdGlvbiAoZikge1xuICAgIHJldHVybiBuZXcgR2VzdGFsdChtYXBMZXZlbHModGhpcy5tZXRhTGV2ZWxzLCBmdW5jdGlvbiAocCwgbWwsIGwpIHtcblx0cmV0dXJuIG5ldyBHZXN0YWx0TGV2ZWwoZihwLnN1YnNjcmlwdGlvbnMsIG1sLCBsLCBmYWxzZSksXG5cdFx0XHRcdGYocC5hZHZlcnRpc2VtZW50cywgbWwsIGwsIHRydWUpKTtcbiAgICB9LCBmdW5jdGlvbiAocCkge1xuXHRyZXR1cm4gcC5pc0VtcHR5KCk7XG4gICAgfSwgZW1wdHlMZXZlbCwgZW1wdHlMZXZlbCkpO1xufTtcblxuR2VzdGFsdC5wcm90b3R5cGUuc3RyaXBMYWJlbCA9IGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4gdGhpcy50cmFuc2Zvcm0oZnVuY3Rpb24gKG0pIHsgcmV0dXJuIHJlbGFiZWwobSwgZnVuY3Rpb24gKHYpIHsgcmV0dXJuIHRydWU7IH0pOyB9KTtcbn07XG5cbkdlc3RhbHQucHJvdG90eXBlLmxhYmVsID0gZnVuY3Rpb24gKHBpZCkge1xuICAgIHZhciBwaWRzID0gYXJyYXlUb1NldChbcGlkXSk7XG4gICAgcmV0dXJuIHRoaXMudHJhbnNmb3JtKGZ1bmN0aW9uIChtKSB7IHJldHVybiByZWxhYmVsKG0sIGZ1bmN0aW9uICh2KSB7IHJldHVybiBwaWRzOyB9KTsgfSk7XG59O1xuXG5HZXN0YWx0LnByb3RvdHlwZS5wcmV0dHkgPSBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIGFjYyA9IFtdO1xuICAgIGlmICh0aGlzLmlzRW1wdHkoKSkge1xuXHRhY2MucHVzaChcIkVNUFRZIEdFU1RBTFRcXG5cIik7XG4gICAgfSBlbHNlIHtcblx0Zm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLm1ldGFMZXZlbHMubGVuZ3RoOyBpKyspIHtcblx0ICAgIHZhciBscyA9IHRoaXMubWV0YUxldmVsc1tpXTtcblx0ICAgIGZvciAodmFyIGogPSAwOyBqIDwgbHMubGVuZ3RoOyBqKyspIHtcblx0XHR2YXIgcCA9IGxzW2pdO1xuXHRcdGlmICghcC5pc0VtcHR5KCkpIHtcblx0XHQgICAgYWNjLnB1c2goXCJHRVNUQUxUIG1ldGFsZXZlbCBcIiArIGkgKyBcIiBsZXZlbCBcIiArIGogKyBcIjpcXG5cIik7XG5cdFx0ICAgIGFjYy5wdXNoKHAucHJldHR5KCkpO1xuXHRcdH1cblx0ICAgIH1cblx0fVxuICAgIH1cbiAgICByZXR1cm4gYWNjLmpvaW4oJycpO1xufTtcblxuR2VzdGFsdC5wcm90b3R5cGUuc2VyaWFsaXplID0gZnVuY3Rpb24gKHNlcmlhbGl6ZVN1Y2Nlc3MpIHtcbiAgICBpZiAodHlwZW9mIHNlcmlhbGl6ZVN1Y2Nlc3MgPT09ICd1bmRlZmluZWQnKSB7XG5cdHNlcmlhbGl6ZVN1Y2Nlc3MgPSBmdW5jdGlvbiAodikgeyByZXR1cm4gdiA9PT0gdHJ1ZSA/IHRydWUgOiBzZXRUb0FycmF5KHYpOyB9O1xuICAgIH1cbiAgICByZXR1cm4gW1wiZ2VzdGFsdFwiLCBtYXBMZXZlbHModGhpcy5tZXRhTGV2ZWxzLCBmdW5jdGlvbiAocCkge1xuXHRyZXR1cm4gW3NlcmlhbGl6ZU1hdGNoZXIocC5zdWJzY3JpcHRpb25zLCBzZXJpYWxpemVTdWNjZXNzKSxcblx0XHRzZXJpYWxpemVNYXRjaGVyKHAuYWR2ZXJ0aXNlbWVudHMsIHNlcmlhbGl6ZVN1Y2Nlc3MpXTtcbiAgICB9LCBmdW5jdGlvbiAocHIpIHtcblx0cmV0dXJuIHByLmxlbmd0aCA9PT0gMiAmJiBwclswXS5sZW5ndGggPT09IDAgJiYgcHJbMV0ubGVuZ3RoID09PSAwO1xuICAgIH0sIGVtcHR5TGV2ZWwsIFtbXSxbXV0pXTtcbn07XG5cbmZ1bmN0aW9uIGRlc2VyaWFsaXplR2VzdGFsdChyLCBkZXNlcmlhbGl6ZVN1Y2Nlc3MpIHtcbiAgICBpZiAodHlwZW9mIGRlc2VyaWFsaXplU3VjY2VzcyA9PT0gJ3VuZGVmaW5lZCcpIHtcblx0ZGVzZXJpYWxpemVTdWNjZXNzID0gZnVuY3Rpb24gKHYpIHsgcmV0dXJuIHYgPT09IHRydWUgPyB0cnVlIDogYXJyYXlUb1NldCh2KTsgfTtcbiAgICB9XG4gICAgaWYgKHJbMF0gIT09IFwiZ2VzdGFsdFwiKSBkaWUoXCJJbnZhbGlkIGdlc3RhbHQgc2VyaWFsaXphdGlvbjogXCIgKyByKTtcbiAgICByZXR1cm4gbmV3IEdlc3RhbHQobWFwTGV2ZWxzKHJbMV0sIGZ1bmN0aW9uIChwcikge1xuXHRyZXR1cm4gbmV3IEdlc3RhbHRMZXZlbChkZXNlcmlhbGl6ZU1hdGNoZXIocHJbMF0sIGRlc2VyaWFsaXplU3VjY2VzcyksXG5cdFx0XHRcdGRlc2VyaWFsaXplTWF0Y2hlcihwclsxXSwgZGVzZXJpYWxpemVTdWNjZXNzKSk7XG4gICAgfSwgZnVuY3Rpb24gKHApIHtcblx0cmV0dXJuIHAuaXNFbXB0eSgpO1xuICAgIH0sIFtbXSxbXV0sIGVtcHR5TGV2ZWwpKTtcbn1cblxuLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG5cbm1vZHVsZS5leHBvcnRzLl9fID0gX187XG5tb2R1bGUuZXhwb3J0cy5hcnJheVRvU2V0ID0gYXJyYXlUb1NldDtcbm1vZHVsZS5leHBvcnRzLnNldFRvQXJyYXkgPSBzZXRUb0FycmF5O1xubW9kdWxlLmV4cG9ydHMuc2V0VW5pb24gPSBzZXRVbmlvbjtcbm1vZHVsZS5leHBvcnRzLnNldFN1YnRyYWN0ID0gc2V0U3VidHJhY3Q7XG5tb2R1bGUuZXhwb3J0cy5zZXRJbnRlcnNlY3QgPSBzZXRJbnRlcnNlY3Q7XG5tb2R1bGUuZXhwb3J0cy5zZXRFcXVhbCA9IHNldEVxdWFsO1xubW9kdWxlLmV4cG9ydHMuaXNfZW1wdHlTZXQgPSBpc19lbXB0eVNldDtcbm1vZHVsZS5leHBvcnRzLiRDYXB0dXJlID0gJENhcHR1cmU7XG5tb2R1bGUuZXhwb3J0cy5fJCA9IF8kO1xubW9kdWxlLmV4cG9ydHMuaXNfZW1wdHlNYXRjaGVyID0gaXNfZW1wdHlNYXRjaGVyO1xubW9kdWxlLmV4cG9ydHMuZW1wdHlNYXRjaGVyID0gZW1wdHlNYXRjaGVyO1xubW9kdWxlLmV4cG9ydHMuZW1iZWRkZWRNYXRjaGVyID0gZW1iZWRkZWRNYXRjaGVyO1xubW9kdWxlLmV4cG9ydHMuY29tcGlsZVBhdHRlcm4gPSBjb21waWxlUGF0dGVybjtcbm1vZHVsZS5leHBvcnRzLm1hdGNoUGF0dGVybiA9IG1hdGNoUGF0dGVybjtcbm1vZHVsZS5leHBvcnRzLnVuaW9uID0gdW5pb25OO1xubW9kdWxlLmV4cG9ydHMuaW50ZXJzZWN0ID0gaW50ZXJzZWN0O1xubW9kdWxlLmV4cG9ydHMuZXJhc2VQYXRoID0gZXJhc2VQYXRoO1xubW9kdWxlLmV4cG9ydHMubWF0Y2hWYWx1ZSA9IG1hdGNoVmFsdWU7XG5tb2R1bGUuZXhwb3J0cy5tYXRjaE1hdGNoZXIgPSBtYXRjaE1hdGNoZXI7XG5tb2R1bGUuZXhwb3J0cy5hcHBlbmRNYXRjaGVyID0gYXBwZW5kTWF0Y2hlcjtcbm1vZHVsZS5leHBvcnRzLnJlbGFiZWwgPSByZWxhYmVsO1xubW9kdWxlLmV4cG9ydHMuY29tcGlsZVByb2plY3Rpb24gPSBjb21waWxlUHJvamVjdGlvbjtcbm1vZHVsZS5leHBvcnRzLnByb2plY3Rpb25Ub1BhdHRlcm4gPSBwcm9qZWN0aW9uVG9QYXR0ZXJuO1xubW9kdWxlLmV4cG9ydHMucHJvamVjdCA9IHByb2plY3Q7XG5tb2R1bGUuZXhwb3J0cy5tYXRjaGVyS2V5cyA9IG1hdGNoZXJLZXlzO1xubW9kdWxlLmV4cG9ydHMubWF0Y2hlcktleXNUb09iamVjdHMgPSBtYXRjaGVyS2V5c1RvT2JqZWN0cztcbm1vZHVsZS5leHBvcnRzLnByb2plY3RPYmplY3RzID0gcHJvamVjdE9iamVjdHM7XG5tb2R1bGUuZXhwb3J0cy5tYXRjaGVyRXF1YWxzID0gbWF0Y2hlckVxdWFscztcbm1vZHVsZS5leHBvcnRzLnByZXR0eU1hdGNoZXIgPSBwcmV0dHlNYXRjaGVyO1xubW9kdWxlLmV4cG9ydHMuc2VyaWFsaXplTWF0Y2hlciA9IHNlcmlhbGl6ZU1hdGNoZXI7XG5tb2R1bGUuZXhwb3J0cy5kZXNlcmlhbGl6ZU1hdGNoZXIgPSBkZXNlcmlhbGl6ZU1hdGNoZXI7XG5cbm1vZHVsZS5leHBvcnRzLkdlc3RhbHRMZXZlbCA9IEdlc3RhbHRMZXZlbDtcbm1vZHVsZS5leHBvcnRzLkdlc3RhbHQgPSBHZXN0YWx0O1xubW9kdWxlLmV4cG9ydHMuc2ltcGxlR2VzdGFsdCA9IHNpbXBsZUdlc3RhbHQ7XG5tb2R1bGUuZXhwb3J0cy5lbXB0eUdlc3RhbHQgPSBlbXB0eUdlc3RhbHQ7XG5tb2R1bGUuZXhwb3J0cy5mdWxsR2VzdGFsdCA9IGZ1bGxHZXN0YWx0O1xubW9kdWxlLmV4cG9ydHMuZ2VzdGFsdFVuaW9uID0gZ2VzdGFsdFVuaW9uO1xubW9kdWxlLmV4cG9ydHMuZGVzZXJpYWxpemVHZXN0YWx0ID0gZGVzZXJpYWxpemVHZXN0YWx0O1xuIiwidmFyIE1pbmltYXJ0ID0gcmVxdWlyZShcIi4vbWluaW1hcnQuanNcIik7XG52YXIgUm91dGUgPSBNaW5pbWFydC5Sb3V0ZTtcbnZhciBXb3JsZCA9IE1pbmltYXJ0LldvcmxkO1xudmFyIHN1YiA9IE1pbmltYXJ0LnN1YjtcbnZhciBwdWIgPSBNaW5pbWFydC5wdWI7XG52YXIgX18gPSBNaW5pbWFydC5fXztcblxuZnVuY3Rpb24gc3Bhd25Sb3V0aW5nVGFibGVXaWRnZXQoc2VsZWN0b3IsIGZyYWdtZW50Q2xhc3MsIGRvbVdyYXAsIG9ic2VydmF0aW9uTGV2ZWwpIHtcbiAgICBvYnNlcnZhdGlvbkxldmVsID0gb2JzZXJ2YXRpb25MZXZlbCB8fCAxMDtcbiAgICAvLyBeIGFyYml0cmFyeTogc2hvdWxkIGJlIEluZmluaXR5LCB3aGVuIHJvdXRlLmpzIHN1cHBvcnRzIGl0LiBUT0RPXG4gICAgZG9tV3JhcCA9IGRvbVdyYXAgfHwgTWluaW1hcnQuRE9NLmRlZmF1bHRXcmFwRnVuY3Rpb247XG5cbiAgICBXb3JsZC5zcGF3bih7XG5cdGJvb3Q6IGZ1bmN0aW9uICgpIHsgdGhpcy51cGRhdGVTdGF0ZSgpOyB9LFxuXG5cdHN0YXRlOiBSb3V0ZS5lbXB0eUdlc3RhbHQuc2VyaWFsaXplKCksXG5cdG5leHRTdGF0ZTogUm91dGUuZW1wdHlHZXN0YWx0LnNlcmlhbGl6ZSgpLFxuXHR0aW1lcjogZmFsc2UsXG5cblx0bG9jYWxHZXN0YWx0OiAoc3ViKCAgICAgICBkb21XcmFwKHNlbGVjdG9yLCBmcmFnbWVudENsYXNzLCBfXyksIDAsIDIpXG5cdFx0ICAgICAgIC51bmlvbihwdWIoZG9tV3JhcChzZWxlY3RvciwgZnJhZ21lbnRDbGFzcywgX18pLCAwLCAyKSlcblx0XHQgICAgICAgLnRlbGVzY29wZWQoKSksXG5cblx0ZGlnZXN0R2VzdGFsdDogZnVuY3Rpb24gKGcpIHtcblx0ICAgIHJldHVybiBnLnN0cmlwTGFiZWwoKS5lcmFzZVBhdGgodGhpcy5sb2NhbEdlc3RhbHQpLnNlcmlhbGl6ZSgpO1xuXHR9LFxuXG5cdHVwZGF0ZVN0YXRlOiBmdW5jdGlvbiAoKSB7XG5cdCAgICB2YXIgZWx0cyA9IFtcInByZVwiLCBSb3V0ZS5kZXNlcmlhbGl6ZUdlc3RhbHQodGhpcy5zdGF0ZSkucHJldHR5KCldO1xuXHQgICAgV29ybGQudXBkYXRlUm91dGVzKFtzdWIoX18sIDAsIG9ic2VydmF0aW9uTGV2ZWwpLFxuXHRcdFx0XHRwdWIoX18sIDAsIG9ic2VydmF0aW9uTGV2ZWwpLFxuXHRcdFx0XHRwdWIoZG9tV3JhcChzZWxlY3RvciwgZnJhZ21lbnRDbGFzcywgZWx0cykpXSk7XG5cdH0sXG5cblx0aGFuZGxlRXZlbnQ6IGZ1bmN0aW9uIChlKSB7XG5cdCAgICB2YXIgc2VsZiA9IHRoaXM7XG5cdCAgICBpZiAoZS50eXBlID09PSBcInJvdXRlc1wiKSB7XG5cdFx0c2VsZi5uZXh0U3RhdGUgPSBzZWxmLmRpZ2VzdEdlc3RhbHQoZS5nZXN0YWx0KTtcblx0XHRpZiAoc2VsZi50aW1lcikge1xuXHRcdCAgICBjbGVhclRpbWVvdXQoc2VsZi50aW1lcik7XG5cdFx0ICAgIHNlbGYudGltZXIgPSBmYWxzZTtcblx0XHR9XG5cdFx0c2VsZi50aW1lciA9IHNldFRpbWVvdXQoV29ybGQud3JhcChmdW5jdGlvbiAoKSB7XG5cdFx0ICAgIGlmIChKU09OLnN0cmluZ2lmeShzZWxmLm5leHRTdGF0ZSkgIT09IEpTT04uc3RyaW5naWZ5KHNlbGYuc3RhdGUpKSB7XG5cdFx0XHRzZWxmLnN0YXRlID0gc2VsZi5uZXh0U3RhdGU7XG5cdFx0XHRzZWxmLnVwZGF0ZVN0YXRlKCk7XG5cdFx0ICAgIH1cblx0XHQgICAgc2VsZi50aW1lciA9IGZhbHNlO1xuXHRcdH0pLCA1MCk7XG5cdCAgICB9XG5cdH1cbiAgICB9KTtcblxufVxuXG5tb2R1bGUuZXhwb3J0cy5zcGF3blJvdXRpbmdUYWJsZVdpZGdldCA9IHNwYXduUm91dGluZ1RhYmxlV2lkZ2V0O1xuIiwiLy8gR2VuZXJpYyBTcHlcbnZhciBNaW5pbWFydCA9IHJlcXVpcmUoXCIuL21pbmltYXJ0LmpzXCIpO1xudmFyIFdvcmxkID0gTWluaW1hcnQuV29ybGQ7XG52YXIgc3ViID0gTWluaW1hcnQuc3ViO1xudmFyIHB1YiA9IE1pbmltYXJ0LnB1YjtcbnZhciBfXyA9IE1pbmltYXJ0Ll9fO1xuXG5mdW5jdGlvbiBTcHkobGFiZWwsIHVzZUpzb24sIG9ic2VydmF0aW9uTGV2ZWwpIHtcbiAgICB0aGlzLmxhYmVsID0gbGFiZWwgfHwgXCJTUFlcIjtcbiAgICB0aGlzLm9ic2VydmF0aW9uTGV2ZWwgPSBvYnNlcnZhdGlvbkxldmVsIHx8IDEwOyAvLyBhcmJpdHJhcnkuIFNob3VsZCBiZSBJbmZpbml0eS4gVE9ET1xuICAgIHRoaXMudXNlSnNvbiA9IHVzZUpzb247XG59XG5cblNweS5wcm90b3R5cGUuYm9vdCA9IGZ1bmN0aW9uICgpIHtcbiAgICBXb3JsZC51cGRhdGVSb3V0ZXMoW3N1YihfXywgMCwgdGhpcy5vYnNlcnZhdGlvbkxldmVsKSwgcHViKF9fLCAwLCB0aGlzLm9ic2VydmF0aW9uTGV2ZWwpXSk7XG59O1xuXG5TcHkucHJvdG90eXBlLmhhbmRsZUV2ZW50ID0gZnVuY3Rpb24gKGUpIHtcbiAgICBzd2l0Y2ggKGUudHlwZSkge1xuICAgIGNhc2UgXCJyb3V0ZXNcIjpcblx0Y29uc29sZS5sb2codGhpcy5sYWJlbCwgXCJyb3V0ZXNcIiwgZS5nZXN0YWx0LnByZXR0eSgpKTtcblx0YnJlYWs7XG4gICAgY2FzZSBcIm1lc3NhZ2VcIjpcblx0dmFyIG1lc3NhZ2VSZXByO1xuXHR0cnkge1xuXHQgICAgbWVzc2FnZVJlcHIgPSB0aGlzLnVzZUpzb24gPyBKU09OLnN0cmluZ2lmeShlLm1lc3NhZ2UpIDogZS5tZXNzYWdlO1xuXHR9IGNhdGNoIChleG4pIHtcblx0ICAgIG1lc3NhZ2VSZXByID0gZS5tZXNzYWdlO1xuXHR9XG5cdGNvbnNvbGUubG9nKHRoaXMubGFiZWwsIFwibWVzc2FnZVwiLCBtZXNzYWdlUmVwciwgZS5tZXRhTGV2ZWwsIGUuaXNGZWVkYmFjayk7XG5cdGJyZWFrO1xuICAgIGRlZmF1bHQ6XG5cdGNvbnNvbGUubG9nKHRoaXMubGFiZWwsIFwidW5rbm93blwiLCBlKTtcblx0YnJlYWs7XG4gICAgfVxufTtcblxubW9kdWxlLmV4cG9ydHMuU3B5ID0gU3B5O1xuIiwiLy8gTWluaW1hbCBqUXVlcnlpc2ggdXRpbGl0aWVzLiBSZWltcGxlbWVudGVkIGJlY2F1c2UgalF1ZXJ5IG5lZWRzXG4vLyB3aW5kb3cgdG8gZXhpc3QsIGFuZCB3ZSB3YW50IHRvIHJ1biBpbiBXZWIgV29ya2VyIGNvbnRleHQgYXMgd2VsbC5cblxuZnVuY3Rpb24gZXh0ZW5kKHdoYXQsIF93aXRoKSB7XG4gIGZvciAodmFyIHByb3AgaW4gX3dpdGgpIHtcbiAgICBpZiAoX3dpdGguaGFzT3duUHJvcGVydHkocHJvcCkpIHtcbiAgICAgIHdoYXRbcHJvcF0gPSBfd2l0aFtwcm9wXTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHdoYXQ7XG59XG5cbm1vZHVsZS5leHBvcnRzLmV4dGVuZCA9IGV4dGVuZDtcbiIsIi8vIFdha2UgZGV0ZWN0b3IgLSBub3RpY2VzIHdoZW4gc29tZXRoaW5nIChzdWNoIGFzXG4vLyBzdXNwZW5zaW9uL3NsZWVwaW5nISkgaGFzIGNhdXNlZCBwZXJpb2RpYyBhY3Rpdml0aWVzIHRvIGJlXG4vLyBpbnRlcnJ1cHRlZCwgYW5kIHdhcm5zIG90aGVycyBhYm91dCBpdFxuLy8gSW5zcGlyZWQgYnkgaHR0cDovL2Jsb2cuYWxleG1hY2Nhdy5jb20vamF2YXNjcmlwdC13YWtlLWV2ZW50XG52YXIgTWluaW1hcnQgPSByZXF1aXJlKFwiLi9taW5pbWFydC5qc1wiKTtcbnZhciBXb3JsZCA9IE1pbmltYXJ0LldvcmxkO1xudmFyIHN1YiA9IE1pbmltYXJ0LnN1YjtcbnZhciBwdWIgPSBNaW5pbWFydC5wdWI7XG52YXIgX18gPSBNaW5pbWFydC5fXztcblxuZnVuY3Rpb24gV2FrZURldGVjdG9yKHBlcmlvZCkge1xuICAgIHRoaXMubWVzc2FnZSA9IFwid2FrZVwiO1xuICAgIHRoaXMucGVyaW9kID0gcGVyaW9kIHx8IDEwMDAwO1xuICAgIHRoaXMubW9zdFJlY2VudFRyaWdnZXIgPSArKG5ldyBEYXRlKCkpO1xuICAgIHRoaXMudGltZXJJZCA9IG51bGw7XG59XG5cbldha2VEZXRlY3Rvci5wcm90b3R5cGUuYm9vdCA9IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgV29ybGQudXBkYXRlUm91dGVzKFtwdWIodGhpcy5tZXNzYWdlKV0pO1xuICAgIHRoaXMudGltZXJJZCA9IHNldEludGVydmFsKFdvcmxkLndyYXAoZnVuY3Rpb24gKCkgeyBzZWxmLnRyaWdnZXIoKTsgfSksIHRoaXMucGVyaW9kKTtcbn07XG5cbldha2VEZXRlY3Rvci5wcm90b3R5cGUuaGFuZGxlRXZlbnQgPSBmdW5jdGlvbiAoZSkge307XG5cbldha2VEZXRlY3Rvci5wcm90b3R5cGUudHJpZ2dlciA9IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgbm93ID0gKyhuZXcgRGF0ZSgpKTtcbiAgICBpZiAobm93IC0gdGhpcy5tb3N0UmVjZW50VHJpZ2dlciA+IHRoaXMucGVyaW9kICogMS41KSB7XG5cdFdvcmxkLnNlbmQodGhpcy5tZXNzYWdlKTtcbiAgICB9XG4gICAgdGhpcy5tb3N0UmVjZW50VHJpZ2dlciA9IG5vdztcbn07XG5cbm1vZHVsZS5leHBvcnRzLldha2VEZXRlY3RvciA9IFdha2VEZXRlY3RvcjtcbiIsInZhciBNaW5pbWFydCA9IHJlcXVpcmUoXCIuL21pbmltYXJ0LmpzXCIpO1xudmFyIENvZGVjID0gcmVxdWlyZShcIi4vY29kZWMuanNcIik7XG52YXIgUm91dGUgPSBNaW5pbWFydC5Sb3V0ZTtcbnZhciBXb3JsZCA9IE1pbmltYXJ0LldvcmxkO1xudmFyIHN1YiA9IE1pbmltYXJ0LnN1YjtcbnZhciBwdWIgPSBNaW5pbWFydC5wdWI7XG52YXIgX18gPSBNaW5pbWFydC5fXztcbnZhciBfJCA9IE1pbmltYXJ0Ll8kO1xuXG4vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cbi8vIFdlYlNvY2tldCBjbGllbnQgZHJpdmVyXG5cbnZhciBERUZBVUxUX1JFQ09OTkVDVF9ERUxBWSA9IDEwMDtcbnZhciBNQVhfUkVDT05ORUNUX0RFTEFZID0gMzAwMDA7XG52YXIgREVGQVVMVF9JRExFX1RJTUVPVVQgPSAzMDAwMDA7IC8vIDUgbWludXRlc1xudmFyIERFRkFVTFRfUElOR19JTlRFUlZBTCA9IERFRkFVTFRfSURMRV9USU1FT1VUIC0gMTAwMDA7XG5cbmZ1bmN0aW9uIFdlYlNvY2tldENvbm5lY3Rpb24obGFiZWwsIHdzdXJsLCBzaG91bGRSZWNvbm5lY3QpIHtcbiAgICB0aGlzLmxhYmVsID0gbGFiZWw7XG4gICAgdGhpcy5zZW5kc0F0dGVtcHRlZCA9IDA7XG4gICAgdGhpcy5zZW5kc1RyYW5zbWl0dGVkID0gMDtcbiAgICB0aGlzLnJlY2VpdmVDb3VudCA9IDA7XG4gICAgdGhpcy5zb2NrID0gbnVsbDtcbiAgICB0aGlzLndzdXJsID0gd3N1cmw7XG4gICAgdGhpcy5zaG91bGRSZWNvbm5lY3QgPSBzaG91bGRSZWNvbm5lY3QgPyB0cnVlIDogZmFsc2U7XG4gICAgdGhpcy5yZWNvbm5lY3REZWxheSA9IERFRkFVTFRfUkVDT05ORUNUX0RFTEFZO1xuICAgIHRoaXMubG9jYWxHZXN0YWx0ID0gUm91dGUuZW1wdHlHZXN0YWx0O1xuICAgIHRoaXMucGVlckdlc3RhbHQgPSBSb3V0ZS5lbXB0eUdlc3RhbHQ7XG4gICAgdGhpcy5wcmV2TG9jYWxSb3V0ZXNNZXNzYWdlID0gbnVsbDtcbiAgICB0aGlzLnByZXZQZWVyUm91dGVzTWVzc2FnZSA9IG51bGw7XG4gICAgdGhpcy5kZWR1cGxpY2F0b3IgPSBuZXcgTWluaW1hcnQuRGVkdXBsaWNhdG9yKCk7XG4gICAgdGhpcy5jb25uZWN0aW9uQ291bnQgPSAwO1xuXG4gICAgdGhpcy5hY3Rpdml0eVRpbWVzdGFtcCA9IDA7XG4gICAgdGhpcy5pZGxlVGltZW91dCA9IERFRkFVTFRfSURMRV9USU1FT1VUO1xuICAgIHRoaXMucGluZ0ludGVydmFsID0gREVGQVVMVF9QSU5HX0lOVEVSVkFMO1xuICAgIHRoaXMuaWRsZVRpbWVyID0gbnVsbDtcbiAgICB0aGlzLnBpbmdUaW1lciA9IG51bGw7XG59XG5cbldlYlNvY2tldENvbm5lY3Rpb24ucHJvdG90eXBlLmRlYnVnU3RhdGUgPSBmdW5jdGlvbiAoKSB7XG4gIHJldHVybiB7XG4gICAgbGFiZWw6IHRoaXMubGFiZWwsXG4gICAgc2VuZHNBdHRlbXB0ZWQ6IHRoaXMuc2VuZHNBdHRlbXB0ZWQsXG4gICAgc2VuZHNUcmFuc21pdHRlZDogdGhpcy5zZW5kc1RyYW5zbWl0dGVkLFxuICAgIHJlY2VpdmVDb3VudDogdGhpcy5yZWNlaXZlQ291bnQsXG4gICAgd3N1cmw6IHRoaXMud3N1cmwsXG4gICAgc2hvdWxkUmVjb25uZWN0OiB0aGlzLnNob3VsZFJlY29ubmVjdCxcbiAgICByZWNvbm5lY3REZWxheTogdGhpcy5yZWNvbm5lY3REZWxheSxcbiAgICBjb25uZWN0aW9uQ291bnQ6IHRoaXMuY29ubmVjdGlvbkNvdW50LFxuICAgIGFjdGl2aXR5VGltZXN0YW1wOiB0aGlzLmFjdGl2aXR5VGltZXN0YW1wXG4gIH07XG59O1xuXG5XZWJTb2NrZXRDb25uZWN0aW9uLnByb3RvdHlwZS5jbGVhckhlYXJ0YmVhdFRpbWVycyA9IGZ1bmN0aW9uICgpIHtcbiAgICBpZiAodGhpcy5pZGxlVGltZXIpIHsgY2xlYXJUaW1lb3V0KHRoaXMuaWRsZVRpbWVyKTsgdGhpcy5pZGxlVGltZXIgPSBudWxsOyB9XG4gICAgaWYgKHRoaXMucGluZ1RpbWVyKSB7IGNsZWFyVGltZW91dCh0aGlzLnBpbmdUaW1lcik7IHRoaXMucGluZ1RpbWVyID0gbnVsbDsgfVxufTtcblxuV2ViU29ja2V0Q29ubmVjdGlvbi5wcm90b3R5cGUucmVjb3JkQWN0aXZpdHkgPSBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIHRoaXMuYWN0aXZpdHlUaW1lc3RhbXAgPSArKG5ldyBEYXRlKCkpO1xuICAgIHRoaXMuY2xlYXJIZWFydGJlYXRUaW1lcnMoKTtcbiAgICB0aGlzLmlkbGVUaW1lciA9IHNldFRpbWVvdXQoZnVuY3Rpb24gKCkgeyBzZWxmLmZvcmNlY2xvc2UoKTsgfSxcblx0XHRcdFx0dGhpcy5pZGxlVGltZW91dCk7XG4gICAgdGhpcy5waW5nVGltZXIgPSBzZXRUaW1lb3V0KGZ1bmN0aW9uICgpIHsgc2VsZi5zYWZlU2VuZChKU09OLnN0cmluZ2lmeShcInBpbmdcIikpIH0sXG5cdFx0XHRcdHRoaXMucGluZ0ludGVydmFsKTtcbn07XG5cbldlYlNvY2tldENvbm5lY3Rpb24ucHJvdG90eXBlLnN0YXR1c1JvdXRlID0gZnVuY3Rpb24gKHN0YXR1cykge1xuICAgIHJldHVybiBwdWIoW3RoaXMubGFiZWwgKyBcIl9zdGF0ZVwiLCBzdGF0dXNdKTtcbn07XG5cbldlYlNvY2tldENvbm5lY3Rpb24ucHJvdG90eXBlLnJlbGF5R2VzdGFsdCA9IGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4gdGhpcy5zdGF0dXNSb3V0ZSh0aGlzLmlzQ29ubmVjdGVkKCkgPyBcImNvbm5lY3RlZFwiIDogXCJkaXNjb25uZWN0ZWRcIilcblx0LnVuaW9uKHB1YihbdGhpcy5sYWJlbCwgX18sIF9fXSwgMCwgMTApKVxuXHQudW5pb24oc3ViKFt0aGlzLmxhYmVsLCBfXywgX19dLCAwLCAxMCkpO1xuICAgIC8vIFRPRE86IGxldmVsIDEwIGlzIGFkLWhvYzsgc3VwcG9ydCBpbmZpbml0eSBhdCBzb21lIHBvaW50IGluIGZ1dHVyZVxufTtcblxuV2ViU29ja2V0Q29ubmVjdGlvbi5wcm90b3R5cGUuYWdncmVnYXRlR2VzdGFsdCA9IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgcmV0dXJuIHRoaXMucGVlckdlc3RhbHQudHJhbnNmb3JtKGZ1bmN0aW9uIChtLCBtZXRhTGV2ZWwpIHtcblx0cmV0dXJuIFJvdXRlLmNvbXBpbGVQYXR0ZXJuKHRydWUsXG5cdFx0XHRcdCAgICBbc2VsZi5sYWJlbCwgbWV0YUxldmVsLCBSb3V0ZS5lbWJlZGRlZE1hdGNoZXIobSldKTtcbiAgICB9KS51bmlvbih0aGlzLnJlbGF5R2VzdGFsdCgpKTtcbn07XG5cbldlYlNvY2tldENvbm5lY3Rpb24ucHJvdG90eXBlLmJvb3QgPSBmdW5jdGlvbiAoKSB7XG4gICAgdGhpcy5yZWNvbm5lY3QoKTtcbn07XG5cbldlYlNvY2tldENvbm5lY3Rpb24ucHJvdG90eXBlLnRyYXBleGl0ID0gZnVuY3Rpb24gKCkge1xuICAgIHRoaXMuZm9yY2VjbG9zZSgpO1xufTtcblxuV2ViU29ja2V0Q29ubmVjdGlvbi5wcm90b3R5cGUuaXNDb25uZWN0ZWQgPSBmdW5jdGlvbiAoKSB7XG4gICAgcmV0dXJuIHRoaXMuc29jayAmJiB0aGlzLnNvY2sucmVhZHlTdGF0ZSA9PT0gdGhpcy5zb2NrLk9QRU47XG59O1xuXG5XZWJTb2NrZXRDb25uZWN0aW9uLnByb3RvdHlwZS5zYWZlU2VuZCA9IGZ1bmN0aW9uIChtKSB7XG4gICAgdHJ5IHtcblx0dGhpcy5zZW5kc0F0dGVtcHRlZCsrO1xuXHRpZiAodGhpcy5pc0Nvbm5lY3RlZCgpKSB7XG5cdCAgICB0aGlzLnNvY2suc2VuZChtKTtcblx0ICAgIHRoaXMuc2VuZHNUcmFuc21pdHRlZCsrO1xuXHR9XG4gICAgfSBjYXRjaCAoZSkge1xuXHRjb25zb2xlLndhcm4oXCJUcmFwcGVkIGV4biB3aGlsZSBzZW5kaW5nXCIsIGUpO1xuICAgIH1cbn07XG5cbldlYlNvY2tldENvbm5lY3Rpb24ucHJvdG90eXBlLnNlbmRMb2NhbFJvdXRlcyA9IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgbmV3TG9jYWxSb3V0ZXNNZXNzYWdlID1cblx0SlNPTi5zdHJpbmdpZnkoQ29kZWMuZW5jb2RlRXZlbnQoTWluaW1hcnQudXBkYXRlUm91dGVzKFt0aGlzLmxvY2FsR2VzdGFsdF0pKSk7XG4gICAgaWYgKHRoaXMucHJldkxvY2FsUm91dGVzTWVzc2FnZSAhPT0gbmV3TG9jYWxSb3V0ZXNNZXNzYWdlKSB7XG5cdHRoaXMucHJldkxvY2FsUm91dGVzTWVzc2FnZSA9IG5ld0xvY2FsUm91dGVzTWVzc2FnZTtcblx0dGhpcy5zYWZlU2VuZChuZXdMb2NhbFJvdXRlc01lc3NhZ2UpO1xuICAgIH1cbn07XG5cbldlYlNvY2tldENvbm5lY3Rpb24ucHJvdG90eXBlLmNvbGxlY3RNYXRjaGVycyA9IGZ1bmN0aW9uIChnZXRBZHZlcnRpc2VtZW50cywgbGV2ZWwsIGcpIHtcbiAgICB2YXIgZXh0cmFjdE1ldGFMZXZlbHMgPSBSb3V0ZS5jb21waWxlUHJvamVjdGlvbihbdGhpcy5sYWJlbCwgXyQsIF9fXSk7XG4gICAgdmFyIG1scyA9IFJvdXRlLm1hdGNoZXJLZXlzKGcucHJvamVjdChleHRyYWN0TWV0YUxldmVscywgZ2V0QWR2ZXJ0aXNlbWVudHMsIDAsIGxldmVsKSk7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBtbHMubGVuZ3RoOyBpKyspIHtcblx0dmFyIG1ldGFMZXZlbCA9IG1sc1tpXVswXTsgLy8gb25seSBvbmUgY2FwdHVyZSBpbiB0aGUgcHJvamVjdGlvblxuXHR2YXIgZXh0cmFjdE1hdGNoZXJzID0gUm91dGUuY29tcGlsZVByb2plY3Rpb24oW3RoaXMubGFiZWwsIG1ldGFMZXZlbCwgXyRdKTtcblx0dmFyIG0gPSBnLnByb2plY3QoZXh0cmFjdE1hdGNoZXJzLCBnZXRBZHZlcnRpc2VtZW50cywgMCwgbGV2ZWwpO1xuXHR0aGlzLmxvY2FsR2VzdGFsdCA9IHRoaXMubG9jYWxHZXN0YWx0LnVuaW9uKFJvdXRlLnNpbXBsZUdlc3RhbHQoZ2V0QWR2ZXJ0aXNlbWVudHMsXG5cdFx0XHRcdFx0XHRcdFx0XHRSb3V0ZS5lbWJlZGRlZE1hdGNoZXIobSksXG5cdFx0XHRcdFx0XHRcdFx0XHRtZXRhTGV2ZWwsXG5cdFx0XHRcdFx0XHRcdFx0XHRsZXZlbCkpO1xuICAgIH1cbn07XG5cbldlYlNvY2tldENvbm5lY3Rpb24ucHJvdG90eXBlLmhhbmRsZUV2ZW50ID0gZnVuY3Rpb24gKGUpIHtcbiAgICAvLyBjb25zb2xlLmxvZyhcIldlYlNvY2tldENvbm5lY3Rpb24uaGFuZGxlRXZlbnRcIiwgZSk7XG4gICAgc3dpdGNoIChlLnR5cGUpIHtcbiAgICBjYXNlIFwicm91dGVzXCI6XG5cdC8vIFRPRE86IEdST1NTIC0gZXJhc2luZyBieSBwaWQhXG5cdHZhciBuTGV2ZWxzID0gZS5nZXN0YWx0LmxldmVsQ291bnQoMCk7XG5cdHZhciByZWxheUdlc3RhbHQgPSBSb3V0ZS5mdWxsR2VzdGFsdCgxLCBuTGV2ZWxzKS5sYWJlbChXb3JsZC5hY3RpdmVQaWQoKSk7XG5cdHZhciBnID0gZS5nZXN0YWx0LmVyYXNlUGF0aChyZWxheUdlc3RhbHQpO1xuXHR0aGlzLmxvY2FsR2VzdGFsdCA9IFJvdXRlLmVtcHR5R2VzdGFsdDtcblx0Zm9yICh2YXIgbGV2ZWwgPSAwOyBsZXZlbCA8IG5MZXZlbHM7IGxldmVsKyspIHtcblx0ICAgIHRoaXMuY29sbGVjdE1hdGNoZXJzKGZhbHNlLCBsZXZlbCwgZyk7XG5cdCAgICB0aGlzLmNvbGxlY3RNYXRjaGVycyh0cnVlLCBsZXZlbCwgZyk7XG5cdH1cblxuXHR0aGlzLnNlbmRMb2NhbFJvdXRlcygpO1xuXHRicmVhaztcbiAgICBjYXNlIFwibWVzc2FnZVwiOlxuXHR2YXIgbSA9IGUubWVzc2FnZTtcblx0aWYgKG0ubGVuZ3RoICYmIG0ubGVuZ3RoID09PSAzICYmIG1bMF0gPT09IHRoaXMubGFiZWwpXG5cdHtcblx0ICAgIHZhciBlbmNvZGVkID0gSlNPTi5zdHJpbmdpZnkoQ29kZWMuZW5jb2RlRXZlbnQoXG5cdFx0TWluaW1hcnQuc2VuZE1lc3NhZ2UobVsyXSwgbVsxXSwgZS5pc0ZlZWRiYWNrKSkpO1xuXHQgICAgaWYgKHRoaXMuZGVkdXBsaWNhdG9yLmFjY2VwdChlbmNvZGVkKSkge1xuXHRcdHRoaXMuc2FmZVNlbmQoZW5jb2RlZCk7XG5cdCAgICB9XG5cdH1cblx0YnJlYWs7XG4gICAgfVxufTtcblxuV2ViU29ja2V0Q29ubmVjdGlvbi5wcm90b3R5cGUuZm9yY2VjbG9zZSA9IGZ1bmN0aW9uIChrZWVwUmVjb25uZWN0RGVsYXkpIHtcbiAgICBpZiAoIWtlZXBSZWNvbm5lY3REZWxheSkge1xuXHR0aGlzLnJlY29ubmVjdERlbGF5ID0gREVGQVVMVF9SRUNPTk5FQ1RfREVMQVk7XG4gICAgfVxuICAgIHRoaXMuY2xlYXJIZWFydGJlYXRUaW1lcnMoKTtcbiAgICBpZiAodGhpcy5zb2NrKSB7XG5cdGNvbnNvbGUubG9nKFwiV2ViU29ja2V0Q29ubmVjdGlvbi5mb3JjZWNsb3NlIGNhbGxlZFwiKTtcblx0dGhpcy5zb2NrLmNsb3NlKCk7XG5cdHRoaXMuc29jayA9IG51bGw7XG4gICAgfVxufTtcblxuV2ViU29ja2V0Q29ubmVjdGlvbi5wcm90b3R5cGUucmVjb25uZWN0ID0gZnVuY3Rpb24gKCkge1xuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICB0aGlzLmZvcmNlY2xvc2UodHJ1ZSk7XG4gICAgdGhpcy5jb25uZWN0aW9uQ291bnQrKztcbiAgICB0aGlzLnNvY2sgPSBuZXcgV2ViU29ja2V0KHRoaXMud3N1cmwpO1xuICAgIHRoaXMuc29jay5vbm9wZW4gPSBXb3JsZC53cmFwKGZ1bmN0aW9uIChlKSB7IHJldHVybiBzZWxmLm9ub3BlbihlKTsgfSk7XG4gICAgdGhpcy5zb2NrLm9ubWVzc2FnZSA9IFdvcmxkLndyYXAoZnVuY3Rpb24gKGUpIHtcblx0c2VsZi5yZWNlaXZlQ291bnQrKztcblx0cmV0dXJuIHNlbGYub25tZXNzYWdlKGUpO1xuICAgIH0pO1xuICAgIHRoaXMuc29jay5vbmNsb3NlID0gV29ybGQud3JhcChmdW5jdGlvbiAoZSkgeyByZXR1cm4gc2VsZi5vbmNsb3NlKGUpOyB9KTtcbn07XG5cbldlYlNvY2tldENvbm5lY3Rpb24ucHJvdG90eXBlLm9ub3BlbiA9IGZ1bmN0aW9uIChlKSB7XG4gICAgY29uc29sZS5sb2coXCJjb25uZWN0ZWQgdG8gXCIgKyB0aGlzLnNvY2sudXJsKTtcbiAgICB0aGlzLnJlY29ubmVjdERlbGF5ID0gREVGQVVMVF9SRUNPTk5FQ1RfREVMQVk7XG4gICAgdGhpcy5wcmV2TG9jYWxSb3V0ZXNNZXNzYWdlID0gbnVsbDtcbiAgICB0aGlzLnNlbmRMb2NhbFJvdXRlcygpO1xufTtcblxuV2ViU29ja2V0Q29ubmVjdGlvbi5wcm90b3R5cGUub25tZXNzYWdlID0gZnVuY3Rpb24gKHdzZSkge1xuICAgIC8vIGNvbnNvbGUubG9nKFwib25tZXNzYWdlXCIsIHdzZSk7XG4gICAgdGhpcy5yZWNvcmRBY3Rpdml0eSgpO1xuXG4gICAgdmFyIGogPSBKU09OLnBhcnNlKHdzZS5kYXRhKTtcbiAgICBpZiAoaiA9PT0gXCJwaW5nXCIpIHtcblx0dGhpcy5zYWZlU2VuZChKU09OLnN0cmluZ2lmeShcInBvbmdcIikpO1xuXHRyZXR1cm47XG4gICAgfSBlbHNlIGlmIChqID09PSBcInBvbmdcIikge1xuXHRyZXR1cm47IC8vIHJlY29yZEFjdGl2aXR5IGFscmVhZHkgdG9vayBjYXJlIG9mIG91ciB0aW1lcnNcbiAgICB9XG5cbiAgICB2YXIgZSA9IENvZGVjLmRlY29kZUFjdGlvbihqKTtcbiAgICBzd2l0Y2ggKGUudHlwZSkge1xuICAgIGNhc2UgXCJyb3V0ZXNcIjpcblx0aWYgKHRoaXMucHJldlBlZXJSb3V0ZXNNZXNzYWdlICE9PSB3c2UuZGF0YSkge1xuXHQgICAgdGhpcy5wcmV2UGVlclJvdXRlc01lc3NhZ2UgPSB3c2UuZGF0YTtcblx0ICAgIHRoaXMucGVlckdlc3RhbHQgPSBlLmdlc3RhbHQ7XG5cdCAgICBXb3JsZC51cGRhdGVSb3V0ZXMoW3RoaXMuYWdncmVnYXRlR2VzdGFsdCgpXSk7XG5cdH1cblx0YnJlYWs7XG4gICAgY2FzZSBcIm1lc3NhZ2VcIjpcblx0aWYgKHRoaXMuZGVkdXBsaWNhdG9yLmFjY2VwdCh3c2UuZGF0YSkpIHtcblx0ICAgIFdvcmxkLnNlbmQoW3RoaXMubGFiZWwsIGUubWV0YUxldmVsLCBlLm1lc3NhZ2VdLCAwLCBlLmlzRmVlZGJhY2spO1xuXHR9XG5cdGJyZWFrO1xuICAgIH1cbn07XG5cbldlYlNvY2tldENvbm5lY3Rpb24ucHJvdG90eXBlLm9uY2xvc2UgPSBmdW5jdGlvbiAoZSkge1xuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICBjb25zb2xlLmxvZyhcIm9uY2xvc2VcIiwgZSk7XG5cbiAgICAvLyBVcGRhdGUgcm91dGVzIHRvIGdpdmUgY2xpZW50cyBzb21lIGluZGljYXRpb24gb2YgdGhlIGRpc2NvbnRpbnVpdHlcbiAgICBXb3JsZC51cGRhdGVSb3V0ZXMoW3RoaXMuYWdncmVnYXRlR2VzdGFsdCgpXSk7XG5cbiAgICBpZiAodGhpcy5zaG91bGRSZWNvbm5lY3QpIHtcblx0Y29uc29sZS5sb2coXCJyZWNvbm5lY3RpbmcgdG8gXCIgKyB0aGlzLndzdXJsICsgXCIgaW4gXCIgKyB0aGlzLnJlY29ubmVjdERlbGF5ICsgXCJtc1wiKTtcblx0c2V0VGltZW91dChXb3JsZC53cmFwKGZ1bmN0aW9uICgpIHsgc2VsZi5yZWNvbm5lY3QoKTsgfSksIHRoaXMucmVjb25uZWN0RGVsYXkpO1xuXHR0aGlzLnJlY29ubmVjdERlbGF5ID0gdGhpcy5yZWNvbm5lY3REZWxheSAqIDEuNjE4ICsgKE1hdGgucmFuZG9tKCkgKiAxMDAwKTtcblx0dGhpcy5yZWNvbm5lY3REZWxheSA9XG5cdCAgICB0aGlzLnJlY29ubmVjdERlbGF5ID4gTUFYX1JFQ09OTkVDVF9ERUxBWVxuXHQgICAgPyBNQVhfUkVDT05ORUNUX0RFTEFZICsgKE1hdGgucmFuZG9tKCkgKiAxMDAwKVxuXHQgICAgOiB0aGlzLnJlY29ubmVjdERlbGF5O1xuICAgIH1cbn07XG5cbi8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuXG5tb2R1bGUuZXhwb3J0cy5XZWJTb2NrZXRDb25uZWN0aW9uID0gV2ViU29ja2V0Q29ubmVjdGlvbjtcbiIsIi8qIFdlYiBXb3JrZXIgaW50ZXJmYWNlICovXG52YXIgR3JvdW5kID0gcmVxdWlyZShcIi4vZ3JvdW5kLmpzXCIpLkdyb3VuZDtcbnZhciBVdGlsID0gcmVxdWlyZShcIi4vdXRpbC5qc1wiKTtcbnZhciBDb2RlYyA9IHJlcXVpcmUoXCIuL2NvZGVjLmpzXCIpO1xuXG52YXIgTWluaW1hcnQgPSByZXF1aXJlKFwiLi9taW5pbWFydC5qc1wiKTtcbnZhciBXb3JsZCA9IE1pbmltYXJ0LldvcmxkO1xudmFyIHN1YiA9IE1pbmltYXJ0LnN1YjtcbnZhciBwdWIgPSBNaW5pbWFydC5wdWI7XG52YXIgX18gPSBNaW5pbWFydC5fXztcblxudmFyIEJ1aWx0aW5Xb3JrZXIgPSB0eXBlb2Ygd2luZG93ICE9PSAndW5kZWZpbmVkJyAmJiB3aW5kb3cuV29ya2VyO1xuXG4vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cblxuZnVuY3Rpb24gV29ya2VyKHNjcmlwdFVybCkge1xuICB0aGlzLnNjcmlwdFVybCA9IHNjcmlwdFVybDtcbiAgdGhpcy53ID0gbmV3IEJ1aWx0aW5Xb3JrZXIoc2NyaXB0VXJsKTtcbn1cblxuV29ya2VyLnByb3RvdHlwZS5ib290ID0gZnVuY3Rpb24gKCkge1xuICB0aGlzLncub25tZXNzYWdlID0gV29ybGQud3JhcChmdW5jdGlvbiAoZSkge1xuICAgIGNvbnNvbGUubG9nKFwiUmVjZWl2ZWQgZnJvbSB3b3JrZXJcIiwgSlNPTi5zdHJpbmdpZnkoZS5kYXRhKSk7XG4gICAgV29ybGQuY3VycmVudCgpLmVucXVldWVBY3Rpb24oV29ybGQuYWN0aXZlUGlkKCksIENvZGVjLmRlY29kZUFjdGlvbihlLmRhdGEpKTtcbiAgfSk7XG59O1xuXG5Xb3JrZXIucHJvdG90eXBlLmhhbmRsZUV2ZW50ID0gZnVuY3Rpb24gKGUpIHtcbiAgY29uc29sZS5sb2coXCJTZW5kaW5nIHRvIHdvcmtlclwiLCBKU09OLnN0cmluZ2lmeShDb2RlYy5lbmNvZGVFdmVudChlKSkpO1xuICB0aGlzLncucG9zdE1lc3NhZ2UoQ29kZWMuZW5jb2RlRXZlbnQoZSkpO1xufTtcblxuLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG5cbmZ1bmN0aW9uIFdvcmtlckdyb3VuZChib290Rm4pIHtcbiAgdmFyIHNlbGYgPSB0aGlzO1xuICBHcm91bmQuY2FsbCh0aGlzLCBib290Rm4pO1xuICBvbm1lc3NhZ2UgPSBmdW5jdGlvbiAoZSkge1xuICAgIGNvbnNvbGUubG9nKFwiUmVjZWl2ZWQgZnJvbSBtYWluIHBhZ2VcIiwgSlNPTi5zdHJpbmdpZnkoZS5kYXRhKSk7XG4gICAgc2VsZi53b3JsZC5oYW5kbGVFdmVudChDb2RlYy5kZWNvZGVFdmVudChlLmRhdGEpKTtcbiAgICBzZWxmLnN0YXJ0U3RlcHBpbmcoKTtcbiAgfTtcbn1cblxuV29ya2VyR3JvdW5kLnByb3RvdHlwZSA9IFV0aWwuZXh0ZW5kKHt9LCBHcm91bmQucHJvdG90eXBlKTtcblxuV29ya2VyR3JvdW5kLnByb3RvdHlwZS5lbnF1ZXVlQWN0aW9uID0gZnVuY3Rpb24gKHBpZCwgYWN0aW9uKSB7XG4gIGNvbnNvbGUubG9nKFwiU2VuZGluZyB0byBtYWluIHBhZ2VcIiwgSlNPTi5zdHJpbmdpZnkoQ29kZWMuZW5jb2RlQWN0aW9uKGFjdGlvbikpKTtcbiAgcG9zdE1lc3NhZ2UoQ29kZWMuZW5jb2RlQWN0aW9uKGFjdGlvbikpO1xuICBjb25zb2xlLmxvZyhcIlNlbnQgdG8gbWFpbiBwYWdlXCIpO1xufTtcblxuLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG5cbm1vZHVsZS5leHBvcnRzLldvcmtlciA9IFdvcmtlcjtcbm1vZHVsZS5leHBvcnRzLldvcmtlckdyb3VuZCA9IFdvcmtlckdyb3VuZDtcbiJdfQ==
(6)
});
