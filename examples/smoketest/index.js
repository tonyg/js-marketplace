var G;
$(document).ready(function () {
    var World = Minimart.World;
    var sub = Minimart.sub;
    var pub = Minimart.pub;
    var __ = Minimart.__;
    var _$ = Minimart._$;

    G = new Minimart.Ground(function () {
	console.log('starting ground boot');
	World.spawn(new Minimart.Spy("GROUND", true));
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
