function Spy() {
}

Spy.prototype.boot = function () {
    World.updateRoutes([sub(__, 0, 1000), pub(__, 0, 1000)]);
};

Spy.prototype.handleEvent = function (e) {
    console.log("SPY", e);
};

function JQueryDriver() {
    this.handlerMap = {};
}

JQueryDriver.prototype.updateHandlerMap = function (routes) {
    var newMap = {};
    for (var i = 0; i < routes.length; i++) {
	var selector = routes[i].pattern[1];
	var eventName = routes[i].pattern[2];
	if (typeof(selector) === 'string' && typeof(eventName) === 'string') {
	    var key = JSON.stringify([selector, eventName]);
	    var handler = this.handlerMap[key];
	    if (!handler) {
		handler = (function (selector, eventName) { // JS is broken
		    return World.wrap(function (e) {
			World.send(["jQuery", selector, eventName, e]);
			World.current.startStepping();
		    });
		})(selector, eventName);
		console.log("jQuery", "installing", selector, eventName);
		$(selector).on(eventName, handler);
	    }
	    newMap[key] = handler;
	}
    }
    for (var key in this.handlerMap) {
	if (hasOwnProperty(this.handlerMap, key) && !hasOwnProperty(newMap, key)) {
	    var keyArray = JSON.parse(key);
	    var handler = this.handlerMap[key];
	    var selector = keyArray[0];
	    var eventName = keyArray[1];
	    console.log("jQuery", "removing", selector, eventName);
	    $(selector).off(eventName, handler);
	}
    }
    this.handlerMap = newMap;
};

JQueryDriver.prototype.boot = function () {
    World.updateRoutes([pub(["jQuery", __, __, __], 0, 1)]);
};

JQueryDriver.prototype.handleEvent = function (e) {
    if (e.type === "routes") {
	this.updateHandlerMap(e.routes);
    }
};

var g = new Ground(function () {
    console.log('here');
    World.spawn(new Spy());
    World.spawn(new JQueryDriver());
    World.spawn({
	step: function () { console.log('dummy step'); },
	boot: function () {
	    console.log('dummy boot');
	    World.updateRoutes([sub(["jQuery", "#testButton", "click", __]), sub(__, 1)]);
	    World.send({msg: 'hello outer world'}, 1);
	    World.send({msg: 'hello inner world'}, 0);
	},
	handleEvent: function (e) {
	    console.log('dummy handleEvent', e);
	}
    });
});

g.startStepping();
