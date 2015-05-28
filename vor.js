(function(scope, empty) {
    'use strict';

    var STATE_PENDING = 0,
        STATE_FULFILLED = 1,
        STATE_REJECTED = 2,
        STATE_TO_STRING = {0:'pending', 1:'fulfilled', 2:'rejected'};

    var taskAsync = (function() {
            if (typeof process === 'object' && process.nextTick) {
                return function taskAsyncTick(fn) { process.nextTick(fn); }
            } else if (scope.postMessage === 'function' && !scope.importScripts) {
                var message = 'enqueue$' + Date.now(), queue = [];
                scope.addEventListener("message", function(evt) {
                    if (evt.source === scope && evt.data === message) evt.stopPropagation(), (queue.length > 0) && queue.shift()();
                });
                return function taskAsyncMessage(fn) { queue.push(fn), scope.postMessage(message, "*"); }
            } else {
                return function taskAsyncTimeout(fn) { setTimeout(fn, 0); }
            }
        })(),
        taskSync = (function() {
            return function taskSyncCall(fn) { fn(); };
        })(),
        task = taskAsync;

    function chainResolve(onFulfilled, resolveNext, rejectNext, progressNext) {
        return function onChainResolve(promise, value) {
            try {
                var out = value;
                if (typeof onFulfilled === 'function') out = onFulfilled(value), out = out !== empty ? out : value;
                var then = out && out.then,
                    always = out && out.always,
                    done = out && out.done;

                if (out === promise || value === promise) throw new TypeError("same promise");
                else if (typeof then === 'function') then.call(out, resolveNext, rejectNext, progressNext);
                else if (typeof always === 'function') always.call(out, resolveNext);
                else if (typeof done === 'function') done.call(out, resolveNext);
                else resolveNext(out);
            }
            catch (e) {
                rejectNext(e);
            }
        }
    }

    function chainReject(onRejected, resolveNext, rejectNext, progressNext) {
        return function onChainReject(promise, reason) {
            try {
                var out;
                if (typeof onRejected === 'function') out = onRejected(reason);
                var then = out && out.then,
                    always = out && out.always,
                    fail = out && out.fail;

                if (out === promise || reason === promise) throw new TypeError("same promise");
                else if (out === empty) rejectNext(reason);
                else if (typeof then === 'function') then.call(out, resolveNext, rejectNext, progressNext);
                else if (typeof always === 'function') always.call(out, rejectNext);
                else if (typeof fail === 'function') fail.call(out, rejectNext);
                else resolveNext(out);
            }
            catch (e) {
                rejectNext(e);
            }
        }
    }

    function chainProgress(onProgress, resolveNext, rejectNext, progressNext) {
        return function onChainProgress(promise, value) {
            try {
                if (typeof onProgress === 'function')
                    onProgress(value);
            }
            catch (e) {}
            progressNext(value);
        }
    }

    function env(options) {
        if ('async' in options) task = options.async ? taskAsync : taskSync;
    }

    var tagger = (function() {
        var uid = 0;
        return function(pre) { return (pre ? pre + '.' : 'vor') + uid++; }
    })();

    function make(resolver, canceler, tag) {
        if (typeof resolver === 'object') return env(resolver);
        if (typeof canceler === 'string') tag = canceler, canceler = null;

        var state = STATE_PENDING, queue = [], tagged = tag || tagger(), keep;

        var promise = {
            tag: promiseTag,
            then: promiseThen,
            always: promiseAlways,
            done: promiseDone,
            fail: promiseFail,
            state: promiseState
        };

        if (canceler)
        {
            promise.cancel = promiseCancel
        }

        if (resolver) resolver.call(promise, resolveMe, rejectMe, progressMe);

        return promise;

        function resolveMe(value) {
            if (state !== STATE_PENDING) return;
            try {
                var then = value && value.then,
                    always = value && value.always,
                    done = value && value.done;

                if (typeof then === 'function') { then.call(value, resolveMe, rejectMe, progressMe); return; }
                if (typeof always === 'function') { always.call(value, resolveMe); return; }
                if (typeof done === 'function') { done.call(value, resolveMe); return; }
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
                var then = reason && reason.then,
                    always = reason && reason.always,
                    fail = reason && reason.fail;

                if (typeof then === 'function') { then.call(reason, resolveMe, rejectMe, progressMe); return; }
                if (typeof always === 'function') { always.call(reason, rejectMe); return; }
                if (typeof fail === 'function') { fail.call(reason, rejectMe); return; }
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
        function cancelMe(reason) {
            if (state !== STATE_PENDING) return;
            rejectMe(reason !== empty ? reason : new CancelError());
        }

        function promiseTag() { return tagged; }
        function promiseState() { return STATE_TO_STRING[state]; }
        function promiseCancel() { canceler.call(promise, cancelMe); }
        function promiseFail(onRejected) {
            if (state === STATE_PENDING) {
                return make(function (resolveNext, rejectNext, progressNext) {
                    queue.push([
                        null,
                        chainReject(onRejected, resolveNext, rejectNext, progressNext).bind(null, this)
                    ]);
                }, canceler && promiseCancel, tagger(tag)); // cancel is always the original (propagates through reject)
            } else if (state === STATE_REJECTED) {
                return make(function(resolveNext, rejectNext, progressNext) {
                    task(chainReject(onRejected, resolveNext, rejectNext, progressNext).bind(null, this, keep));
                }, canceler && promiseCancel, tagger(tag)); // cancel is always the original (propagates through reject)
            }
        }
        function promiseAlways(onFulfilledOrRejected) {
            if (state === STATE_PENDING) {
                return make(function (resolveNext, rejectNext, progressNext) {
                    queue.push([
                        chainResolve(onFulfilledOrRejected, resolveNext, rejectNext, progressNext).bind(null, this),
                        chainReject(onFulfilledOrRejected, resolveNext, rejectNext, progressNext).bind(null, this)
                    ]);
                }, canceler && promiseCancel, tagger(tag)); // cancel is always the original (propagates through reject)
            } else if (state === STATE_FULFILLED) {
                return make(function(resolveNext, rejectNext, progressNext) {
                    task(chainResolve(onFulfilledOrRejected, resolveNext, rejectNext, progressNext).bind(null, this, keep));
                }, canceler && promiseCancel, tagger(tag)); // cancel is always the original (propagates through reject)
            } else if (state === STATE_REJECTED) {
                return make(function(resolveNext, rejectNext, progressNext) {
                    task(chainReject(onFulfilledOrRejected, resolveNext, rejectNext, progressNext).bind(null, this, keep));
                }, canceler && promiseCancel, tagger(tag)); // cancel is always the original (propagates through reject)
            }
        }
        function promiseDone(onFulfilled) {
            if (state === STATE_PENDING) {
                return make(function (resolveNext, rejectNext, progressNext) {
                    queue.push([
                        chainResolve(onFulfilled, resolveNext, rejectNext, progressNext).bind(null, this)
                    ]);
                }, canceler && promiseCancel, tagger(tag)); // cancel is always the original (propagates through reject)
            } else if (state === STATE_FULFILLED) {
                return make(function(resolveNext, rejectNext, progressNext) {
                    task(chainResolve(onFulfilled, resolveNext, rejectNext, progressNext).bind(null, this, keep));
                }, canceler && promiseCancel, tagger(tag)); // cancel is always the original (propagates through reject)
            }
        }
        function promiseThen(onFulfilled, onRejected, onProgress) {
            if (state === STATE_PENDING) {
                return make(function (resolveNext, rejectNext, progressNext) {
                    queue.push([
                        chainResolve(onFulfilled, resolveNext, rejectNext, progressNext).bind(null, this),
                        chainReject(onRejected, resolveNext, rejectNext, progressNext).bind(null, this),
                        chainProgress(onProgress, resolveNext, rejectNext, progressNext).bind(null, this)
                    ]);
                }, canceler && promiseCancel, tagger(tag)); // cancel is always the original (propagates through reject)
            } else if (state === STATE_FULFILLED) {
                return make(function(resolveNext, rejectNext, progressNext) {
                    task(chainResolve(onFulfilled, resolveNext, rejectNext, progressNext).bind(null, this, keep));
                }, canceler && promiseCancel, tagger(tag)); // cancel is always the original (propagates through reject)
            } else if (state === STATE_REJECTED) {
                return make(function(resolveNext, rejectNext, progressNext) {
                    task(chainReject(onRejected, resolveNext, rejectNext, progressNext).bind(null, this, keep));
                }, canceler && promiseCancel, tagger(tag)); // cancel is always the original (propagates through reject)
            }
        }
    }

    function Deferred(cancel) {
        if (!(this instanceof Deferred)) return new Deferred(cancel);
        this.promise = make((function deferredResolver(resolveMe, rejectMe, progressMe) {
            this.resolve = resolveMe;
            this.reject = rejectMe;
            this.progress = progressMe;
        }).bind(this), cancel && (function deferredCanceler(cancelMe) {
            cancelMe(cancel(this));
        }).bind(this));
        this.tag = this.promise.tag;
        this.then = this.promise.then;
        this.always = this.promise.always;
        this.done = this.promise.done;
        this.fail = this.promise.fail;
        this.state = this.promise.state;
        if (cancel)
        {
            this.cancel = this.promise.cancel;
        }
    }

    make.Deferred = Deferred;

    function CancelError(message) {
        this.message = message;
        this.name = 'CancelError';
        var err = Error(message);
        this.stack = err.stack;
    }

    CancelError.prototype = Object.create(Error.prototype);
    CancelError.prototype.constructor = CancelError;

    make.CancelError = CancelError;

    function rejected(reason) {
        return make(function(_, reject) { reject(reason); });
    }

    function resolved(value) {
        return make(function(resolve) { resolve(value); });
    }

    function when(valueOrPromise, onFulfilled, onRejected, onProgress) {
        var then = valueOrPromise && valueOrPromise.then;
        if (typeof then === 'function') {
            if (arguments.length > 1) return then.call(valueOrPromise, onFulfilled, onRejected, onProgress);
            return valueOrPromise;
        } else {
            if (arguments.length > 1 && onFulfilled) return resolved(onFulfilled(valueOrPromise));
            return resolved(valueOrPromise);
        }
    }

    function every(objectOrArray) {
        return make(function(resolve, reject) {
            var wait = [], resolved = 0, rejected = 0,
                map = {}, out, i, n;

            if (objectOrArray) {
                if (objectOrArray.splice) {
                    for (i = 0; i < objectOrArray.length; i++) map[wait.push(objectOrArray[i]) - 1] = i;
                    out = [];
                } else {
                    for (n in objectOrArray) if (objectOrArray.hasOwnProperty(n)) map[wait.push(objectOrArray[n]) - 1] = n;
                    out = {};
                }
            }

            if (wait.length > 0) {
                for (i = 0; i < wait.length; i++) (function(slot) {
                    when(wait[slot], function(value) {
                        if (rejected > 0) return;
                        out[map[slot]] = value;
                        if (++resolved == wait.length) resolve(out);
                    }, function(error) {
                        ++rejected, reject(error);
                    });
                })(i);
            }
            else resolve(out);
        });
    }

    make.rejected = rejected;
    make.resolved = resolved;
    make.every = every;
    make.when = when;
    make.task = task;

    if (typeof module != 'undefined' && module.exports) {
        module.exports = make;
    }
    else if (typeof define == 'function' && typeof define.amd == 'object') {
        define(['module'], function (module) { env(module.config && module.config() || {}); return make; });
    }
    else {
        scope.vor = make;
    }
})(this);