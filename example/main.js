var vor = require('../vor'),
    dummy = {dummy: "dummy"},
    sentinel = {sentinel: "sentinel"},
    sentinel2 = {sentinel: "sentinel2"},
    sentinel3 = {sentinel: "sentinel3"};

vor({async:false});
vor.resolved(dummy).then(function(val) { console.log('dummy:', dummy); });
console.log('after');

function xFactory() {
    return {
        tag: 'x',
        then: function (resolvePromise) {
            resolvePromise(yFactory());
        }
    };
}

function yFactory() {
    return {
        tag: 'y',
        then: function (onFulfilled) {
            onFulfilled(sentinel);
        }
    };
}

var promise = vor.resolved(dummy).then(function onBasePromiseFulfilled() {
    return xFactory();
});

promise.then(function onPromiseFulfilled(value) {
    //assert.strictEqual(value, fulfillmentValue);
    //done();
    console.log('VAL:', value);
});

var a = vor.Deferred(function() {}).then(null, function(reason) {
    console.log('CANCEL:', reason);
});

a.cancel();