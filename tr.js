var util = require('util');
var r = require("./route.js");

function dump(x) {
    console.log(util.inspect(x, { depth: null }));
    return x;
}

function dumpM(m) {
    console.log(r.prettyMatcher(m));
    console.log();
    return m;
}

mAny = r.compilePattern(r.newSet('mAny'), r.__);
mAAny = r.compilePattern(r.newSet('mAAny'), ['A', r.__]);
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

dumpM(r.union(r.compilePattern(r.newSet('A'), [r.__, 'A']),
	      r.compilePattern(r.newSet('B'), [r.__, 'B'])));

dumpM(r.union(r.compilePattern(r.newSet('A'), [r.__, 'A']),
	      r.compilePattern(r.newSet('W'), r.__)));

console.log("projections");

dumpM(r.project(r.union(r.compilePattern(r.newSet('A'), r.__),
			r.compilePattern(r.newSet('B'), ['b'])),
		r.compileProjection(r._$([[r.__]]))));

dumpM(r.project(r.union(r.compilePattern(r.newSet('A'), [1, 2]),
			r.compilePattern(r.newSet('C'), [1, 3]),
			r.compilePattern(r.newSet('B'), [3, 4])),
		r.compileProjection([r._$(), r._$()])));

dump(r.matcherKeys(r.project(r.union(r.compilePattern(r.newSet('A'), [1, 2]),
				     r.compilePattern(r.newSet('C'), [1, 3]),
				     r.compilePattern(r.newSet('B'), [3, 4])),
			     r.compileProjection([r._$(), r._$()]))));

var R1 = r.compilePattern(r.newSet('A'), [r.__, "B"]);
var R2 = r.compilePattern(r.newSet('B'), ["A", r.__]);
var R12 = r.union(R1, R2);
dumpM(R1);
dumpM(R2);
dumpM(R12);
dumpM(r.erasePath(R12, R1));
dumpM(r.erasePath(R12, R2));
