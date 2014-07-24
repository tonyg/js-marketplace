var util = require('util');
var r = require("../src/route.js");

function dump(x) {
    console.log(util.inspect(x, { depth: null }));
    return x;
}

function dumpM(m) {
    console.log(r.prettyMatcher(m));
    console.log();
    return m;
}

function dumpG(g) {
    console.log(g.pretty());
    console.log();
    return g;
}

mAny = r.compilePattern(r.arrayToSet(['mAny']), r.__);
mAAny = r.compilePattern(r.arrayToSet(['mAAny']), ['A', r.__]);
dumpM(mAny);
dumpM(mAAny);

dump("mAny:");
dump(r.matchValue(mAny, 'hi'));
dump(r.matchValue(mAny, ['A', 'hi']));
dump(r.matchValue(mAny, ['B', 'hi']));
dump(r.matchValue(mAny, ['A', [['hi']]]));

dump("mAAny:");
dump(r.matchValue(mAAny, 'hi'));
dump(r.matchValue(mAAny, ['A', 'hi']));
dump(r.matchValue(mAAny, ['B', 'hi']));
dump(r.matchValue(mAAny, ['A', [['hi']]]));

console.log("unions");

dumpM(r.union(r.compilePattern(r.arrayToSet(['A']), [r.__, 'A']),
	      r.compilePattern(r.arrayToSet(['B']), [r.__, 'B'])));

dumpM(r.union(r.compilePattern(r.arrayToSet(['A']), [r.__, 'A']),
	      r.compilePattern(r.arrayToSet(['W']), r.__)));

console.log("projections");

dumpM(r.project(r.union(r.compilePattern(r.arrayToSet(['A']), r.__),
			r.compilePattern(r.arrayToSet(['B']), ['b'])),
		r.compileProjection(r._$([[r.__]]))));

dumpM(r.project(r.union(r.compilePattern(r.arrayToSet(['A']), [1, 2]),
			r.compilePattern(r.arrayToSet(['C']), [1, 3]),
			r.compilePattern(r.arrayToSet(['B']), [3, 4])),
		r.compileProjection([r._$(), r._$()])));

dump(r.matcherKeys(r.project(r.union(r.compilePattern(r.arrayToSet(['A']), [1, 2]),
				     r.compilePattern(r.arrayToSet(['C']), [1, 3]),
				     r.compilePattern(r.arrayToSet(['B']), [3, 4])),
			     r.compileProjection([r._$(), r._$()]))));

var R1 = r.compilePattern(r.arrayToSet(['A']), [r.__, "B"]);
var R2 = r.compilePattern(r.arrayToSet(['B']), ["A", r.__]);
var R12 = r.union(R1, R2);
dumpM(R1);
dumpM(R2);
dumpM(R12);
dumpM(r.erasePath(R12, R1));
dumpM(r.erasePath(R12, R2));

console.log();
dumpG(r.simpleGestalt(false, "A", 0, 0));
dumpG(r.simpleGestalt(true, "B", 0, 0));
dumpG(r.simpleGestalt(false, "A", 0, 0).union(r.simpleGestalt(true, "B", 0, 0)));

console.log();
dumpG(r.simpleGestalt(false, "A", 2, 2));
dumpG(r.simpleGestalt(true, "B", 2, 2));
dumpG(r.simpleGestalt(false, "A", 2, 2).union(r.simpleGestalt(true, "B", 2, 2)));

(function () {
    function check1(i, j, n) {
	var result = r.simpleGestalt(false, "A", i, j).label(123).matchValue("A", n, false);
	dump([i === n ? result.length === 1 && result[0] === 123 : result.length === 0,
	      i, j, n, result]);
    }
    function metaLevelCheck(n) {
	console.log("Checking message matching at metaLevel " + n);
	check1(0, 0, n);
	check1(0, 1, n);
	check1(0, 2, n);
	check1(2, 0, n);
	check1(2, 1, n);
	check1(2, 2, n);
	console.log();
    }
    metaLevelCheck(0);
    metaLevelCheck(1);
    metaLevelCheck(2);
})();

