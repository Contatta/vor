var vor = require('../vor'),
    dummy = {dummy: "dummy"},
    sentinel = {sentinel: "sentinel"},
    sentinel2 = {sentinel: "sentinel2"},
    sentinel3 = {sentinel: "sentinel3"};

function xFactory() {
    return {
        tag: 'x',
        then: function (resolvePromise) {
            resolvePromise(yFactory());
        }
    };
}

function yFactory() {
    var numberOfTimesThenRetrieved = 0;
    return Object.create(null, {
        then: {
            get: function () {
                if (numberOfTimesThenRetrieved === 0) {
                    ++numberOfTimesThenRetrieved;
                    return function (onFulfilled) {
                        onFulfilled(sentinel);
                    };
                }
                return null;
            }
        }
    });
}

var promise = vor.resolved(dummy).then(function onBasePromiseFulfilled() {
    return xFactory();
});

promise.then(function onPromiseFulfilled(value) {
    //assert.strictEqual(value, fulfillmentValue);
    //done();
    console.log('VAL:', value);
});

vor.every([vor.resolved(sentinel)]).then(function(value) {
    console.log('WVAL:', value);
});