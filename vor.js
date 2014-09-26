(function(scope, empty) {
    'use strict';

    var STATE_PENDING = 0,
        STATE_FULFILLED = 1,
        STATE_REJECTED = 2,
        STATE_TO_STRING = {0:'pending', 1:'fulfilled', 2:'rejected'};

    var task = (function() {
        if (typeof process === 'object' && process.nextTick) {
            return function(fn) { process.nextTick(fn); }
        } else if (scope.postMessage === 'function' && !scope.importScripts) {
            var message = 'enqueue$' + Date.now(), queue = [];
            scope.addEventListener("message", function(evt) {
                if (evt.source === scope && evt.data === message) evt.stopPropagation(), (queue.length > 0) && queue.shift()();
            });
            return function(fn) { queue.push(fn), scope.postMessage(message, "*"); }
        } else {
            return function(fn) { setTimeout(fn, 0); }
        }
    })();

    function chainResolve(onFulfilled, resolveNext, rejectNext, progressNext) {
        return function(promise, value) {
            try {
                var out = value;
                if (typeof onFulfilled === 'function') out = onFulfilled(value), out = out !== empty ? out : value;
                var then = out && out.then;
                if (out === promise || value === promise) throw new TypeError("same promise");
                else if (typeof then === 'function') then.call(out, resolveNext, rejectNext, progressNext);
                else resolveNext(out);
            }
            catch (e) {
                rejectNext(e);
            }
        }
    }

    function chainReject(onRejected, resolveNext, rejectNext, progressNext) {
        return function(promise, reason) {
            try {
                var out;
                if (typeof onRejected === 'function') out = onRejected(reason);
                var then = out && out.then;
                if (out === promise || reason === promise) throw new TypeError("same promise");
                else if (out === empty) rejectNext(reason);
                else if (typeof then === 'function') then.call(out, resolveNext, rejectNext, progressNext);
                else resolveNext(out);
            }
            catch (e) {
                rejectNext(e);
            }
        }
    }

    function chainProgress(onProgress, resolveNext, rejectNext, progressNext) {
        return function(promise, value) {
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

        var promise = {};

        promise.then = then;
        promise.state = function() { return STATE_TO_STRING[state]; };

        if (canceller) promise.cancel = function() { canceller.call(promise, cancelMe); };
        if (resolver) resolver.call(promise, resolveMe, rejectMe, progressMe);

        return promise;

        function resolveMe(value) {
            if (state !== STATE_PENDING) return;
            try {
                var then = value && value.then;
                if (typeof then === 'function') return task(chainResolve(null, resolveMe, rejectMe, progressMe).bind(null, this, value));
            } catch (e) {
                return rejectMe(e);
            }
            state = STATE_FULFILLED, keep = value;
            function drainResolveQueue() {
                for (var i = 0, l = queue.length; i < l; i++) queue[i][0] && queue[i][0](keep);
                queue = null;
            }
            task(drainResolveQueue);
        }

        function rejectMe(reason) {
            if (state !== STATE_PENDING) return;
            try {
                var then = reason && reason.then;
                if (typeof then === 'function') return task(chainReject(null, resolveMe, rejectMe, progressMe).bind(null, this, reason));
            } catch (e) {
                return rejectMe(e);
            }
            state = STATE_REJECTED, keep = reason;
            function drainRejectQueue() {
                for (var i = 0, l = queue.length; i < l; i++) queue[i][1] && queue[i][1](keep);
                queue = null;
            }
            task(drainRejectQueue)
        }

        function progressMe(value) {
            if (state !== STATE_PENDING) return;
            function iterateProgressQueue() {
                for (var i = 0, l = queue.length; i < l; i++) queue[i][2] && queue[i][2](value);
            }
            task(iterateProgressQueue);
        }

        function cancelMe(reason) { rejectMe(reason); }

        function then(onFulfilled, onRejected, onProgress) {
            if (state === STATE_PENDING) {
                return make(function (resolveNext, rejectNext, progressNext) {
                    queue.push([
                        chainResolve(onFulfilled, resolveNext, rejectNext, progressNext).bind(null, this),
                        chainReject(onRejected, resolveNext, rejectNext, progressNext).bind(null, this),
                        chainProgress(onProgress, resolveNext, rejectNext, progressNext).bind(null, this)
                    ]);
                }, canceller);
            } else if (state === STATE_FULFILLED) {
                return make(function(resolveNext, rejectNext, progressNext) {
                    task(chainResolve(onFulfilled, resolveNext, rejectNext, progressNext).bind(null, this, keep));
                }, canceller);
            } else if (state === STATE_REJECTED) {
                return make(function(resolveNext, rejectNext, progressNext) {
                    task(chainReject(onRejected, resolveNext, rejectNext, progressNext).bind(null, this, keep));
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
        this.then = this.promise.then, cancel && (this.cancel = this.promise.cancel);
        this.state = this.promise.state;
    }

    make.Deferred = Deferred;

    make.rejected = function(reason) { return make(function(_, reject) { reject(reason); }); };
    make.resolved = function(value) { return make(function(resolve) { resolve(value); }); };

    if (typeof module != 'undefined' && module.exports) module.exports = make;
    else if (typeof define == 'function' && typeof define.amd == 'object') define(function() { return make; });
    else scope.vor = make;
})(this);