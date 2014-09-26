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

    function joinResolve(onFulfilled, resolveNext, rejectNext, progressNext) {
        return function(value) {
            var chained;
            try {
                if (typeof onFulfilled === 'function')
                    chained = onFulfilled(value), chained = chained !== empty ? chained : value;
                else
                    chained = value;
            }
            catch (e) {
                rejectNext(e);
            }
            if (chained && typeof chained.then === 'function')
                chained.then(resolveNext, rejectNext, progressNext);
            else
                resolveNext(chained);
        }
    }

    function joinReject(onRejected, resolveNext, rejectNext, progressNext) {
        return function(reason) {
            var chained;
            try {
                if (typeof onRejected === 'function')
                    chained = onRejected(reason), chained = chained !== empty ? chained : reason;
                else
                    chained = reason;
            }
            catch (e) {
                chained = e;
            }
            rejectNext(chained);
        }
    }

    function joinProgress(onProgress, resolveNext, rejectNext, progressNext) {
        return function(value) {
            try {
                if (typeof onProgress === 'function')
                    onProgress(value);
            }
            catch (e) {}
            progressNext(value);
        }
    }

    function make(resolver, canceller) {
        var queue = [], state = STATE_PENDING, keep;

        if (resolver) resolver(resolveMe, rejectMe, progressMe);

        var prom = {};
        prom.then = then, canceller && (prom.cancel = cancel);
        return prom;

        function resolveMe(value) {
            if (state !== STATE_PENDING) return;
            state = STATE_FULFILLED, keep = value;
            function drainResolveQueue() {
                for (var i = 0, l = queue.length; i < l; i++) queue[i][0] && queue[i][0](keep);
                queue = null;
            }
            setImmediate(drainResolveQueue);
        }

        function rejectMe(reason) {
            if (state !== STATE_PENDING) return;
            state = STATE_REJECTED, keep = reason;
            function drainRejectQueue() {
                for (var i = 0, l = queue.length; i < l; i++) queue[i][1] && queue[i][1](keep);
                queue = null;
            }
            setImmediate(drainRejectQueue)
        }

        function progressMe(value) {
            if (state !== STATE_PENDING) return;
            function drainQueue() {
                for (var i = 0, l = queue.length; i < l; i++) queue[i][2] && queue[i][2](value);
            }
            setImmediate(drainQueue);
        }

        function cancelMe(reason) {
            rejectMe(reason);
        }

        function cancel() {
            canceller && canceller(cancelMe);
        }

        function then(onFulfilled, onRejected, onProgress) {
            if (state === STATE_PENDING) {
                return make(function (resolveNext, rejectNext, progressNext) {
                    queue.push([
                        joinResolve(onFulfilled, resolveNext, rejectNext, progressNext),
                        joinReject(onRejected, resolveNext, rejectNext, progressNext),
                        joinProgress(onProgress, resolveNext, rejectNext, progressNext)
                    ]);
                }, canceller);
            } else if (state === STATE_FULFILLED) {
                return make(function(resolveNext, rejectNext, progressNext) {
                    setImmediate(joinResolve(onFulfilled, resolveNext, rejectNext, progressNext).bind(null, keep));
                }, canceller);
            } else if (state === STATE_REJECTED) {
                return make(function(resolveNext, rejectNext, progressNext) {
                    setImmediate(joinReject(onRejected, resolveNext, rejectNext, progressNext).bind(null, keep));
                }, canceller);
            }
        }
    }

    function Deferred(cancel) {
        if (!(this instanceof Deferred)) return new Deferred(cancel);
        this.promise = make((function(resolveMe, rejectMe, progressMe) {
            this.resolve = resolveMe;
            this.reject = rejectMe;
            this.progress = progressMe;
        }).bind(this), cancel && (function(cancelMe) {
            cancelMe(cancel(this));
        }).bind(this));
        this.then = this.promise.then;
        this.cancel = this.promise.cancel;
    }

    make.Deferred = Deferred;

    make.rejected = function(reason) { return make(function(_, reject) { reject(reason); }); };
    make.resolved = function(value) { return make(function(resolve) { resolve(value); }); };

    if (typeof module != 'undefined' && module.exports) module.exports = make;
    else if (typeof define == 'function' && typeof define.amd == 'object') define(function() { return make; });
    else global.vor = make;
})(this);