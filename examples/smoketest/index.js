var G;
$(document).ready(function () {
    G = new Ground(function () {
	console.log('starting ground boot');
	World.spawn(new Spy("GROUND", true));
	World.spawn({
	    counter: 0,
	    handleEvent: function (e) {},
	    step: function () {
		World.send(["beep", this.counter++]);
		return this.counter <= 10;
	    }
	}, [pub(["beep", __])]);

	World.spawn({
	    handleEvent: function (e) {
		if (e.type === "message" && e.message[0] === "beep") {
		    console.log("beep!", e.message[1]);
		}
	    }
	}, [sub(["beep", __])]);
    });
    G.startStepping();
});
