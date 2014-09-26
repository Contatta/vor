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