var Reflect = require("./reflect.js");

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

function extractChunk(type, defaultOptions, args) {
    var options = null;
    var handler = null;
    for (var i = 1; i < args.length; i++) { // NB: skip the first arg - it's rawProjection
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
	rawProjection: args[0],
	options: options,
	handler: handler
    };
}

function chunkExtractor(type, defaultOptions) {
    return function (/* ... */) {
	checkChunks(type);
	Actor._chunks.push(extractChunk(type,
					defaultOptions,
					Array.prototype.slice.call(arguments)));
    };
}

var participatorDefaults = {
    metaLevel: 0,
    when: function () { return true; }
};

var observerDefaults = {
    metaLevel: 0,
    level: 0,
    when: function () { return true; },
    presence: null,
    name: null,
    set: null,
    added: null,
    removed: null
};

Actor.advertise = chunkExtractor('advertise', participatorDefaults);
Actor.subscribe = chunkExtractor('subscribe', participatorDefaults);

Actor.observeAdvertisers = chunkExtractor('observeAdvertisers', observerDefaults);
Actor.observeSubscribers = chunkExtractor('observeSubscribers', observerDefaults);

Actor.observeGestalt = function (gestaltFn, eventHandlerFn) {
    checkChunks('observeGestalt');
    Actor._chunks.push({
	type: 'observeGestalt',
	gestaltFn: gestaltFn,
	eventHandlerFn: eventHandlerFn
    });
};

function finalizeActor(behavior, chunks) {
    throw new Error("notYetImplemented"); // HERE
}

function kwApply(f, thisArg, args) {
    var formals = Reflect.formalParameters(f);
    var actuals = []
    for (var i = 0; i < formals.length; i++) {
	var formal = formals[i];
	if (!(formal in args)) {
	    throw new Error("Function parameter "+formal+" not present in args");
	}
	actuals.push(args[formal]);
    }
    return f.apply(thisArg, actuals);
}

///////////////////////////////////////////////////////////////////////////

module.exports.Actor = Actor;
module.exports.kwApply = kwApply;
