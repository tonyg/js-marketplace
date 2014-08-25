///////////////////////////////////////////////////////////////////////////
// GUI

var Actor = Minimart.Actor;
var World = Minimart.World;
var sub = Minimart.sub;
var pub = Minimart.pub;
var __ = Minimart.__;
var _$ = Minimart._$;

function piece(text, pos, lo, hi, cls) {
    return "<span class='"+cls+"'>"+
	((pos >= lo && pos < hi)
	 ? text.substring(lo, pos) + "<span class='cursor'></span>" + text.substring(pos, hi)
	 : text.substring(lo, hi))
	+ "</span>";
}

function spawnGui() {
    World.spawn(new Actor(function () {
      Actor.subscribe(
	function () { return ["jQuery", "#inputRow", "+keypress", _$("event")]; },
	function (event) {
	  var keycode = event.keyCode;
	  var character = String.fromCharCode(event.charCode);
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
	});

      Actor.observeAdvertisers(
	function () { return ["fieldContents", _$("text"), _$("pos")]; },
	{ singleton: "field" },
	updateDisplay);

      Actor.observeAdvertisers(
	function () { return ["highlight", _$("state")]; },
	{ singleton: "highlight" },
	updateDisplay);

      function updateDisplay() {
	// BUG: escape text!
	var text = this.field ? this.field.text : "";
	var pos = this.field ? this.field.pos : 0;
	var highlight = this.highlight ? this.highlight.state : false;
	$("#fieldContents")[0].innerHTML = highlight
	  ? piece(text, pos, 0, highlight[0], "normal") +
	    piece(text, pos, highlight[0], highlight[1], "highlight") +
	    piece(text, pos, highlight[1], text.length + 1, "normal")
	  : piece(text, pos, 0, text.length + 1, "normal");
      }
    }));
}

///////////////////////////////////////////////////////////////////////////
// Textfield Model

function spawnModel() {
    var initialContents = "initial";
    World.spawn(new Actor(function () {
      this.fieldContents = initialContents;
      this.cursorPos = initialContents.length; /* positions address gaps between characters */

      Actor.advertise(
	function () { return ["fieldContents", this.fieldContents, this.cursorPos]; });

      Actor.subscribe(
	function () { return ["fieldCommand", _$("command")]; },
	function (command) {
	  if (command === "cursorLeft") {
	    this.cursorPos--;
	    if (this.cursorPos < 0)
	      this.cursorPos = 0;
	  } else if (command === "cursorRight") {
	    this.cursorPos++;
	    if (this.cursorPos > this.fieldContents.length)
	      this.cursorPos = this.fieldContents.length;
	  } else if (command === "backspace" && this.cursorPos > 0) {
	    this.fieldContents =
	      this.fieldContents.substring(0, this.cursorPos - 1) +
	      this.fieldContents.substring(this.cursorPos);
	    this.cursorPos--;
	  } else if (command.constructor === Array && command[0] === "insert") {
	    var newText = command[1];
	    this.fieldContents =
	      this.fieldContents.substring(0, this.cursorPos) +
	      newText +
	      this.fieldContents.substring(this.cursorPos);
	    this.cursorPos += newText.length;
	  }
	  this.updateRoutes();
	});
    }));
}

///////////////////////////////////////////////////////////////////////////
// Search engine

function spawnSearch() {
    World.spawn(new Actor(function () {
      var self = this;
      self.fieldContents = "";
      self.highlight = false;

      Actor.advertise(
	function () { return ["highlight", self.highlight]; });

      Actor.subscribe(
	function () { return ["jQuery", "#searchBox", "input", _$("event")]; },
	search);

      Actor.observeAdvertisers(
	function () { return ["fieldContents", _$("text"), _$("pos")]; },
	{ singleton: "field" },
	function () {
	  self.fieldContents = self.field ? self.field.text : "";
	  search();
	});

      function search() {
	var searchtext = $("#searchBox")[0].value;
	var oldHighlight = self.highlight;
	if (searchtext) {
	  var pos = self.fieldContents.indexOf(searchtext);
	  self.highlight = (pos !== -1) && [pos, pos + searchtext.length];
	} else {
	  self.highlight = false;
	}
	if (JSON.stringify(oldHighlight) !== JSON.stringify(self.highlight)) {
	  self.updateRoutes();
	}
      }
    }));
}

///////////////////////////////////////////////////////////////////////////
// Main

var G;
$(document).ready(function () {
    G = new Minimart.Ground(function () {
	Minimart.JQuery.spawnJQueryDriver();
	Minimart.DOM.spawnDOMDriver();
	Minimart.RoutingTableWidget.spawnRoutingTableWidget("#spy-holder", "spy");

	spawnGui();
	spawnModel();
	spawnSearch();
    });
    G.startStepping();
});
