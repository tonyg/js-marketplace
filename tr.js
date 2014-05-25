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

console.log();
dump(r.simpleGestalt(false, "A", 0, 0).label(123).matchValue("A", 0, false));
dump(r.simpleGestalt(false, "A", 0, 1).label(123).matchValue("A", 0, false));
dump(r.simpleGestalt(false, "A", 0, 2).label(123).matchValue("A", 0, false));
dump(r.simpleGestalt(false, "A", 2, 0).label(123).matchValue("A", 0, false));
dump(r.simpleGestalt(false, "A", 2, 1).label(123).matchValue("A", 0, false));
dump(r.simpleGestalt(false, "A", 2, 2).label(123).matchValue("A", 0, false));

console.log();
dump(r.simpleGestalt(false, "A", 0, 0).label(123).matchValue("A", 1, false));
dump(r.simpleGestalt(false, "A", 0, 1).label(123).matchValue("A", 1, false));
dump(r.simpleGestalt(false, "A", 0, 2).label(123).matchValue("A", 1, false));
dump(r.simpleGestalt(false, "A", 2, 0).label(123).matchValue("A", 1, false));
dump(r.simpleGestalt(false, "A", 2, 1).label(123).matchValue("A", 1, false));
dump(r.simpleGestalt(false, "A", 2, 2).label(123).matchValue("A", 1, false));

console.log();
dump(r.simpleGestalt(false, "A", 0, 0).label(123).matchValue("A", 2, false));
dump(r.simpleGestalt(false, "A", 0, 1).label(123).matchValue("A", 2, false));
dump(r.simpleGestalt(false, "A", 0, 2).label(123).matchValue("A", 2, false));
dump(r.simpleGestalt(false, "A", 2, 0).label(123).matchValue("A", 2, false));
dump(r.simpleGestalt(false, "A", 2, 1).label(123).matchValue("A", 2, false));
dump(r.simpleGestalt(false, "A", 2, 2).label(123).matchValue("A", 2, false));

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

console.log("matcherKeys on wild matchers");
dump(r.matcherKeys(r.project(r.union(r.compilePattern(r.arrayToSet(['A']), [r.__, 2]),
				     r.compilePattern(r.arrayToSet(['C']), [1, 3]),
				     r.compilePattern(r.arrayToSet(['B']), [3, 4])),
			     r.compileProjection([r._$(), r._$()]))));
dump(r.matcherKeys(r.project(r.union(r.compilePattern(r.arrayToSet(['A']), [r.__, 2]),
				     r.compilePattern(r.arrayToSet(['C']), [1, 3]),
				     r.compilePattern(r.arrayToSet(['B']), [3, 4])),
			     r.compileProjection([r.__, r._$]))));
dump(r.matcherKeys(r.project(r.project(r.union(r.compilePattern(r.arrayToSet(['A']), [r.__, 2]),
					       r.compilePattern(r.arrayToSet(['C']), [1, 3]),
					       r.compilePattern(r.arrayToSet(['B']), [3, 4])),
				       r.compileProjection([r._$(), r._$()])),
			     r.compileProjection([r.__, r._$]))));
