var G;
$(document).ready(function () {
    G = new Ground(function () {
	console.log('starting ground boot');
	// World.spawn(new Spy("GROUND", true));
	spawnDOMDriver();
	spawnRoutingTableWidget("#spy-holder", "spy");

	World.spawn({
	    handleEvent: function (e) {
		if (e.type === "message" && e.message[0] === "jQuery") {
		    World.send("bump_count");
		}
	    }
	}, [pub(["DOM", "#clicker-holder", "clicker",
		 ["button", ["span", {"style": "font-style: italic"}, "Click me!"]]]),
	    pub("bump_count"),
	    sub(["jQuery", "button.clicker", "click", __])]);

	World.spawn({
	    counter: 0,
	    boot: function () {
		this.updateState();
	    },
	    updateState: function () {
		World.updateRoutes([sub("bump_count"),
				    pub(["DOM", "#counter-holder", "counter",
					 ["div",
					  ["p", "The current count is: ", this.counter]]])]);
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