(function () {
    function check1(i, j, n) {
	var observer = r.simpleGestalt(true, r.__, i, n).label("observer");
	var observed = r.simpleGestalt(false, "A", i, j).label("observed");
	var resultM = observed.filter(observer);
	var resultL = observed.match(observer);
	dump([ (j < n
		? !resultM.isEmpty() && resultL.length === 1 && resultL[0] === "observer"
		: resultM.isEmpty() && resultL.length === 0),
	       i, j, n, resultL]);
    }
    function levelCheck(n) {
	console.log("Checking gestalt filtering at level " + n);
	check1(0, 0, n);
	check1(0, 1, n);
	check1(0, 2, n);
	check1(2, 0, n);
	check1(2, 1, n);
	check1(2, 2, n);
	console.log();
    }
    levelCheck(0);
    levelCheck(1);
    levelCheck(2);
})();

console.log("Checking matcher equality");
dump(r.matcherEquals(mAny, mAAny) === false);
dump(r.matcherEquals(mAny, mAny) === true);
dump(r.matcherEquals(mAAny, mAAny) === true);
dump(r.matcherEquals(r.union(r.compilePattern(r.arrayToSet(['A']), [r.__, 'A']),
			     r.compilePattern(r.arrayToSet(['B']), [r.__, 'B'])),
		     r.union(r.compilePattern(r.arrayToSet(['A']), [r.__, 'A']),
			     r.compilePattern(r.arrayToSet(['B']), [r.__, 'B'])))
     === true);
dump(r.matcherEquals(r.union(r.compilePattern(r.arrayToSet(['A']), [r.__, 'A']),
			     r.compilePattern(r.arrayToSet(['B']), [r.__, 'B'])),
		     r.union(r.compilePattern(r.arrayToSet(['B']), [r.__, 'B']),
			     r.compilePattern(r.arrayToSet(['A']), [r.__, 'A'])))
     === true);

dump(r.simpleGestalt(false, "A", 0, 0).union(r.simpleGestalt(true, "B", 0, 0))
     .equals(r.simpleGestalt(false, "A", 0, 0).union(r.simpleGestalt(true, "B", 0, 0)))
     === true);
dump(r.simpleGestalt(false, "A", 0, 0).union(r.simpleGestalt(true, "B", 0, 0))
     .equals(r.simpleGestalt(true, "B", 0, 0).union(r.simpleGestalt(false, "A", 0, 0)))
     === true);

dump(r.simpleGestalt(false, "A", 0, 0).union(r.simpleGestalt(true, "B", 0, 0))
     .equals(r.simpleGestalt(false, "B", 0, 0).union(r.simpleGestalt(true, "A", 0, 0)))
     === false);


console.log("debugging unions (1)");
dumpM(r.union(r.compilePattern(r.arrayToSet(['A']), [r.__, 2]),
	      r.compilePattern(r.arrayToSet(['C']), [1, 3]),
	      r.compilePattern(r.arrayToSet(['B']), [3, 4])));

dumpM(r.union(r.compilePattern(r.arrayToSet(['C']), [1, 3]),
	      r.compilePattern(r.arrayToSet(['B']), [3, 4])));

dumpM(r.union(r.compilePattern(r.arrayToSet(['A']), [r.__, 2]),
	      r.compilePattern(r.arrayToSet(['C']), [1, 3])));

dumpM(r.union(r.compilePattern(r.arrayToSet(['A']), [r.__, 2]),
	      r.compilePattern(r.arrayToSet(['B']), [3, 4])));

console.log("debugging unions (2)");
var MU = r.emptyMatcher;
MU = r.union(MU, r.compilePattern(r.arrayToSet(['A']), [r.__, 2]));
dumpM(MU);
MU = r.union(MU, r.compilePattern(r.arrayToSet(['C']), [1, 3]));
dumpM(MU);
MU = r.union(MU, r.compilePattern(r.arrayToSet(['B']), [3, 4]));
dumpM(MU);

console.log("debugging unions (3)");
dumpM(r.union(r.compilePattern(r.arrayToSet('A'), [2]),
	      dumpM(r.union(r.compilePattern(r.arrayToSet('B'), [2]),
			    r.compilePattern(r.arrayToSet('C'), [3])))));

