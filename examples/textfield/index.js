///////////////////////////////////////////////////////////////////////////
// GUI

function piece(text, pos, lo, hi, cls) {
    return "<span class='"+cls+"'>"+
	((pos >= lo && pos < hi)
	 ? text.substring(lo, pos) + "<span class='cursor'></span>" + text.substring(pos, hi)
	 : text.substring(lo, hi))
	+ "</span>";
}

function spawnGui() {
    World.spawn({
	boot: function () {
	    World.updateRoutes([sub(["jQuery", "#inputRow", "+keypress", __]),
				sub(["fieldContents", __, __], 0, 1),
				sub(["highlight", __], 0, 1)]);
	},
	handleEvent: function (e) {
	    switch (e.type) {
	    case "routes":
		var text = "", pos = 0, highlight = false;
		// BUG: escape text!
		for (var i = 0; i < e.routes.length; i++) {
		    var r = e.routes[i];
		    if (r.pattern[0] === "fieldContents") {
			text = r.pattern[1];
			pos = r.pattern[2];
		    } else if (r.pattern[0] === "highlight") {
			highlight = r.pattern[1];
		    }
		}
		$("#fieldContents")[0].innerHTML = highlight
		    ? piece(text, pos, 0, highlight[0], "normal") +
		      piece(text, pos, highlight[0], highlight[1], "highlight") +
		      piece(text, pos, highlight[1], text.length + 1, "normal")
		    : piece(text, pos, 0, text.length + 1, "normal");
		break;
	    case "message":
		if (e.message[0] === "jQuery") { // it's a keypress event
		    var keycode = e.message[3].keyCode;
		    var character = String.fromCharCode(e.message[3].charCode);
		    if (keycode === 37 /* left */) {
			World.send(["fieldCommand", "cursorLeft"]);
		    } else if (keycode === 39 /* right */) {
			World.send(["fieldCommand", "cursorRight"]);
		    } else if (keycode === 9 /* tab */) {
			// ignore
		    } else if (keycode === 8 /* backspace */) {
			World.send(["fieldCommand", "backspace"]);
		    } else if (character) {
			World.send(["fieldCommand", ["insert", character]]);
		    }
		}
	    }
	}
    });
}

///////////////////////////////////////////////////////////////////////////
// Textfield Model

function spawnModel() {
    var initialContents = "initial";
    World.spawn({
	fieldContents: initialContents,
	cursorPos: initialContents.length, /* positions address gaps between characters */
	boot: function () {
	    World.updateRoutes(this.subscriptions());
	},
	subscriptions: function () {
	    return [sub(["fieldCommand", __]),
		    pub(["fieldContents", this.fieldContents, this.cursorPos])];
	},
	handleEvent: function (e) {
	    switch (e.type) {
	    case "message":
		if (e.message[1] === "cursorLeft") {
		    this.cursorPos--;
		    if (this.cursorPos < 0)
			this.cursorPos = 0;
		} else if (e.message[1] === "cursorRight") {
		    this.cursorPos++;
		    if (this.cursorPos > this.fieldContents.length)
			this.cursorPos = this.fieldContents.length;
		} else if (e.message[1] === "backspace" && this.cursorPos > 0) {
		    this.fieldContents =
			this.fieldContents.substring(0, this.cursorPos - 1) +
			this.fieldContents.substring(this.cursorPos);
		    this.cursorPos--;
		} else if (e.message[1].constructor === Array && e.message[1][0] === "insert") {
		    var newText = e.message[1][1];
		    this.fieldContents =
			this.fieldContents.substring(0, this.cursorPos) +
			newText +
			this.fieldContents.substring(this.cursorPos);
		    this.cursorPos += newText.length;
		}
		World.updateRoutes(this.subscriptions());
		break;
	    }
	}
    });
}

///////////////////////////////////////////////////////////////////////////
// Search engine

function spawnSearch() {
    World.spawn({
	fieldContents: "",
	highlight: false,
	boot: function () {
	    World.updateRoutes(this.subscriptions());
	},
	subscriptions: function () {
	    return [sub(["jQuery", "#searchBox", "input", __]),
		    sub(["fieldContents", __, __], 0, 1),
		    pub(["highlight", this.highlight])];
	},
	search: function () {
	    var searchtext = $("#searchBox")[0].value;
	    var oldHighlight = this.highlight;
	    if (searchtext) {
		var pos = this.fieldContents.indexOf(searchtext);
		this.highlight = (pos !== -1) && [pos, pos + searchtext.length];
	    } else {
		this.highlight = false;
	    }
	    if (JSON.stringify(oldHighlight) !== JSON.stringify(this.highlight)) {
		World.updateRoutes(this.subscriptions());
	    }
	},
	handleEvent: function (e) {
	    switch (e.type) {
	    case "routes":
		for (var i = 0; i < e.routes.length; i++) {
		    var r = e.routes[i];
		    if (r.pattern[0] === "fieldContents") {
			this.fieldContents = r.pattern[1];
		    }
		}
		this.search();
		break;
	    case "message":
		if (e.message[0] === "jQuery") { // it's a search box input event
		    this.search();
		}
	    }
	}
    });
}

///////////////////////////////////////////////////////////////////////////
// Main

var G;
$(document).ready(function () {
    G = new Ground(function () {
	spawnJQueryDriver();
	spawnGui();
	spawnModel();
	spawnSearch();
    });
    G.startStepping();
});
