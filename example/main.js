var vor = require('../vor'),
    dummy = {dummy: "dummy"},
    sentinel = {sentinel: "sentinel"},
    sentinel2 = {sentinel: "sentinel2"},
    sentinel3 = {sentinel: "sentinel3"};

numberOfTimesThenWasRetrieved = 0;

function xFactory() {
    return Object.create(null, {
        then: {
            get: function () {
                ++numberOfTimesThenWasRetrieved;
                return function thenMethodForX(onFulfilled) {
                    onFulfilled();
                };
            }
        }
    });
}

var promise = vor.resolved(dummy).then(function onBasePromiseFulfilled() {
    return xFactory();
});

promise.then(function () {
    //assert.strictEqual(numberOfTimesThenWasRetrieved, 1);
    //done();
    console.log('#:', numberOfTimesThenWasRetrieved);
});