(function () {
    console.log("matcherKeys on wild matchers");
    var M = r.union(r.compilePattern(r.arrayToSet(['A']), [r.__, 2]),
		    r.compilePattern(r.arrayToSet(['C']), [1, 3]),
		    r.compilePattern(r.arrayToSet(['B']), [3, 4]));
    dump(r.matcherKeys(r.project(M, r.compileProjection([r._$(), r._$()]))));
    dump(r.matcherKeys(r.project(M, r.compileProjection([r.__, r._$]))));
    var M2 = r.project(M, r.compileProjection([r._$(), r._$()]));
    dump(r.matcherKeys(r.project(M2,
				 r.compileProjection(r.__, r._$))));
    dump(r.matcherKeys(r.project(r.compilePattern(true, [r.embeddedMatcher(M2)]),
				 r.compileProjection([r.__, r._$]))));
    dump(r.matcherKeys(r.project(r.compilePattern(true, [[r.embeddedMatcher(M2)]]),
				 r.compileProjection([[r.__, r._$]]))));
})();

(function () {
    console.log("matcherKeys using multiple-values in projections");
    var M = r.union(r.compilePattern(r.arrayToSet(['A']), [1, 2]),
		    r.compilePattern(r.arrayToSet(['C']), [1, 3]),
		    r.compilePattern(r.arrayToSet(['B']), [3, 4]));
    var M2 = r.project(M, r.compileProjection([r._$(), r._$()]));
    dump(r.matcherKeys(M2));
    dump(r.matcherKeys(r.project(M2, r.compileProjection(r._$(), r._$()))));
})();

(function () {
    console.log("serializeMatcher");
    var M = r.union(r.compilePattern(r.arrayToSet(['A']), [r.__, 2]),
		    r.compilePattern(r.arrayToSet(['C']), [1, 3]),
		    r.compilePattern(r.arrayToSet(['D']), [r.__, 3]),
		    r.compilePattern(r.arrayToSet(['B']), [3, 4]));
    var S = r.serializeMatcher(M, r.setToArray);
    dump(S);
    console.log(JSON.stringify(S));
    dumpM(r.deserializeMatcher(S, r.arrayToSet));
    dump(r.matcherEquals(M, r.deserializeMatcher(S, r.arrayToSet)) === true);
})();

(function () {
    console.log("serialize Gestalts");
    var G = dumpG(r.simpleGestalt(false, "A", 0, 0).union(r.simpleGestalt(true, "B", 2, 2)));
    var S = G.serialize();
    dump(S);
    console.log(JSON.stringify(S));
    dumpG(r.deserializeGestalt(S));
    dump(G.equals(r.deserializeGestalt(S)) === true);
})();

(function () {
    console.log("complex erasure");
    var A = r.compilePattern(r.arrayToSet(['A']), r.__);
    var B = r.union(r.compilePattern(r.arrayToSet(['B']), [[[["foo"]]]]),
		    r.compilePattern(r.arrayToSet(['B']), [[[["bar"]]]]));
    var R0 = r.union(A, B);
    var R1a = r.erasePath(R0, B);
    var R1b = r.erasePath(R0, A);
    dumpM(R0);
    dumpM(R1a);
    dumpM(R1b);
    dump(r.matcherEquals(R1a, A) === true);
    dump(r.matcherEquals(R1b, B) === true);
})();

(function () {
    console.log("Embedding matchers in patterns");
    var M1a =
	r.compilePattern(r.arrayToSet(['A']),
			 [1, r.embeddedMatcher(r.compilePattern(r.arrayToSet(['B']), [2, 3])), 4]);
    var M1b =
	r.compilePattern(r.arrayToSet(['A']), [1, [2, 3], 4]);
    var M2a =
	r.compilePattern(r.arrayToSet(['A']),
			 [r.embeddedMatcher(r.compilePattern(r.arrayToSet(['B']), [1, 2])),
			  r.embeddedMatcher(r.compilePattern(r.arrayToSet(['C']), [3, 4]))]);
    var M2b =
	r.compilePattern(r.arrayToSet(['A']), [[1, 2], [3, 4]]);
    dumpM(M1a);
    dumpM(M2a);
    dump(r.matcherEquals(M1a, M1b) === true);
    dump(r.matcherEquals(M2a, M2b) === true);
})();
