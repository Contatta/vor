(function(global, empty) {
    var STATE_PENDING = 0,
        STATE_FULFILLED = 1,
        STATE_REJECTED = 2;

    var setImmediate = (function() {
        if (global.postMessage && !global.importScripts) {
            var message = 'setImmediate$' + Date.now(), queue = [];
            global.addEventListener("message", function(evt) {
                if (evt.source === global && evt.data === message) evt.stopPropagation(), (queue.length > 0) && queue.shift()();
            });
            return function(fn) { queue.push(fn), global.postMessage(message, "*"); }
        }
        else {
            return function(fn) { setTimeout(fn, 0); }
        }
    })();

    function promise(resolver, canceller) {
        var queue = [], state = STATE_PENDING, keep;

        if (resolver) resolver(resolveMe, rejectMe, progressMe);

        return {
            then: then,
            cancel: cancel
        };

        function resolveMe(value) {
            if (state !== STATE_PENDING) return;

            state = STATE_FULFILLED, keep = value;

            function resolveDrain() {
                for (var i = 0, l = queue.length; i < l; i++) queue[i][0] && queue[i][0](keep);
                queue = null;
            }

            if (typeof keep.then === 'function') keep.then(resolveDrain);
            else resolveDrain();
        }

        function rejectMe(reason) {
            if (state !== STATE_PENDING) return;

            state = STATE_REJECTED, keep = reason;

            function rejectDrain() {
                for (var i = 0, l = queue.length; i < l; i++) queue[i][1] && queue[i][1](keep);
                queue = null;
            }

            rejectDrain();
        }

        function progressMe(value) {
            if (state !== STATE_PENDING) return;

            function progressUpdate() {
                for (var i = 0, l = queue.length; i < l; i++) queue[i][2] && queue[i][2](value);
            }

            progressUpdate();
        }

        function cancelMe(reason) {
            rejectMe(reason);
        }

        function cancel() {
            canceller && canceller(cancelMe);
        }

        function then(onFulfilled, onRejected, onProgress) {
            if (state === STATE_PENDING) {
                return promise(function (resolveNext, rejectNext, progressNext) {
                    queue.push([function(value) {
                        try {
                            var result = onFulfilled(value);
                            if (result && typeof result.then === 'function') result.then(resolveNext, rejectNext, progressNext);
                            else resolveNext(result !== empty ? result : value);
                        }
                        catch (e) {
                            rejectNext(e);
                        }
                    }, function(reason) {
                        onRejected(reason);
                        rejectNext(reason);
                    }, function(value) {
                        onProgress(value);
                        progressNext(value);
                    }]);
                }, canceller);
            } else if (state === STATE_FULFILLED && typeof onFulfilled === 'function') {
                return promise(function(resolveNext, rejectNext, progressNext) {
                    try {
                        var result = onFulfilled(keep);
                        if (result && typeof result.then === 'function') result.then(resolveNext, rejectNext, progressNext);
                        else resolveNext(result !== empty ? result : value);
                    }
                    catch (e) {
                        rejectNext(e);
                    }
                }, canceller);
            } else if (state === STATE_REJECTED && typeof onRejected === 'function') {
                return promise(function(resolveNext, rejectNext, progressNext) {
                    onRejected(keep);
                    rejectNext(keep);
                }, canceller);
            }
        }
    }

    function Deferred(cancel) {
        if (!(this instanceof Deferred)) return new Deferred(cancel);
        this.promise = promise((function(resolveMe, rejectMe, progressMe) {
            this.resolve = resolveMe;
            this.reject = rejectMe;
            this.progress = progressMe;
        }).bind(this), cancel && (function(cancelMe) {
            cancelMe(cancel(this));
        }).bind(this));
        this.then = this.promise.then;
        this.cancel = this.promise.cancel;
    }

    promise.Deferred = Deferred;

    if (typeof module != 'undefined' && module.exports) module.exports = promise;
    else if (typeof define == 'function' && typeof define.amd == 'object') define(function() { return promise; });
    else global.vor = promise;
})(this);