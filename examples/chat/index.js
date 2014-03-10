///////////////////////////////////////////////////////////////////////////
// Wire protocol representation of events and actions

function encodeEvent(e) {
    switch (e.type) {
    case "routes":
	var rs = [];
	for (var i = 0; i < e.routes.length; i++) {
	    rs.push(e.routes[i].toJSON());
	}
	return ["routes", rs];
    case "message":
	return ["message", e.message, e.metaLevel, e.isFeedback];
    }
}

function decodeAction(j) {
    switch (j[0]) {
    case "routes":
	var rs = [];
	for (var i = 0; i < j[1].length; i++) {
	    rs.push(Route.fromJSON(j[1][i]));
	}
	return updateRoutes(rs);
    case "message":
	return sendMessage(j[1], j[2], j[3]);
    default:
	throw { message: "Invalid JSON-encoded action: " + JSON.stringify(j) };
    }
}

///////////////////////////////////////////////////////////////////////////
// Main

function chatEvent(nym, status, utterance, stamp) {
    return ["chatEvent", nym, status, utterance, stamp || +(new Date())];
}
function chatEventNym(c) { return c[1]; }
function chatEventStatus(c) { return c[2]; }
function chatEventUtterance(c) { return c[3]; }
function chatEventStamp(c) { return c[4]; }

function outputItem(item) {
    var stamp = $("<span/>").text((new Date()).toGMTString()).addClass("timestamp");
    var item = $("<div/>").append([stamp].concat(item));
    var o = $("#chat_output");
    o.append(item);
    o[0].scrollTop = o[0].scrollHeight;
    return item;
}

function updateNymList(rs) {
    var statuses = {};
    for (var i = 0; i < rs.length; i++) {
	var p = rs[i].pattern;
	if (p[0] === "broker" && p[1] === 0 && p[2][0] === "chatEvent") {
	    statuses[chatEventNym(p[2])] = chatEventStatus(p[2]);
	}
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

    G = new Ground(function () {
	console.log('starting ground boot');
	// World.spawn(new Spy());
	spawnJQueryDriver();
	spawnDOMDriver();
	spawnRoutingTableWidget("#spy-holder", "spy", 1000);

	World.spawn(new WakeDetector());
	var wsconn = new WebSocketConnection("broker", $("#wsurl").val(), true);
	World.spawn(wsconn);
	World.spawn({
	    // Monitor connection, notifying connectivity changes
	    state: "crashed", // start with this to avoid spurious initial message print
	    boot: function () {
		World.updateRoutes([sub(["broker_state", __], 0, 1)]);
	    },
	    handleEvent: function (e) {
		if (e.type === "routes") {
		    var newState = (e.routes.length > 0) ? e.routes[0].pattern[1] : "crashed";
		    if (this.state != newState) {
			outputState(newState);
			this.state = newState;
		    }
		}
	    }
	});
	World.spawn({
	    // Actual chat functionality
	    peers: new PresenceDetector(),
	    peerMap: {},
	    boot: function () {
		World.updateRoutes(this.subscriptions());
	    },
	    nym: function () { return $("#nym").val(); },
	    currentStatus: function () { return $("#status").val(); },
	    subscriptions: function () {
		return [sub("wake"),
			sub(["jQuery", "#send_chat", "click", __]),
			sub(["jQuery", "#nym", "change", __]),
			sub(["jQuery", "#status", "change", __]),
			sub(["jQuery", "#wsurl", "change", __]),
			pub(["broker", 0, chatEvent(this.nym(), this.currentStatus(), __, __)]),
			sub(["broker", 0, chatEvent(__, __, __, __)], 0, 1)];
	    },
	    handleEvent: function (e) {
		var self = this;
		switch (e.type) {
		case "routes":
		    updateNymList(e.routes);
		    break;
		case "message":
		    if (e.message === "wake") {
			wsconn.forceclose();
			return;
		    }
		    switch (e.message[0]) {
		    case "jQuery":
			switch (e.message[1])  {
			case "#send_chat":
			    var inp = $("#chat_input");
			    var utterance = inp.val();
			    inp.val("");
			    if (utterance) {
				World.send(["broker", 0, chatEvent(this.nym(),
								   this.currentStatus(),
								   utterance)]);
			    }
			    break;
			case "#nym":
			case "#status":
			    World.updateRoutes(this.subscriptions());
			    break;
			case "#wsurl":
			    wsconn.forceclose();
			    wsconn.wsurl = $("#wsurl").val();
			    break;
			default:
			    console.log("Got jquery event from as-yet-unhandled subscription",
					e.message[2], e.message[3]);
			}
			break;
		    case "broker":
			if (e.message[2][0] === "chatEvent") {
			    outputUtterance(chatEventNym(e.message[2]),
					    chatEventUtterance(e.message[2]));
			}
			break;
		    default:
			break;
		    }
		    break;
		}
	    }
	});
    });
    G.startStepping();
});
