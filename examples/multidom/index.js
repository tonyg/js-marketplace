var G;
$(document).ready(function () {
    var World = Minimart.World;
    var sub = Minimart.sub;
    var pub = Minimart.pub;
    var __ = Minimart.__;
    var _$ = Minimart._$;

    G = new Minimart.Ground(function () {
	var localId = "instance-" + Math.floor(Math.random() * 65536);

	function domWrap(selector, fragmentClass, fragmentSpec) {
	    return ["broker", 0, ["multidom", "DOM", selector, fragmentClass, fragmentSpec]];
	}

	function jQueryWrap(selector, eventName, eventValue) {
	    var v = eventValue instanceof Event || eventValue instanceof $.Event
		? Minimart.JQuery.simplifyDOMEvent(eventValue)
		: eventValue;
	    return ["broker", 0, ["multidom", "jQuery", selector, eventName, v]];
	}

	var wsconn = new Minimart.WebSocket.WebSocketConnection(
	    "broker", "ws://server.minimart.leastfixedpoint.com:8000/", true);
	World.spawn(wsconn);

	Minimart.DOM.spawnDOMDriver(domWrap, jQueryWrap); // remote
	Minimart.DOM.spawnDOMDriver(); // local
	Minimart.RoutingTableWidget.spawnRoutingTableWidget("#spy-holder", "spy"); // local

	World.spawn({
	    boot: function () {
	      return [pub(domWrap("#clicker-holder", localId + "-clicker",
				  ["button", ["span", [["style", "font-style: italic"]],
					      "Click me! (" + localId + ")"]])),
		      pub("bump_count"),
		      sub(jQueryWrap("button."+localId+"-clicker", "click", __))];
	    },
	    handleEvent: function (e) {
		console.log(JSON.stringify(e));
		if (e.type === "message"
		    && e.message[0] === "broker"
		    && Array.isArray(e.message[2])
		    && e.message[2][0] === "multidom"
		    && e.message[2][1] === "jQuery")
		{
		    World.send("bump_count");
		}
	    }
	});

	World.spawn({
	    counter: 0,
	    boot: function () {
		this.updateState();
	    },
	    updateState: function () {
		World.updateRoutes([sub("bump_count"),
				    pub(domWrap("#counter-holder", localId + "-counter",
						["div",
						 ["p", "The current count for ",
						  localId,
						  " is: ",
						  this.counter]]))]);
	    },
	    handleEvent: function (e) {
		if (e.type === "message" && e.message === "bump_count") {
		    this.counter++;
		    this.updateState();
		}
	    }
	});
    });
    G.startStepping();
});
