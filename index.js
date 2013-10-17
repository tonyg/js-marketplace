var g = new Ground(function () {
    console.log('here');
    World.spawn({
	step: function () { console.log('step'); },
	boot: function () {
	    console.log('boot');
	    World.updateRoutes([sub(__), sub(__, 1)]);
	    World.send({msg: 'hello outer world'}, 1);
	    World.send({msg: 'hello inner world'}, 0);
	},
	handleEvent: function (e) {
	    console.log('handleEvent: ' + JSON.stringify(e));
	}
    });
});

g.startStepping();
