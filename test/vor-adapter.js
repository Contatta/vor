var vor = require('../vor');

exports.deferred = function() {
    return vor.Deferred();
};
exports.fulfilled = function(value) {
    return vor(function(resolve) { resolve(value); });
};
exports.rejected = function(reason) {
    return vor(function(resolve, reject) { reject(reason); });
};
exports.pending = function() {
    var pending = {};
    pending.promise = vor(function(resolve, reject) {
        pending.fulfill = resolve;
        pending.reject = reject;
    });
    return pending;
};