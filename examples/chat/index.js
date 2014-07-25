var Route = Minimart.Route;
var World = Minimart.World;
var Actor = Minimart.Actor;
var sub = Minimart.sub;
var pub = Minimart.pub;
var __ = Minimart.__;
var _$ = Minimart._$;

function chatEvent(nym, status, utterance, stamp) {
    return ["chatEvent", nym, status, utterance, stamp || +(new Date())];
}

function outputItem(item) {
    var stamp = $("<span/>").text((new Date()).toGMTString()).addClass("timestamp");
    var item = $("<div/>").append([stamp].concat(item));
    var o = $("#chat_output");
    o.append(item);
    o[0].scrollTop = o[0].scrollHeight;
    return item;
}

function updateNymList(allStatuses) {
    var statuses = {};
    for (var i = 0; i < allStatuses.length; i++) {
	statuses[allStatuses[i].nym] = allStatuses[i].status;
    }
    var nyms = [];
    for (var nym in statuses) { nyms.push(nym); }
    nyms.sort();

    var container = $("#nymlist");
    container[0].innerHTML = ""; // remove all children
    for (var i = 0; i < nyms.length; i++) {
	var n = $("<span/>").text(nyms[i]).addClass("nym");
	var s = statuses[nyms[i]];
	if (s) {
	    container.append($("<div/>").append([n, $("<span/>").text(s).addClass("nym_status")]));
	} else {
	    container.append($("<div/>").append(n));
	}
    }
}

function outputState(state) {
    outputItem([$("<span/>").text(state).addClass(state).addClass("state")])
    .addClass("state_" + state);
}

function outputUtterance(who, what) {
    outputItem([$("<span/>").text(who).addClass("nym"),
		$("<span/>").text(what).addClass("utterance")]).addClass("utterance");
}

var G;
$(document).ready(function () {
    $("#chat_form").submit(function (e) { e.preventDefault(); return false; });
    $("#nym_form").submit(function (e) { e.preventDefault(); return false; });
    if (!($("#nym").val())) { $("#nym").val("nym" + Math.floor(Math.random() * 65536)); }

    G = new Minimart.Ground(function () {
	console.log('starting ground boot');
	// World.spawn(new Spy());
	Minimart.JQuery.spawnJQueryDriver();
	Minimart.DOM.spawnDOMDriver();
	Minimart.RoutingTableWidget.spawnRoutingTableWidget("#spy-holder", "spy");

	World.spawn(new Minimart.WakeDetector());
	var wsconn = new Minimart.WebSocket.WebSocketConnection("broker", $("#wsurl").val(), true);
	World.spawn(wsconn);
	World.spawn(new Actor(function () {
	    // Monitor connection, notifying connectivity changes
	    this.state = "crashed"; // start with this to avoid spurious initial message print

	    Actor.observeAdvertisers(
		function () { return ["broker_state", _$("newState")]; },
		{ name: "states" },
		function () {
		    var newState = this.states.length > 0 ? this.states[0].newState : "crashed";
		    if (this.state != newState) {
			outputState(newState);
			this.state = newState;
		    }
		});
	}));
	World.spawn(new Actor(function () {
	    // Actual chat functionality
	    this.nym = function () { return $("#nym").val(); };
	    this.currentStatus = function () { return $("#status").val(); };

	    Actor.subscribe(
		function () { return "wake"; },
		function () { wsconn.forceclose(); });

	    Actor.advertise(
		function () { return ["broker", 0,
				      chatEvent(this.nym(), this.currentStatus(), __, __)]; });
	    Actor.observeAdvertisers(
		function () { return ["broker", 0,
				      chatEvent(_$("nym"), _$("status"), __, __)]; },
		{ name: "allStatuses" },
		function () { updateNymList(this.allStatuses); });

	    Actor.subscribe(
		function () { return ["jQuery", "#send_chat", "click", __]; },
		function () {
		    var inp = $("#chat_input");
		    var utterance = inp.val();
		    inp.val("");
		    if (utterance) {
			World.send(["broker", 0, chatEvent(this.nym(),
							   this.currentStatus(),
							   utterance)]);
		    }
		});

	    Actor.subscribe(
		function () { return ["jQuery", "#nym", "change", __]; },
		function () { this.updateRoutes(); });

	    Actor.subscribe(
		function () { return ["jQuery", "#status", "change", __]; },
		function () { this.updateRoutes(); });

	    Actor.subscribe(
		function () { return ["jQuery", "#wsurl", "change", __]; },
		function () {
		    wsconn.forceclose();
		    wsconn.wsurl = $("#wsurl").val();
		});

	    Actor.subscribe(
		function () { return ["broker", 0, chatEvent(_$("who"), __, _$("what"), __)]; },
		function (who, what) { outputUtterance(who, what); });
	}));
    });
    G.startStepping();
});
