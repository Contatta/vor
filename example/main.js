var vor = require('../vor'),
    dummy = { dummy: "dummy" };

vor.rejected(dummy).then(function() {}, undefined).then(null, function(reason) {
   console.log('REJECT', reason);
});

vor.resolved(dummy).then(undefined, function () { }).then(function (value) {
    console.log('RESOLVE', value);
}, null);